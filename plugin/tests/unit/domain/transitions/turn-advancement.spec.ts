import { questionState, proposalWithBlockingPosition } from "./fixtures.js";
import { describe, expect, it } from "vitest";
import {
    advanceAfterSpeakerSubmission,
    createProgressFingerprint,
    hasBlockingDisagreement
} from "@/domain/transitions/turn-advancement.js";
import { meeting, now } from "./fixtures.js";

function runningMeeting(selectionMode: "rule_based" | "manager" = "rule_based") {
    const state = meeting("running");
    state.selectionMode = selectionMode;
    state.limits.speakerAttemptTimeoutMs = 100;
    state.participants = [
        {
            id: "participant-1",
            displayName: "One",
            status: "available",
            consecutiveSpeeches: 0,
            consecutiveAttemptFailures: 0,
            totalSpeeches: 0,
            lastDeliveredSeq: 0,
            lastAcknowledgedSeq: 0
        }
    ];
    state.agenda = [
        {
            id: "agenda-1",
            title: "Agenda",
            objective: "Discuss",
            inScope: [],
            outOfScope: [],
            completionCriteria: ["output-1"],
            requiredParticipants: ["participant-1"],
            relatedTaskIds: [],
            status: "discussing"
        }
    ];
    state.activeAgendaItemId = "agenda-1";
    state.objectiveContract.requiredOutputs = [
        { id: "output-1", description: "Output", status: "pending" }
    ];
    state.currentTurn = {
        id: "turn-1",
        seq: 1,
        agendaItemId: "agenda-1",
        intent: "explore",
        objective: "Discuss",
        expectedOutputs: ["output-1"],
        prohibitedTopics: [],
        plan: ["participant-1"],
        status: "completed",
        currentStepIndex: 1,
        steps: [],
        createdAt: now - 10,
        completedAt: now
    };
    state.turnSeq = 1;
    return state;
}

function finishTurn(state: ReturnType<typeof runningMeeting>, at: number) {
    const submittedState = {
        ...state,
        version: state.version + 1,
        participants: state.participants.map((participant) => ({
            ...participant,
            status: "available" as const
        })),
        currentTurn: { ...state.currentTurn!, status: "completed" as const, completedAt: at }
    };
    return advanceAfterSpeakerSubmission(
        state,
        "participant-1",
        {
            attemptId: `attempt-${state.turnSeq}`,
            agendaItemId: "agenda-1",
            now: at,
            nextPlanningAttemptId: `meeting-1-planning-${state.managerPlanningSeq + 1}`,
            nextPlanningDeliveryId: `meeting-1-planning-delivery-${state.managerPlanningSeq + 1}`,
            catalogBinding: { kind: "none" }
        },
        { state: submittedState, effect: { events: [] } }
    );
}

