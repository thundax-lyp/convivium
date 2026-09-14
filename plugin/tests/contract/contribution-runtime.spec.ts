import { describe, expect, it, vi } from "vitest";
import { createMeetingContributionApplication } from "@/runtime/application-service/meeting-contribution.js";
import { DomainMeetingRepository } from "@/repository/domain/domain-meeting-repository.js";
import { JsonObjectSchema } from "@/repository/domain/schemas.js";
import { loadProjection } from "@/repository/domain/projection.js";
import { createContributionState } from "@/domain/index.js";
import { contributionMeeting, contributionNow as now } from "../fixtures/contribution.js";
import {
    createFakeCatalogDomain,
    createFakeMeetingDomain,
    createFakeDomainFacility
} from "../fixtures/domain-storage.js";
import type { ContributionCommandV1 } from "@/protocol/index.js";
import type { MeetingState } from "@/domain/index.js";
import { ContributionResultSchema } from "@/protocol/index.js";
import { encodeMeetingSessionLabel, resolveMeetingCaller } from "@/dsh/index.js";
import { registerSubmitAndControlTools } from "@/tools/index.js";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { MeetingToolRuntime } from "@/runtime/index.js";
import { createMeetingDeliveryDispatcher } from "@/runtime/services/meeting-dispatch-service.js";
import { createOutboxWorker } from "@/runtime/outbox-worker.js";
import {
    scanContributionTimeouts,
    recordContributionDeliveryFailure
} from "@/runtime/services/contribution-runtime-service.js";

async function fixture(prepare?: (state: MeetingState) => void) {
    const domain = createFakeMeetingDomain();
    const authorizationValidator = { validateCreate() {}, validateCommand() {} };
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: domain,
        meetingId: "meeting-1",
        teamId: "team-1",
        authorizationValidator,
        now: () => now
    });
    const state = contributionMeeting();
    delete state.termination;
    state.participants.push({
        ...state.participants[1]!,
        id: "participant-3",
        displayName: "Reviewer"
    });
    state.contributions = createContributionState("participant-3", now);
    state.meetingTasks = [];
    prepare?.(state);
    const create = {
        requestId: "create",
        requestHash: "create",
        authorization: { callerBinding: "captain:captain-1", capabilityId: "captain:captain-1" },
        initialState: JsonObjectSchema.parse(state)
    };
    await repository.create(create);
    await repository.completeCreate(create);
    for (const [sessionId, role, participantId] of [
        ["manager-1", "manager", undefined],
        ["author-1", "participant", "participant-1"],
        ["author-2", "participant", "participant-2"],
        ["reviewer-1", "participant", "participant-3"]
    ] as const) {
        await repository.recordSessionOwnership(
            {
                sessionId,
                role,
                ...(participantId === undefined ? {} : { participantId }),
                parentSessionId: "captain-1",
                sessionLabel: encodeMeetingSessionLabel(
                    role === "manager"
                        ? { role, meetingId: "meeting-1", teamId: "team-1" }
                        : {
                              role,
                              meetingId: "meeting-1",
                              teamId: "team-1",
                              participantId: participantId!
                          }
                ),
                provider: "fixture",
                lifecycleStatus: "active",
                initialMessageId: `initial-${sessionId}`,
                capabilityStatus: "active"
            },
            now
        );
    }
    const wake = vi.fn();
    const interrupt = vi.fn();
    const application = createMeetingContributionApplication({
        options: {
            storageDomain: createFakeDomainFacility(),
            provider: "fixture",
            authorizationValidator,
            now: () => now,
            continuable: {
                startContinuable: vi.fn(),
                sendMessage: vi.fn(),
                listDescendants: vi.fn(),
                interrupt
            }
        },
        meetings: new Map([
            [
                "meeting-1",
                {
                    captainSessionId: "captain-1",
                    teamId: "team-1",
                    repository,
                    parent: { id: "captain-1" } as Agent
                }
            ]
        ]),
        recovery: { rehydrate: async () => undefined },
        deliveryWorkers: { ensure() {}, wake, async dispose() {} }
    });
    const manager = { kind: "manager" as const, sessionId: "manager-1", meetingId: "meeting-1" };
    const author = {
        kind: "participant" as const,
        sessionId: "author-1",
        meetingId: "meeting-1",
        participantId: "participant-1"
    };
    const signal = new AbortController().signal;
    const assign = (version: number): ContributionCommandV1 => ({
        protocolVersion: 1,
        meetingId: "meeting-1",
        requestId: "assign-1",
        expectedMeetingVersion: version,
        action: "assign",
        participantId: "participant-1",
        agendaItemId: "agenda-1",
        instruction: "Research evidence",
        targetIds: [],
        requiredForCompletion: false,
        requiresEvidenceReview: false
    });
    return { application, repository, domain, wake, interrupt, manager, author, signal, assign };
}

