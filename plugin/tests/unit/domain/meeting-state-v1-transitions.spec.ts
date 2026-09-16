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
const captain = identity;
const nonCaptain = { kind: "identity", id: "identity-2" } as const;

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

    it("requires a Captain identity for agenda activation", () => {
        const fixture = state();
        const current = {
            ...fixture,
            agenda: [
                ...fixture.agenda,
                {
                    id: "agenda-2",
                    title: "next",
                    question: "next question",
                    status: "pending" as const,
                    requiredOutputIds: ["output-1"],
                    requiredReviewerIds: []
                }
            ]
        };
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "activate_agenda",
                agendaId: "agenda-2",
                previousDisposition: "closed",
                reason: "move on"
            },
            nonCaptain,
            10,
            "fact-2"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "UNAUTHORIZED",
            facts: []
        });
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

    it("rejects agenda activation in a terminal meeting", () => {
        const current = terminalState("terminal");
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "activate_agenda",
                agendaId: "missing-agenda",
                previousDisposition: "closed",
                reason: "move on"
            },
            captain,
            10,
            "fact-2"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "MEETING_TERMINAL",
            facts: []
        });
    });

    it("activates a pending agenda and records both agenda references", () => {
        const current = {
            ...state(),
            agenda: [
                state().agenda[0],
                {
                    id: "agenda-2",
                    title: "next",
                    question: "next question",
                    status: "pending" as const,
                    requiredOutputIds: ["output-1"],
                    requiredReviewerIds: []
                }
            ]
        };
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "activate_agenda",
                agendaId: "agenda-2",
                previousDisposition: "completed",
                reason: "move on"
            },
            captain,
            10,
            "fact-2"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.version).toBe(4);
        expect(result.state.agenda.map(({ id, status }) => ({ id, status }))).toEqual([
            { id: "agenda-1", status: "completed" },
            { id: "agenda-2", status: "active" }
        ]);
        expect(result.facts[0]).toEqual({
            id: "fact-2",
            kind: "activate_agenda",
            actorId: "identity-1",
            occurredAt: 10,
            relatedIds: ["meeting-1", "agenda-1", "agenda-2"],
            payload: { kind: "references", relatedIds: ["meeting-1", "agenda-1", "agenda-2"] }
        });
        expect(result.state.lifecycle).toBe(current.lifecycle);
        expect(result.state.lifecycle).toEqual(current.lifecycle);
    });

    it.each([
        ["local actor", local, "running", "pending", "UNAUTHORIZED"],
        ["missing target", captain, "running", "pending", "NOT_FOUND"],
        ["paused lifecycle", captain, "paused", "pending", "INVALID_STATE"],
        ["converging lifecycle", captain, "converging", "pending", "INVALID_STATE"],
        ["ending lifecycle", captain, "ending", "pending", "INVALID_STATE"],
        ["target is not pending", captain, "running", "completed", "INVALID_STATE"],
        ["open round", captain, "running", "pending", "PRECONDITION_FAILED"]
    ] as const)("rejects agenda activation: %s", (_name, actor, status, targetStatus, code) => {
        const fixture = state(status);
        const current = {
            ...fixture,
            agenda: [
                fixture.agenda[0],
                {
                    id: "agenda-2",
                    title: "next",
                    question: "next question",
                    status: targetStatus,
                    requiredOutputIds: ["output-1"],
                    requiredReviewerIds: []
                }
            ] as const,
            rounds:
                code === "PRECONDITION_FAILED"
                    ? [
                          {
                              id: "round-1",
                              agendaId: "agenda-1",
                              publicBaselinePublicationIds: [],
                              openedAt: 1,
                              status: "open" as const,
                              contributionIds: []
                          }
                      ]
                    : []
        };
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "activate_agenda",
                agendaId: code === "NOT_FOUND" ? "missing-agenda" : "agenda-2",
                previousDisposition: "completed",
                reason: "move on"
            },
            actor,
            10,
            "fact-2"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

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
                kind: "raise_agenda_candidate",
                title: "candidate",
                reason: "raise"
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
