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
const reviewer = { kind: "identity", id: "reviewer-1" } as const;

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

function candidateState(): MeetingState {
    const current = state();
    current.identities = [
        ...current.identities,
        {
            id: "reviewer-1",
            displayName: "Reviewer",
            roles: ["evidence_reviewer"],
            agendaResponsibilityIds: [],
            reviewResponsibilityIds: [],
            riskAuthority: false,
            required: false
        }
    ];
    current.agendaCandidates = [{ id: "candidate-1", title: "x", reason: "x", status: "pending" }];
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

    it.each([
        ["duplicate reviewer", ["reviewer-1", "reviewer-1"], "INVALID_ARGUMENT"],
        ["reviewer without role", ["identity-1"], "PRECONDITION_FAILED"],
        ["used agenda id", ["reviewer-1"], "PRECONDITION_FAILED"]
    ] as const)("rejects promotion: %s", (_name, reviewerIds, code) => {
        const current = candidateState();
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_agenda_candidate",
                candidateId: "candidate-1",
                disposition: "promoted",
                reason: "approve",
                promotedAgenda: {
                    id: _name === "used agenda id" ? "agenda-1" : "agenda-2",
                    title: "next",
                    question: "next question",
                    requiredOutputIds: ["output-1"],
                    requiredReviewerIds: reviewerIds
                }
            },
            captain,
            10,
            "fact-3"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
        expect(result.state).toBe(current);
        expect(result.state.version).toBe(3);
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

    it("raises a candidate for an existing identity", () => {
        const current = state();
        const result = transitionMeetingStateV1(
            current,
            { kind: "raise_agenda_candidate", title: "new agenda", reason: "needed" },
            captain,
            10,
            "fact-3",
            "candidate-1"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.agendaCandidates).toEqual([
            { id: "candidate-1", title: "new agenda", reason: "needed", status: "pending" }
        ]);
        expect(result.facts[0].relatedIds).toEqual(["meeting-1", "candidate-1"]);
    });

    it("accepts a candidate source message when it belongs to the meeting", () => {
        const current = state();
        current.rounds = [
            {
                id: "round-1",
                agendaId: "agenda-1",
                publicBaselinePublicationIds: [],
                openedAt: 0,
                status: "published",
                contributionIds: [],
                publicationId: "publication-1"
            }
        ];
        current.publications = [
            {
                id: "publication-1",
                roundId: "round-1",
                seq: 1,
                finalVersionIds: [],
                finalReviewIds: [],
                publishedAt: 0,
                exitReasons: []
            }
        ];
        current.messages = [
            {
                id: "message-1",
                seq: 1,
                actorId: "identity-1",
                agendaId: "agenda-1",
                kind: "note",
                body: "source",
                publicationId: "publication-1",
                relatedIds: [],
                createdAt: 0
            }
        ];
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "raise_agenda_candidate",
                title: "new agenda",
                reason: "needed",
                sourceMessageId: "message-1"
            },
            captain,
            10,
            "fact-3",
            "candidate-1"
        );
        expect(result.kind).toBe("accepted");
    });

    it.each([
        [
            "local raise",
            local,
            { kind: "raise_agenda_candidate", title: "x", reason: "x" },
            "UNAUTHORIZED"
        ],
        [
            "missing source",
            captain,
            {
                kind: "raise_agenda_candidate",
                title: "x",
                reason: "x",
                sourceMessageId: "message-1"
            },
            "NOT_FOUND"
        ],
        [
            "invalid source id",
            captain,
            { kind: "raise_agenda_candidate", title: "x", reason: "x", sourceMessageId: " " },
            "INVALID_ARGUMENT"
        ]
    ] as const)("rejects candidate raise: %s", (_name, actor, action, code) => {
        const current = state();
        const result = transitionMeetingStateV1(
            current,
            action,
            actor,
            10,
            "fact-3",
            "candidate-1"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it("allows an existing non Captain identity to raise a candidate", () => {
        const current = candidateState();
        const result = transitionMeetingStateV1(
            current,
            { kind: "raise_agenda_candidate", title: "x", reason: "x" },
            reviewer,
            10,
            "fact-3",
            "candidate-2"
        );
        expect(result.kind).toBe("accepted");
    });

    it.each(["parked", "rejected"] as const)(
        "disposes a pending candidate as %s",
        (disposition) => {
            const current = {
                ...state(),
                agendaCandidates: [
                    { id: "candidate-1", title: "x", reason: "x", status: "pending" as const }
                ]
            };
            const result = transitionMeetingStateV1(
                current,
                {
                    kind: "dispose_agenda_candidate",
                    candidateId: "candidate-1",
                    disposition,
                    reason: "decide"
                },
                captain,
                10,
                "fact-3"
            );
            expect(result.kind).toBe("accepted");
            if (result.kind !== "accepted") return;
            expect(result.state.agendaCandidates[0].status).toBe(disposition);
            expect(result.state.agenda).toBe(current.agenda);
            expect(result.facts[0].relatedIds).toEqual(["meeting-1", "candidate-1"]);
        }
    );

    it("rejects a parked disposal by a non Captain identity", () => {
        const current = candidateState();
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_agenda_candidate",
                candidateId: "candidate-1",
                disposition: "parked",
                reason: "decide"
            },
            reviewer,
            10,
            "fact-3"
        );
        expect(result).toEqual({
            kind: "rejected",
            state: current,
            code: "UNAUTHORIZED",
            facts: []
        });
        expect(result.state).toBe(current);
        expect(result.state.version).toBe(3);
    });

    it.each([
        ["repeat disposition", "parked", undefined, "INVALID_STATE"],
        [
            "attached agenda on reject",
            "pending",
            {
                id: "agenda-2",
                title: "next",
                question: "next question",
                requiredOutputIds: ["output-1"],
                requiredReviewerIds: ["identity-1"]
            },
            "PRECONDITION_FAILED"
        ]
    ] as const)("rejects invalid candidate disposal: %s", (_name, status, promotedAgenda, code) => {
        const current = {
            ...state(),
            agendaCandidates: [{ id: "candidate-1", title: "x", reason: "x", status }]
        };
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_agenda_candidate",
                candidateId: "candidate-1",
                disposition: "rejected",
                reason: "decide",
                ...(promotedAgenda === undefined ? {} : { promotedAgenda })
            },
            captain,
            10,
            "fact-3"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });

    it.each([
        ["missing reviewer", ["missing-reviewer"], "NOT_FOUND"],
        ["bad promoted structure", ["reviewer-1"], "INVALID_ARGUMENT"]
    ] as const)("rejects promotion input: %s", (_name, reviewerIds, code) => {
        const current = candidateState();
        const action = {
            kind: "dispose_agenda_candidate" as const,
            candidateId: "candidate-1",
            disposition: "promoted" as const,
            reason: "approve",
            promotedAgenda:
                _name === "bad promoted structure"
                    ? null
                    : {
                          id: "agenda-2",
                          title: "next",
                          question: "next question",
                          requiredOutputIds: ["output-1"],
                          requiredReviewerIds: reviewerIds
                      }
        };
        const result = transitionMeetingStateV1(current, action as never, captain, 10, "fact-3");
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
        expect(result.state).toBe(current);
    });

    it("promotes a candidate atomically with a pending agenda and reviewer responsibility", () => {
        const current = candidateState();
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_agenda_candidate",
                candidateId: "candidate-1",
                disposition: "promoted",
                reason: "approve",
                promotedAgenda: {
                    id: "agenda-2",
                    title: "next",
                    question: "next question",
                    requiredOutputIds: ["output-1"],
                    requiredReviewerIds: ["reviewer-1"]
                }
            },
            captain,
            10,
            "fact-3"
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.version).toBe(4);
        expect(result.state.updatedAt).toBe(10);
        expect(result.state.agenda[0]).toBe(current.agenda[0]);
        expect(result.state.agenda[0].status).toBe("active");
        expect(result.state.agenda.at(-1)).toEqual({
            id: "agenda-2",
            title: "next",
            question: "next question",
            requiredOutputIds: ["output-1"],
            requiredReviewerIds: ["reviewer-1"],
            status: "pending"
        });
        expect(result.state.agendaCandidates[0].status).toBe("promoted");
        expect(result.state.identities.at(-1)?.reviewResponsibilityIds).toEqual(["agenda-2"]);
        expect(result.state.identities.at(-1)?.roles).toEqual(current.identities.at(-1)?.roles);
        expect(result.facts[0]).toEqual({
            id: "fact-3",
            kind: "dispose_agenda_candidate",
            actorId: "identity-1",
            occurredAt: 10,
            relatedIds: ["meeting-1", "candidate-1", "agenda-2", "reviewer-1"],
            payload: {
                kind: "references",
                relatedIds: ["meeting-1", "candidate-1", "agenda-2", "reviewer-1"]
            }
        });
    });

    it.each([
        ["missing candidate", "missing", "parked", "NOT_FOUND"],
        ["promoted without agenda", "candidate-1", "promoted", "PRECONDITION_FAILED"]
    ] as const)("rejects candidate disposal: %s", (_name, candidateId, _disposition, code) => {
        const current = {
            ...state(),
            agendaCandidates: [
                { id: "candidate-1", title: "x", reason: "x", status: "pending" as const }
            ]
        };
        const result = transitionMeetingStateV1(
            current,
            {
                kind: "dispose_agenda_candidate",
                candidateId,
                disposition: code === "PRECONDITION_FAILED" ? "promoted" : "parked",
                reason: "decide"
            },
            captain,
            10,
            "fact-3"
        );
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
    });
});
