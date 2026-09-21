import { expect, it } from "vitest";
import { transitionMeetingStateV1 } from "@/domain/meeting-state-transitions.js";
import {
    state,
    local,
    identity,
    captain,
    nonCaptain,
    manager,
    terminalState,
    candidateState,
    publishedQuestionState,
    recordIssue
} from "./meeting-state-transitions-fixtures.js";

it("records a nonblocking follow-up with all typed references", () => {
    const current = publishedQuestionState(false);
    const result = transitionMeetingStateV1(
        current,
        recordIssue({
            riskLevel: "medium",
            classification: "follow_up",
            blocking: false,
            affectedCriterionIds: ["criterion-1"],
            affectedConstraintIds: ["constraint-1"]
        }),
        manager,
        10,
        "fact-7",
        "issue-follow-up"
    );
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") return;
    expect(result.state.issues[0]).toMatchObject({
        id: "issue-follow-up",
        classification: "follow_up",
        blocking: false,
        affectedOutputIds: ["output-1"],
        affectedCriterionIds: ["criterion-1"],
        affectedConstraintIds: ["constraint-1"],
        requiresEvidenceReview: false
    });
});

it("accepts a high risk issue without affected targets", () => {
    const current = publishedQuestionState(false);
    const result = transitionMeetingStateV1(
        current,
        recordIssue({ affectedOutputIds: [], riskLevel: "high", classification: "blocking" }),
        captain,
        10,
        "fact-7",
        "issue-high"
    );
    expect(result.kind).toBe("accepted");
});

it("accepts medium blocking when an agenda reviewer qualifies it", () => {
    const current = publishedQuestionState(false);
    const result = transitionMeetingStateV1(
        current,
        recordIssue({
            riskLevel: "medium",
            classification: "blocking",
            requiresEvidenceReview: true,
            affectedOutputIds: ["output-1"]
        }),
        manager,
        10,
        "fact-7",
        "issue-reviewer"
    );
    expect(result.kind).toBe("accepted");
});

it.each([
    ["output", { affectedOutputIds: ["missing"] }],
    ["criterion", { affectedCriterionIds: ["missing"] }],
    ["constraint", { affectedConstraintIds: ["missing"] }]
] as const)("rejects a missing issue %s reference", (_name, overrides) => {
    const current = publishedQuestionState(false);
    const result = transitionMeetingStateV1(
        current,
        recordIssue(overrides),
        captain,
        10,
        "fact-8",
        "issue-missing-ref"
    );
    expect(result).toEqual({ kind: "rejected", state: current, code: "NOT_FOUND", facts: [] });
});

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

it("rejects resuming a message-budget pause without changing the state", () => {
    const current = {
        ...state("paused"),
        lifecycle: {
            status: "paused" as const,
            changedAt: 3,
            changedBy: "manager-1",
            reason: "message budget exhausted"
        }
    };
    const result = transitionMeetingStateV1(
        current,
        { kind: "resume_meeting", reason: "continue" },
        local,
        10,
        "fact-1"
    );
    expect(result).toEqual({
        kind: "rejected",
        state: current,
        code: "LIMIT_EXCEEDED",
        facts: []
    });
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

it("rejects promotion with a used agenda id", () => {
    const current = candidateState();
    const result = transitionMeetingStateV1(
        current,
        {
            kind: "dispose_agenda_candidate",
            candidateId: "candidate-1",
            disposition: "promoted",
            reason: "approve",
            promotedAgenda: {
                id: "agenda-1",
                title: "next",
                question: "next question",
                requiredOutputIds: ["output-1"]
            }
        },
        captain,
        10,
        "fact-3"
    );
    expect(result).toEqual({
        kind: "rejected",
        state: current,
        code: "PRECONDITION_FAILED",
        facts: []
    });
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
                requiredOutputIds: ["output-1"]
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
                requiredOutputIds: ["output-1"]
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
        identities:
            code === "PRECONDITION_FAILED"
                ? [
                      ...fixture.identities,
                      {
                          id: "manager-1",
                          displayName: "Manager",
                          roles: ["manager" as const],
                          agendaResponsibilityIds: ["agenda-1"],
                          riskAuthority: false,
                          required: false
                      }
                  ]
                : fixture.identities,
        agenda: [
            fixture.agenda[0],
            {
                id: "agenda-2",
                title: "next",
                question: "next question",
                status: targetStatus,
                requiredOutputIds: ["output-1"]
            }
        ] as const,
        rounds:
            code === "PRECONDITION_FAILED"
                ? [
                      {
                          id: "round-1",
                          agendaId: "agenda-1",
                          planId: "plan-1",
                          roundGoal: {
                              question: "q",
                              evidenceGap: "gap",
                              expectedOutput: "output"
                          },
                          publicBaselinePublicationIds: [],
                          openedAt: 1,
                          status: "open" as const,
                          contributionIds: []
                      }
                  ]
                : [],
        managerPlans:
            code === "PRECONDITION_FAILED"
                ? [
                      {
                          id: "plan-1",
                          agendaId: "agenda-1",
                          managerId: "manager-1",
                          kind: "open_round" as const,
                          roundGoal: {
                              question: "q",
                              evidenceGap: "gap",
                              expectedOutput: "output"
                          },
                          rationale: "plan",
                          createdAt: 0,
                          status: "completed" as const
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