describe("convergence progress fingerprint", () => {
    it("ignores continuation materials but detects agenda resolution changes", () => {
        const state = meeting();
        state.agenda = [
            {
                id: "agenda-1",
                title: "Agenda",
                objective: "Objective",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipants: [],
                relatedTaskIds: [],
                status: "discussing"
            }
        ];
        state.activeAgendaItemId = "agenda-1";
        state.meetingTasks = [];
        const first = createProgressFingerprint(state);
        state.continuationMaterials = [
            {
                sourceMeetingId: "meeting-0",
                sourceKind: "evidence",
                summary: "ignored"
            }
        ];
        expect(createProgressFingerprint(state)).toBe(first);
        state.agenda[0]!.resolution = "resolved";
        expect(createProgressFingerprint(state)).not.toBe(first);
    });

    it.each([
        { meetingTaskId: "task-renamed" },
        { status: "failed" as const },
        { resultSummary: "New evidence" }
    ])("detects terminal task progress %j independent of task order", (change) => {
        const state = meeting();
        state.meetingTasks = ["task-b", "task-a"].map((meetingTaskId) => ({
            meetingTaskId,
            participantId: "participant-1",
            originatingSpeakerAttemptId: "attempt-1",
            title: "Inspect evidence",
            description: "Inspect the current proposal",
            blocking: false,
            status: "completed",
            createdAt: now - 2,
            finishedAt: now - 1,
            resultSummary: "Original evidence"
        }));
        const before = createProgressFingerprint(state);
        const reordered = { ...state, meetingTasks: [...state.meetingTasks].reverse() };
        expect(createProgressFingerprint(reordered)).toBe(before);
        const changed = {
            ...state,
            meetingTasks: [{ ...state.meetingTasks[0]!, ...change }, state.meetingTasks[1]!]
        };
        expect(createProgressFingerprint(changed)).not.toBe(before);
    });

    it.each([
        { id: "fact-renamed" },
        { kind: "criterion_evidence" as const },
        { subjectId: "output-2" },
        { result: "approved" as const },
        { evidenceMessageIds: ["message-c"] },
        { taskIds: ["task-c"] }
    ])("detects active completion fact progress %j independent of reference order", (change) => {
        const state = meeting();
        state.completionFacts = ["fact-b", "fact-a"].map((id) => ({
            id,
            kind: "output_evidence",
            subjectId: "output-1",
            assertedBy: "participant-1",
            result: "supported",
            status: "active",
            evidenceMessageIds: ["message-b", "message-a"],
            taskIds: ["task-b", "task-a"],
            createdAt: now
        }));
        const before = createProgressFingerprint(state);
        const reordered = {
            ...state,
            completionFacts: [...state.completionFacts].reverse().map((fact) => ({
                ...fact,
                evidenceMessageIds: [...fact.evidenceMessageIds].reverse(),
                taskIds: [...fact.taskIds].reverse()
            }))
        };
        expect(createProgressFingerprint(reordered)).toBe(before);
        const changed = {
            ...state,
            completionFacts: [
                { ...state.completionFacts[0]!, ...change },
                state.completionFacts[1]!
            ]
        };
        expect(createProgressFingerprint(changed)).not.toBe(before);
    });

    it("detects only current open blocking questions and positions", () => {
        const state = meeting();
        state.openQuestions = [
            {
                id: "question-1",
                text: "Blocking",
                askedBy: "participant-1",
                agendaItemId: "agenda-1",
                blocking: true,
                affectedOutputIds: [],
                affectedCriterionIds: [],
                violatedConstraintIds: [],
                status: "open",
                createdAt: now
            }
        ];
        expect(hasBlockingDisagreement(state)).toBe(true);
        state.openQuestions[0]!.status = "answered";
        expect(hasBlockingDisagreement(state)).toBe(false);
    });
});