describe("contribution agenda advancement", () => {
    it("commits a single next-agenda notice and interrupts only the cancelled author, without repeating effects on replay", async () => {
        const f = await fixture((state) =>
            state.agenda.push({ ...state.agenda[0]!, id: "agenda-2", status: "pending" })
        );
        try {
            expect(
                await f.application.applyContribution(
                    f.assign((await f.repository.read()).version),
                    f.manager,
                    f.signal
                )
            ).toMatchObject({ ok: true });
            await f.repository.execute({
                requestId: "resolve-fixture",
                commandKind: "fixture",
                requestHash: "resolve-fixture",
                authorization: { callerBinding: "runtime", capabilityId: "runtime" },
                expectedMeetingVersion: (await f.repository.read()).version,
                transition(snapshot) {
                    const state = structuredClone(snapshot.state) as unknown as MeetingState;
                    state.agenda[0]!.status = "resolved";
                    return {
                        state: JsonObjectSchema.parse(state),
                        result: {},
                        events: [],
                        outbox: []
                    };
                }
            });
            const command = {
                protocolVersion: 1 as const,
                meetingId: "meeting-1",
                requestId: "advance",
                expectedMeetingVersion: (await f.repository.read()).version,
                action: "notify_manager" as const,
                reason: "Advance agenda"
            };
            const result = await f.application.controlLocalContribution(command, f.signal);
            expect(result).toMatchObject({ ok: true });
            expect((await f.repository.read()).state.activeAgendaItemId).toBe("agenda-2");
            expect(f.interrupt.mock.calls.map((call) => call[0])).toEqual(["author-1"]);
            const projection = loadProjection({ domain: f.domain });
            const notices = Object.values(projection.outbox).filter(
                (item) => item.payload.role === "contribution_manager"
            );
            expect(notices).toHaveLength(1);
            expect(await f.application.controlLocalContribution(command, f.signal)).toEqual(result);
            expect(loadProjection({ domain: f.domain })).toEqual(projection);
            expect(f.interrupt).toHaveBeenCalledTimes(1);
        } finally {
            await f.repository.close();
        }
    });
});

