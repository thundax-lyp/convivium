import { describe, expect, it, vi } from "vitest";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    applyContributionCommand,
    createContributionState,
    type ContributionTask
} from "@/domain/index.js";
import type { OutboxItem, SessionOwnership } from "@/repository/types.js";
import type { MeetingRepositoryRuntime } from "@/runtime/meeting-runtime.js";
import { createMeetingDeliveryDispatcher } from "@/runtime/services/meeting-dispatch-service.js";
import { createOutboxWorker } from "@/runtime/outbox-worker.js";
import { contributionOutbox } from "@/runtime/services/contribution-runtime-service.js";
import {
    boundaryReviewState,
    captainContext,
    contributionMeeting,
    contributionNow as now,
    managerContext,
    withNewPublicMessage
} from "../../fixtures/contribution.js";

function gate() {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { wait, release };
}

function fixture() {
    const state = contributionMeeting();
    state.meetingTasks = [];
    state.contributions = createContributionState("participant-2", now);
    state.contributions.managerNoticeSeq = 1;
    const tasks: Record<string, ContributionTask> = {};
    for (const participantId of ["participant-1", "participant-2"]) {
        const id = `task-${participantId}`;
        tasks[id] = {
            id,
            participantId,
            agendaItemId: "agenda-1",
            instruction: "Prepare independently",
            targetIds: [],
            requiredForCompletion: false,
            requiresEvidenceReview: false,
            phase: "preparing",
            generation: 1,
            basedOnSeq: 0,
            deadlineAt: now + 600000,
            createdAt: now,
            updatedAt: now,
            currentDraftRevision: 0,
            returnCount: 0,
            drafts: {},
            boundaryReviews: [],
            evidenceReviews: [],
            reviewStatus: "not_required"
        };
    }
    state.contributions.tasks = tasks;
    const ownerships: SessionOwnership[] = ["participant-1", "participant-2", "manager"].map(
        (id) => ({
            sessionId: `session-${id}`,
            parentSessionId: "captain-1",
            sessionLabel: id,
            provider: "fixture",
            role: id === "manager" ? "manager" : "participant",
            ...(id === "manager" ? {} : { participantId: id }),
            lifecycleStatus: "active",
            capabilityStatus: "active",
            createdAt: now,
            updatedAt: now
        })
    );
    const repository = {
        recover: async () => ({ snapshot: { state }, sessionOwnership: ownerships }),
        read: async () => ({ state })
    } as unknown as MeetingRepositoryRuntime;
    const parent = { id: "captain-1" } as Agent;
    const signal = new AbortController().signal;
    const item = (id: string): OutboxItem => ({
        id: `outbox-${id}`,
        deliveryId: id === "manager" ? "meeting-1:manager:1" : `task-${id}:1:prepare:0:0`,
        kind: "dispatch",
        priority: 1,
        attempts: 1,
        leaseOwner: "worker",
        leaseToken: "lease",
        leaseDeadline: now + 1000,
        payload:
            id === "manager"
                ? { role: "contribution_manager", noticeSeq: 1, contextThroughSeq: 0 }
                : {
                      role: "contribution",
                      contributionId: `task-${id}`,
                      generation: 1,
                      purpose: "prepare",
                      draftRevision: 0,
                      contextThroughSeq: 0
                  }
    });
    return {
        state,
        ownerships,
        item,
        input: { repository, parent, signal, meetingId: "meeting-1" }
    };
}

