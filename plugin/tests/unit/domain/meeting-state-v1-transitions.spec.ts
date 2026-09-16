import { describe, expect, it } from "vitest";
import type { MeetingState } from "@/domain/meeting-state-v1.js";
import { transitionMeetingStateV1 } from "@/domain/meeting-state-v1-transitions.js";

function state(status: MeetingState["lifecycle"]["status"] = "running"): MeetingState {
    return {
        id: "meeting-1",
        version: 3,
        createdAt: 0,
        updatedAt: 3,
        objective: {
            statement: "objective",
            requiredOutputs: [{ id: "output-1", text: "output", status: "pending" }],
            acceptanceCriteria: [{ id: "criterion-1", text: "criterion", status: "pending" }],
            hardConstraints: [{ id: "constraint-1", text: "constraint", status: "pending" }],
            acceptableRiskLevel: "medium"
        },
        lifecycle: { status, changedAt: 3, changedBy: "local-1", reason: "previous" },
        identities: [
            {
                id: "identity-1",
                displayName: "Captain",
                roles: ["captain"],
                agendaResponsibilityIds: [],
                reviewResponsibilityIds: [],
                riskAuthority: false,
                required: false
            }
        ],
        agenda: [
            {
                id: "agenda-1",
                title: "agenda",
                question: "question",
                status: "active",
                requiredOutputIds: ["output-1"],
                requiredReviewerIds: []
            }
        ],
        agendaCandidates: [],
        rounds: [],
        contributions: [],
        completionDeclarations: [],
        evidencePackages: [],
        registrations: [],
        reviews: [],
        reviewDeliveries: [],
        publications: [],
        messages: [],
        proposals: [],
        positions: [],
        decisionCandidates: [],
        decisions: [],
        questions: [],
        issues: [],
        riskDispositions: [],
        tasks: [],
        managerPlans: [],
        privateMails: [],
        completionFacts: [],
        limits: {
            maxFormalMessages: 0,
            maxDurationMs: 0,
            taskDeadlineMs: 0,
            reviewDeadlineMs: 0,
            responseDeadlineMs: 60000
        }
    };
}

const local = { kind: "local_controller", id: "local-1" } as const;
const identity = { kind: "identity", id: "identity-1" } as const;

function terminalState(status: "terminal" | "archiving" | "archived"): MeetingState {
    const current = state(status);
    current.termination = {
        id: "termination-1",
        outcome: "completed",
        reason: "done",
        endedAt: 3,
        decisionIds: [],
        completionFactIds: [],
        unresolvedQuestionIds: [],
        unresolvedIssueIds: [],
        unclosedContributionIds: []
    };
    if (status !== "terminal")
        current.archive = {
            id: "archive-1",
            createdAt: 3,
            createdBy: "identity-1",
            terminationId: "termination-1",
            publicSnapshotVersion: 3,
            includedPublicationIds: [],
            includedDecisionIds: [],
            includedCompletionFactIds: [],
            status: status === "archived" ? "complete" : "pending"
        };
    return current;
}

describe("meeting lifecycle transitions", () => {
    it.each([
        ["pause running", "pause_meeting", "running", "paused"],
        ["resume paused", "resume_meeting", "paused", "running"]
    ] as const)("accepts %s", (_name, kind, from, to) => {
        const current = state(from);
        const result = transitionMeetingStateV1(
            current,
            { kind, reason: "operator request" },
            local,
            10,
            "fact-1"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state).toEqual({
            ...current,
            version: 4,
            updatedAt: 10,
            lifecycle: {
                ...current.lifecycle,
                status: to,
                changedAt: 10,
                changedBy: "local-1",
                reason: "operator request"
            }
        });
        expect(result.facts).toEqual([
            {
                id: "fact-1",
                kind,
                actorId: "local-1",
                occurredAt: 10,
                relatedIds: ["meeting-1"],
                payload: { kind: "references", relatedIds: ["meeting-1"] }
            }
        ]);
    });

    it.each([
        ["identity actor", identity, "running", "UNAUTHORIZED"],
        ["wrong lifecycle", local, "preparing", "INVALID_STATE"]
    ] as const)("rejects %s without changing the state", (_name, actor, status, code) => {
        const current = state(status);
        const result = transitionMeetingStateV1(
            current,
            { kind: "pause_meeting", reason: "pause" },
            actor,
            10,
            "fact-1"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it.each(["terminal", "archiving", "archived"] as const)(
        "rejects %s without changing the state",
        (status) => {
            const current = terminalState(status);
            const result = transitionMeetingStateV1(
                current,
                { kind: "pause_meeting", reason: "pause" },
                local,
                10,
                "fact-1"
            );
            expect(result).toEqual({
                kind: "rejected",
                state: current,
                code: "MEETING_TERMINAL",
                facts: []
            });
            expect(result.state).toBe(current);
            expect(result.state.version).toBe(3);
        }
    );

    it.each([
        ["empty reason", { kind: "pause_meeting", reason: " " }, local, 10, "fact-1"],
        ["invalid time", { kind: "pause_meeting", reason: "pause" }, local, -1, "fact-1"],
        ["invalid fact", { kind: "pause_meeting", reason: "pause" }, local, 10, " "]
    ] as const)("rejects %s as invalid argument", (_name, action, actor, now, factId) => {
        const current = state();
        const result = transitionMeetingStateV1(current, action, actor, now, factId);
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "INVALID_ARGUMENT",
            facts: []
        });
    });

    it("rejects future actions until their transition step is implemented", () => {
        const current = state();
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "activate_agenda",
                agendaId: "agenda-1",
                previousDisposition: "closed",
                reason: "activate"
            },
            local,
            10,
            "fact-1"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "INVALID_ARGUMENT",
            facts: []
        });
    });
});