describe("contribution application transactions", () => {
    it("commits a due timeout once under concurrent scans without repeating dispatch", async () => {
        const f = await fixture();
        try {
            expect(
                await f.application.applyContribution(
                    f.assign((await f.repository.read()).version),
                    f.manager,
                    f.signal
                )
            ).toMatchObject({ ok: true });
            const before = await f.repository.read();
            await scanContributionTimeouts({ repository: f.repository, now: now + 599999 });
            expect((await f.repository.read()).version).toBe(before.version);
            await Promise.all([
                scanContributionTimeouts({ repository: f.repository, now: now + 600000 }),
                scanContributionTimeouts({ repository: f.repository, now: now + 600000 })
            ]);
            const after = await f.repository.read();
            expect(after.version).toBe(before.version + 1);
            expect(
                Object.values((after.state as unknown as MeetingState).contributions!.tasks)[0]
            ).toMatchObject({ phase: "captain_action", generation: 2 });
            const projection = loadProjection({ domain: f.domain });
            await scanContributionTimeouts({ repository: f.repository, now: now + 600000 });
            expect(loadProjection({ domain: f.domain })).toEqual(projection);
        } finally {
            await f.repository.close();
        }
    });
    it("records terminal delivery failure without replaying the callback or undoing the assignment", async () => {
        const f = await fixture();
        try {
            const assign = f.assign((await f.repository.read()).version);
            const assigned = await f.application.applyContribution(assign, f.manager, f.signal);
            expect(assigned).toMatchObject({ ok: true });
            const item = Object.values(loadProjection({ domain: f.domain }).outbox)[0]!;
            await recordContributionDeliveryFailure({
                repository: f.repository,
                item,
                errorCode: "DELIVERY_FAILED",
                now
            });
            expect(
                Object.values(
                    ((await f.repository.read()).state as unknown as MeetingState).contributions!
                        .tasks
                )[0]
            ).toMatchObject({ phase: "captain_action", generation: 2, reason: "DELIVERY_FAILED" });
            const projection = loadProjection({ domain: f.domain });
            await recordContributionDeliveryFailure({
                repository: f.repository,
                item,
                errorCode: "DELIVERY_FAILED",
                now
            });
            expect(loadProjection({ domain: f.domain })).toEqual(projection);
            expect(await f.application.applyContribution(assign, f.manager, f.signal)).toEqual(
                assigned
            );
        } finally {
            await f.repository.close();
        }
    });
    it("commits assignment and dispatch together, replays receipts, rejects CAS and mismatched caller without side effects", async () => {
        const f = await fixture();
        try {
            const initial = await f.repository.read();
            const command = f.assign(initial.version);
            const result = await f.application.applyContribution(command, f.manager, f.signal);
            expect(result).toMatchObject({
                ok: true,
                meetingVersion: initial.version + 1,
                result: { generation: 1, phase: "preparing" }
            });
            const committed = loadProjection({ domain: f.domain });
            expect(Object.values(committed.outbox)).toHaveLength(1);
            expect(Object.values(committed.outbox)[0]).toMatchObject({
                payload: {
                    role: "contribution",
                    purpose: "prepare",
                    generation: 1,
                    draftRevision: 0,
                    contextThroughSeq: 0
                }
            });
            expect(await f.application.applyContribution(command, f.manager, f.signal)).toEqual(
                result
            );
            expect(loadProjection({ domain: f.domain })).toEqual(committed);
            expect(
                await f.application.applyContribution(
                    { ...command, instruction: "different" },
                    f.manager,
                    f.signal
                )
            ).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
            expect(
                await f.application.applyContribution(
                    { ...command, requestId: "new" },
                    f.manager,
                    f.signal
                )
            ).toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
            expect(
                await f.application.applyContribution(
                    command,
                    { ...f.manager, sessionId: "forged" },
                    f.signal
                )
            ).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
            expect(
                await f.application.applyContribution(
                    command,
                    { ...f.author, participantId: "participant-2" },
                    f.signal
                )
            ).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
            expect(loadProjection({ domain: f.domain })).toEqual(committed);
        } finally {
            await f.repository.close();
        }
    });

    it("keeps aborted and failed commands out of state, events, receipts and outbox; reads only the bound task", async () => {
        const f = await fixture();
        try {
            const version = (await f.repository.read()).version;
            const before = loadProjection({ domain: f.domain });
            const aborted = AbortSignal.abort(new Error("cancelled"));
            expect(
                await f.application.applyContribution(f.assign(version), f.manager, aborted)
            ).toMatchObject({ ok: false });
            f.domain.failNextPut("commits", "*");
            expect(
                await f.application.applyContribution(f.assign(version), f.manager, f.signal)
            ).toMatchObject({ ok: false });
            expect(f.wake).not.toHaveBeenCalled();
            expect(loadProjection({ domain: f.domain })).toEqual(before);
            const result = await f.application.applyContribution(
                f.assign(version),
                f.manager,
                f.signal
            );
            if (!result.ok || !("contributionId" in result.result))
                throw new Error("Assignment failed");
            const input = {
                protocolVersion: 1 as const,
                meetingId: "meeting-1",
                contributionId: result.result.contributionId
            };
            const committed = loadProjection({ domain: f.domain });
            expect(await f.application.readContribution(input, f.author, f.signal)).toMatchObject({
                ok: true,
                result: { drafts: [], boundaryReviews: [], evidenceReviews: [] }
            });
            expect(
                await f.application.readContribution(
                    input,
                    {
                        kind: "participant",
                        sessionId: "reviewer-1",
                        meetingId: "meeting-1",
                        participantId: "participant-3"
                    },
                    f.signal
                )
            ).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
            expect(await f.application.readLocalContribution(input, f.signal)).toMatchObject({
                ok: true
            });
            expect(loadProjection({ domain: f.domain })).toEqual(committed);
        } finally {
            await f.repository.close();
        }
    });
});