describe("contribution dispatch authorization and queues", () => {
    it("delivers the latest public Transcript bound after return and private retry", () => {
        const before = withNewPublicMessage(boundaryReviewState());
        const returned = applyContributionCommand(
            before,
            {
                action: "boundary_review",
                contributionId: "contribution-1",
                generation: 1,
                draftRevision: 1,
                decision: "return",
                reason: "New public context.",
                checkedThroughSeq: 1
            },
            managerContext()
        );
        expect(contributionOutbox(before, returned.state, returned.effect.events)).toMatchObject([
            { payload: { purpose: "prepare", contextThroughSeq: 1 } }
        ]);
        const cancelled = {
            ...before,
            contributions: {
                ...before.contributions!,
                tasks: {
                    ...before.contributions!.tasks,
                    "contribution-1": {
                        ...before.contributions!.tasks["contribution-1"]!,
                        phase: "cancelled" as const
                    }
                }
            }
        };
        const retried = applyContributionCommand(
            cancelled,
            { action: "retry", contributionId: "contribution-1", generation: 1, reason: "Retry." },
            captainContext()
        );
        expect(contributionOutbox(cancelled, retried.state, retried.effect.events)).toContainEqual(
            expect.objectContaining({
                payload: expect.objectContaining({ purpose: "prepare", contextThroughSeq: 1 })
            })
        );
    });

    it("labels Participant and Manager context messages for deterministic consumers", async () => {
        const f = fixture();
        const sendMessage = vi.fn(async () => "accepted");
        const dispatcher = createMeetingDeliveryDispatcher({
            continuable: { sendMessage },
            now: () => now
        });
        await dispatcher.dispatch({ ...f.input, item: f.item("participant-1") });
        await dispatcher.dispatch({ ...f.input, item: f.item("manager") });
        expect(sendMessage.mock.calls[0]![2][0].text).toMatch(/^contribution context: /);
        expect(sendMessage.mock.calls[1]![2][0].text).toMatch(/^contribution manager context: /);
    });

    it("serializes actual Session sends while a different Session proceeds independently", async () => {
        const f = fixture();
        const entered = gate(),
            release = gate();
        const calls: string[] = [];
        const sendMessage = vi.fn(async (_parent, sessionId: string) => {
            calls.push(sessionId);
            if (calls.length === 1) {
                entered.release();
                await release.wait;
            }
            return "accepted";
        });
        const dispatcher = createMeetingDeliveryDispatcher({
            continuable: { sendMessage },
            now: () => now
        });
        const first = dispatcher.dispatch({ ...f.input, item: f.item("participant-1") });
        await entered.wait;
        const second = dispatcher.dispatch({ ...f.input, item: f.item("participant-1") });
        try {
            await dispatcher.dispatch({ ...f.input, item: f.item("participant-2") });
            expect(calls).toEqual(["session-participant-1", "session-participant-2"]);
        } finally {
            release.release();
            await Promise.all([first, second]);
        }
        expect(calls).toEqual([
            "session-participant-1",
            "session-participant-2",
            "session-participant-1"
        ]);
    });

    it("queues Manager notices and silently consumes an obsolete notice", async () => {
        const f = fixture();
        const entered = gate(),
            release = gate();
        const sendMessage = vi.fn(async () => {
            entered.release();
            await release.wait;
            return "accepted";
        });
        const dispatcher = createMeetingDeliveryDispatcher({
            continuable: { sendMessage },
            now: () => now
        });
        const first = dispatcher.dispatch({ ...f.input, item: f.item("manager") });
        await entered.wait;
        const obsolete = f.item("manager");
        obsolete.payload.noticeSeq = 0;
        await dispatcher.dispatch({ ...f.input, item: obsolete });
        const second = dispatcher.dispatch({ ...f.input, item: f.item("manager") });
        expect(sendMessage).toHaveBeenCalledTimes(1);
        release.release();
        await Promise.all([first, second]);
        expect(sendMessage).toHaveBeenCalledTimes(2);
    });

    it.each(["stale", "failure", "revoked"])(
        "does not acknowledge %s delivery as accepted",
        async (failure) => {
            const f = fixture();
            const item = f.item("participant-1");
            if (failure === "stale") item.payload.generation = 2;
            const sendMessage = vi.fn(async () => {
                if (failure === "failure") throw new Error("DSH admission failed");
                if (failure === "revoked") f.ownerships[0]!.capabilityStatus = "revoked";
                return "accepted";
            });
            const dispatcher = createMeetingDeliveryDispatcher({
                continuable: { sendMessage },
                now: () => now
            });
            const completeOutbox = vi.fn(async ({ id, completion }) => ({
                id,
                status: completion.status
            }));
            const worker = createOutboxWorker({
                repository: { claimOutbox: async () => [item], completeOutbox },
                owner: "worker",
                ttlMs: 1000,
                batchSize: 1,
                pollMs: 1000,
                now: () => now,
                dispatch: (selected) => dispatcher.dispatch({ ...f.input, item: selected })
            });
            try {
                expect((await worker.runOnce()).delivered).toBe(0);
                expect(completeOutbox.mock.calls[0]?.[0].completion.status).not.toBe("delivered");
                if (failure === "stale") {
                    expect(sendMessage).not.toHaveBeenCalled();
                    expect(completeOutbox.mock.calls[0]?.[0].completion).toMatchObject({
                        status: "failed",
                        errorCode: "STALE_ATTEMPT"
                    });
                } else expect(sendMessage).toHaveBeenCalledTimes(1);
            } finally {
                worker.stop();
                await worker.wait();
            }
        }
    );
});
