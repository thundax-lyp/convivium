import { expect, it } from "vitest";
import { transitionMeetingState } from "@/domain/meeting-state-transitions.js";
import {
    state,
    local,
    captain,
    reviewer,
    manager,
    candidateState,
    publishedQuestionState
} from "./meeting-state-transitions-fixtures.js";

it("raises a candidate for an existing identity", () => {
    const current = state();
    const result = transitionMeetingState(
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
            planId: "plan-1",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            publicBaselinePublicationIds: [],
            openedAt: 0,
            status: "published",
            contributionIds: [],
            publicationId: "publication-1"
        }
    ];
    current.identities = [
        ...current.identities,
        {
            id: "manager-1",
            displayName: "Manager",
            roles: ["manager"],
            agendaResponsibilityIds: ["agenda-1"],
            riskAuthority: false,
            required: false
        }
    ];
    current.managerPlans = [
        {
            id: "plan-1",
            agendaId: "agenda-1",
            managerId: "manager-1",
            kind: "open_round",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            rationale: "plan",
            createdAt: 0,
            status: "completed"
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
    const result = transitionMeetingState(
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
    const result = transitionMeetingState(current, action, actor, 10, "fact-3", "candidate-1");
    expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
});

it("allows an existing non Captain identity to raise a candidate", () => {
    const current = candidateState();
    const result = transitionMeetingState(
        current,
        { kind: "raise_agenda_candidate", title: "x", reason: "x" },
        reviewer,
        10,
        "fact-3",
        "candidate-2"
    );
    expect(result.kind).toBe("accepted");
});

it.each(["parked", "rejected"] as const)("disposes a pending candidate as %s", (disposition) => {
    const current = {
        ...state(),
        agendaCandidates: [
            { id: "candidate-1", title: "x", reason: "x", status: "pending" as const }
        ]
    };
    const result = transitionMeetingState(
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
});

it("rejects a parked disposal by a non Captain identity", () => {
    const current = candidateState();
    const result = transitionMeetingState(
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
            requiredOutputIds: ["output-1"]
        },
        "PRECONDITION_FAILED"
    ]
] as const)("rejects invalid candidate disposal: %s", (_name, status, promotedAgenda, code) => {
    const current = {
        ...state(),
        agendaCandidates: [{ id: "candidate-1", title: "x", reason: "x", status }]
    };
    const result = transitionMeetingState(
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

it.each([["bad promoted structure", [], "INVALID_ARGUMENT"]] as const)(
    "rejects promotion input: %s",
    (_name, reviewerIds, code) => {
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
                          requiredOutputIds: ["output-1"]
                      }
        };
        const result = transitionMeetingState(current, action as never, captain, 10, "fact-3");
        expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
        expect(result.state).toBe(current);
    }
);

it("promotes a candidate atomically with a pending agenda and reviewer responsibility", () => {
    const current = candidateState();
    const result = transitionMeetingState(
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
                requiredOutputIds: ["output-1"]
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
        status: "pending"
    });
    expect(result.state.agendaCandidates[0].status).toBe("promoted");
    expect(result.state.identities.at(-1)?.roles).toEqual(current.identities.at(-1)?.roles);
    expect(result.facts[0]).toEqual({
        id: "fact-3",
        kind: "dispose_agenda_candidate",
        actorId: "identity-1",
        occurredAt: 10,
        relatedIds: ["meeting-1", "candidate-1", "agenda-2"],
        payload: {
            kind: "references",
            relatedIds: ["meeting-1", "candidate-1", "agenda-2"]
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
    const result = transitionMeetingState(
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

it.each([captain, manager, reviewer])("records a question for each allowed identity", (actor) => {
    const current = publishedQuestionState(false);
    const result = transitionMeetingState(
        current,
        {
            kind: "record_question",
            agendaId: "agenda-1",
            text: "clarify",
            affectedOutputIds: ["output-1"],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            blocking: true
        },
        actor,
        10,
        "fact-5",
        `question-${actor.id}`
    );
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") return;
    const questionId = `question-${actor.id}`;
    expect(result.state.questions[1]).toEqual({
        id: questionId,
        actorId: actor.id,
        agendaId: "agenda-1",
        text: "clarify",
        affectedOutputIds: ["output-1"],
        affectedCriterionIds: [],
        affectedConstraintIds: [],
        blocking: true,
        status: "open"
    });
    expect(result.facts).toEqual([
        {
            id: "fact-5",
            kind: "record_question",
            actorId: actor.id,
            occurredAt: 10,
            relatedIds: ["meeting-1", questionId],
            payload: { kind: "references", relatedIds: ["meeting-1", questionId] }
        }
    ]);
});