describe("contribution tool concurrency", () => {
    it("delivers B and commits its exact draft while A is researching, then rejects cancelled A and replays publication", async () => {
        const f = await fixture();
        const definitions: ToolDefinition[] = [];
        const signal = f.signal;
        const lookup = {
            async findBySessionId(sessionId: string) {
                const ownership = (await f.repository.recover()).sessionOwnership.find(
                    (v) => v.sessionId === sessionId
                );
                return ownership === undefined
                    ? undefined
                    : { teamId: "team-1", meetingId: "meeting-1", ownership };
            }
        };
        registerSubmitAndControlTools({
            registry: {
                register: (definition) => {
                    definitions.push(definition);
                    return () => undefined;
                }
            },
            runtime: f.application as MeetingToolRuntime,
            callers: { resolve: (agent, abort) => resolveMeetingCaller(agent, lookup, abort) }
        });
        const tool = definitions.find((v) => v.name === "convivium_contribution")!;
        async function invoke(input: object, sessionId: string): Promise<unknown> {
            return tool.execute!({ input: JsonObjectSchema.parse(input) }, {
                agent: { id: sessionId } as Agent,
                signal
            } as ToolRunContext);
        }
        function id(result: unknown): string {
            if (!result || typeof result !== "object" || !("result" in result))
                throw new Error("Expected successful contribution result");
            const parsed = ContributionResultSchema(result.result);
            if (!("contributionId" in parsed)) throw new Error("Missing contribution ID");
            return parsed.contributionId;
        }
        const command = async (requestId: string) => ({
            protocolVersion: 1,
            meetingId: "meeting-1",
            requestId,
            expectedMeetingVersion: (await f.repository.read()).version
        });
        let releaseA!: () => void, releaseB!: () => void;
        const researchA = new Promise<void>((resolve) => {
            releaseA = resolve;
        });
        const admissionB = new Promise<void>((resolve) => {
            releaseB = resolve;
        });
        let aWork: Promise<unknown> | undefined,
            bWork: Promise<unknown> | undefined,
            aReturned = false;
        const received: string[] = [];
        let worker: ReturnType<typeof createOutboxWorker> | undefined;
        try {
            const assignment = {
                action: "assign",
                agendaItemId: "agenda-1",
                instruction: "Research",
                targetIds: [],
                requiredForCompletion: false,
                requiresEvidenceReview: false
            };
            const a = id(
                await invoke(
                    {
                        ...(await command("assign-a")),
                        ...assignment,
                        participantId: "participant-1"
                    },
                    "manager-1"
                )
            );
            const b = id(
                await invoke(
                    {
                        ...(await command("assign-b")),
                        ...assignment,
                        participantId: "participant-2"
                    },
                    "manager-1"
                )
            );
            const submit = async (contributionId: string, sessionId: string, text: string) =>
                invoke(
                    {
                        ...(await command(`submit-${sessionId}`)),
                        action: "submit",
                        contributionId,
                        generation: 1,
                        expectedDraftRevision: 0,
                        basedOnSeq: 0,
                        citations: [],
                        body: {
                            kind: "statement",
                            content: text,
                            mentions: [],
                            taskIds: [],
                            agendaRelation: "on_topic",
                            changes: {}
                        }
                    },
                    sessionId
                );
            const sendMessage = vi.fn(async (_parent, sessionId: string) => {
                received.push(sessionId);
                if (sessionId === "author-1")
                    aWork = researchA.then(async () => {
                        aReturned = true;
                        return submit(a, "author-1", "late A");
                    });
                if (sessionId === "author-2")
                    bWork = admissionB.then(() => submit(b, "author-2", "exact B statement"));
                return "DSH accepted";
            });
            const dispatcher = createMeetingDeliveryDispatcher({
                continuable: { sendMessage },
                now: () => now
            });
            worker = createOutboxWorker({
                repository: f.repository,
                owner: "contribution-worker",
                ttlMs: 10000,
                batchSize: 8,
                pollMs: 1000,
                now: () => now,
                dispatch: (item, abort) =>
                    dispatcher.dispatch({
                        repository: f.repository,
                        parent: { id: "captain-1" } as Agent,
                        meetingId: "meeting-1",
                        signal: abort,
                        item
                    })
            });
            expect(await worker.runOnce()).toMatchObject({ delivered: 2 });
            expect([...received].sort()).toEqual(["author-1", "author-2"]);
            expect(aWork).toBeDefined();
            expect(bWork).toBeDefined();
            expect(aReturned).toBe(false);
            releaseB();
            expect(await bWork).toMatchObject({
                ok: true,
                result: { phase: "boundary_review", draftRevision: 1 }
            });
            expect(aReturned).toBe(false);
            const draftSnapshot = (await f.repository.read()).state;
            expect(draftSnapshot.transcript).toEqual([]);
            expect(await worker.runOnce()).toMatchObject({ delivered: 1 });
            expect([...received].sort()).toEqual(["author-1", "author-2", "manager-1"]);
            const approval = {
                ...(await command("approve-b")),
                action: "boundary_review",
                contributionId: b,
                generation: 1,
                draftRevision: 1,
                decision: "approve",
                reason: "Within scope",
                checkedThroughSeq: 0
            };
            const published = await invoke(approval, "manager-1");
            expect(published).toMatchObject({
                ok: true,
                result: { phase: "published", draftRevision: 1, messageId: `message-${b}-1` }
            });
            const after = loadProjection({ domain: f.domain });
            expect(await invoke(approval, "manager-1")).toEqual(published);
            expect(loadProjection({ domain: f.domain })).toEqual(after);
            expect((await f.repository.read()).state.transcript).toMatchObject([
                {
                    id: `message-${b}-1`,
                    content: "exact B statement",
                    contributionId: b,
                    contributionRevision: 1
                }
            ]);
            expect(
                await f.application.controlLocalContribution(
                    {
                        ...(await command("cancel-a")),
                        protocolVersion: 1,
                        action: "cancel",
                        contributionId: a,
                        generation: 1,
                        reason: "No longer needed"
                    },
                    signal
                )
            ).toMatchObject({ ok: true });
            const cancelled = loadProjection({ domain: f.domain });
            releaseA();
            expect(await aWork).toMatchObject({ ok: false, code: "STALE_ATTEMPT" });
            expect(loadProjection({ domain: f.domain })).toEqual(cancelled);
            expect(
                await invoke({ ...approval, requestId: "forged" }, "unknown-session")
            ).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
        } finally {
            releaseA();
            releaseB();
            await Promise.allSettled([aWork, bWork]);
            worker?.stop();
            await worker?.wait();
            await f.repository.close();
        }
    });
});