describe("convergence turn advancement", () => {
    it("resets both counters for a new proposal and can stall again", () => {
        const first = finishTurn(runningMeeting(), now);
        const refocus = finishTurn(first.state as ReturnType<typeof runningMeeting>, now + 1);
        const replan = finishTurn(refocus.state as ReturnType<typeof runningMeeting>, now + 2);
        const progressed = structuredClone(replan.state) as ReturnType<typeof runningMeeting>;
        progressed.proposals.push({
            id: "proposal-1",
            title: "New progress",
            description: "After replan",
            proposedBy: "participant-1",
            revision: 1,
            status: "draft",
            agendaItemId: "agenda-1",
            positions: [],
            createdAt: now + 3,
            updatedAt: now + 3
        });
        const reset = finishTurn(progressed, now + 3);
        expect(reset.state).toMatchObject({ status: "running", stallCount: 0, replanCount: 0 });
        const again = finishTurn(reset.state as ReturnType<typeof runningMeeting>, now + 4);
        expect(again.state).toMatchObject({ stallCount: 1, replanCount: 0 });
        const replanned = finishTurn(again.state as ReturnType<typeof runningMeeting>, now + 5);
        expect(replanned.state).toMatchObject({ stallCount: 2, replanCount: 1 });
        const terminal = finishTurn(replanned.state as ReturnType<typeof runningMeeting>, now + 6);
        expect(terminal.state).toMatchObject({
            status: "partial",
            termination: { code: "stalled" }
        });
        expect(terminal.state.proposals[0]?.id).toBe("proposal-1");
    });

    it.each(["turn", "message"] as const)(
        "prioritizes business completion at the %s budget boundary",
        (budget) => {
            const state = runningMeeting();
            if (budget === "turn") state.limits.maxTurns = state.turnSeq;
            else state.messageSeq = state.limits.maxTotalMessages;
            const incomplete = finishTurn(state, now);
            expect(incomplete.state).toMatchObject({
                status: "partial",
                termination: { code: budget === "turn" ? "max_turns" : "message_limit" }
            });
            state.objectiveContract.requiredOutputs[0]!.status = "accepted";
            state.agenda[0]!.status = "resolved";
            const completed = finishTurn(state, now);
            expect(completed.state.status).toBe("converging");
            expect(completed.state.currentTurn).toBeUndefined();
            expect(completed.state.termination).toBeUndefined();
        }
    );

    it("persists the first fingerprint, refocuses, replans once, then terminates stalled", () => {
        const first = finishTurn(runningMeeting(), now);
        expect(first.state).toMatchObject({ stallCount: 0, replanCount: 0 });
        expect(first.state.progressFingerprint).toBeTypeOf("string");
        expect(first.state.currentTurn?.reason).toBeUndefined();
        expect(createProgressFingerprint(first.state)).toBe(first.state.progressFingerprint);

        const refocus = finishTurn(first.state as ReturnType<typeof runningMeeting>, now + 1);
        expect(refocus.state).toMatchObject({ stallCount: 1, replanCount: 0 });
        expect(refocus.state.currentTurn).toMatchObject({ intent: "refocus", reason: "refocus" });

        const replan = finishTurn(refocus.state as ReturnType<typeof runningMeeting>, now + 2);
        expect(replan.state).toMatchObject({ stallCount: 2, replanCount: 1 });
        expect(replan.state.currentTurn).toMatchObject({ intent: "refocus", reason: "replan" });

        const terminal = finishTurn(replan.state as ReturnType<typeof runningMeeting>, now + 3);
        expect(terminal.state).toMatchObject({
            status: "partial",
            stallCount: 3,
            replanCount: 1,
            termination: { code: "stalled", reason: "stalled", finalMessage: "stalled" }
        });
        expect(terminal.state.currentTurn).toBeUndefined();
        expect(terminal.effect.events.at(-1)?.type).toBe("meeting.ended");
    });

    it("terminates no_consensus when the exhausted state retains blocking disagreement", () => {
        const state = runningMeeting();
        state.progressFingerprint = createProgressFingerprint(state);
        state.stallCount = 2;
        state.replanCount = 1;
        state.openQuestions = [
            {
                id: "question-1",
                text: "Blocking",
                askedBy: "participant-1",
                agendaItemId: "agenda-1",
                blocking: true,
                affectedOutputIds: [],
                affectedCriterionIds: [],
                violatedConstraintIds: [],
                status: "open",
                createdAt: now
            }
        ];
        state.progressFingerprint = createProgressFingerprint(state);

        const terminal = finishTurn(state, now + 1);
        expect(terminal.state).toMatchObject({
            status: "no_consensus",
            termination: {
                code: "no_consensus",
                unresolvedQuestionIds: ["question-1"]
            }
        });
    });

    it("uses managerPlanningSeq for ordinary Manager planning without spending replan budget", () => {
        const state = runningMeeting("manager");
        state.managerPlanningSeq = 4;
        const result = finishTurn(state, now);

        expect(result.state.managerPlanningSeq).toBe(5);
        expect(result.state.replanCount).toBe(0);
        expect(result.state.manager.currentPlanningAttempt).toMatchObject({
            id: "meeting-1-planning-5",
            deliveryId: "meeting-1-planning-delivery-5",
            reason: "next_turn"
        });
    });

    it("waits with sorted overflow required Participants instead of making a partial plan", () => {
        const state = runningMeeting();
        state.limits.maxSpeakersPerTurn = 1;
        state.participants.push({
            ...state.participants[0]!,
            id: "participant-2",
            displayName: "Two"
        });
        state.agenda[0]!.requiredParticipants = ["participant-2", "participant-1"];

        const result = finishTurn(state, now);
        expect(result.state).toMatchObject({
            status: "waiting",
            waitState: {
                reason: "required_participant_unavailable",
                participantIds: ["participant-2"],
                taskIds: []
            }
        });
        expect(result.state.currentTurn).toMatchObject({ id: "turn-1", status: "completed" });
        expect(result.effect.events.map((event) => event.type)).toEqual(["meeting.waiting"]);
    });
});

describe("canonical progress fingerprint", () => {
    it("canonicalizes positions within each proposal independent of input order", () => {
        const state = questionState();
        const a = proposalWithBlockingPosition("a", "participant-1");
        a.positions = [
            ...a.positions,
            { ...a.positions[0]!, id: "pos-b", participantId: "participant-2" }
        ];
        state.proposals = [a, proposalWithBlockingPosition("b", "participant-2")];
        const before = createProgressFingerprint(state);
        state.proposals.reverse();
        a.positions = [...a.positions].reverse();
        expect(createProgressFingerprint(state)).toBe(before);
        a.positions[0]!.blocking = false;
        expect(createProgressFingerprint(state)).not.toBe(before);
    });
});
