import { expect, it } from "vitest";
import { transitionMeetingStateV1 } from "@/domain/meeting-state-transitions.js";
import {
    state,
    local,
    captain,
    manager,
    terminalState,
    publishedQuestionState,
    planNextStep
} from "./meeting-state-transitions-fixtures.js";

it("records a manager plan and supersedes the prior active plan atomically", () => {
    const current = publishedQuestionState(false);
    current.agenda = [
        ...current.agenda,
        {
            id: "agenda-2",
            title: "other",
            question: "other",
            status: "pending",
            requiredOutputIds: ["output-1"]
        }
    ];
    current.managerPlans = [
        current.managerPlans[0],
        {
            id: "plan-old",
            agendaId: "agenda-1",
            managerId: "manager-1",
            kind: "continue_agenda",
            rationale: "old",
            createdAt: 1,
            status: "active"
        },
        {
            id: "plan-other",
            agendaId: "agenda-2",
            managerId: "manager-1",
            kind: "stop_agenda",
            rationale: "other",
            createdAt: 1,
            status: "active"
        }
    ];
    const result = transitionMeetingStateV1(
        current,
        planNextStep({
            planKind: "open_round",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" }
        }),
        manager,
        10,
        "fact-10",
        "plan-new"
    );
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") return;
    expect(result.state.version).toBe(4);
    expect(result.state.updatedAt).toBe(10);
    expect(result.state.managerPlans).toEqual([
        current.managerPlans[0],
        { ...current.managerPlans[1], status: "superseded" },
        current.managerPlans[2],
        {
            id: "plan-new",
            agendaId: "agenda-1",
            managerId: "manager-1",
            kind: "open_round",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            rationale: "next",
            createdAt: 10,
            status: "active"
        }
    ]);
    expect(result.state.agenda).toBe(current.agenda);
    expect(result.state.identities).toBe(current.identities);
    expect(result.state.rounds).toBe(current.rounds);
    expect(result.facts).toEqual([
        {
            id: "fact-10",
            kind: "plan_next_step",
            actorId: "manager-1",
            occurredAt: 10,
            relatedIds: ["meeting-1", "plan-new", "agenda-1", "plan-old"],
            payload: {
                kind: "references",
                relatedIds: ["meeting-1", "plan-new", "agenda-1", "plan-old"]
            }
        }
    ]);
});

it.each([
    ["local", local, planNextStep(), "UNAUTHORIZED"],
    ["captain", captain, planNextStep(), "UNAUTHORIZED"],
    ["missing agenda", manager, planNextStep({ agendaId: "missing" }), "NOT_FOUND"]
] as const)("rejects invalid plan actor or target: %s", (_name, actor, action, code) => {
    const current = publishedQuestionState(false);
    const result = transitionMeetingStateV1(current, action, actor, 10, "fact-10", "plan-new");
    expect(result).toEqual({ kind: "rejected", state: current, code, facts: [] });
});

it("rejects planning while any round is open", () => {
    const current = state();
    current.identities = [
        ...current.identities,
        {
            id: "manager-1",
            displayName: "Manager",
            roles: ["manager"],
            agendaResponsibilityIds: [],
            riskAuthority: false,
            required: false
        }
    ];
    current.rounds = [
        {
            id: "round-open",
            agendaId: "agenda-1",
            planId: "plan-open",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            publicBaselinePublicationIds: [],
            openedAt: 0,
            status: "open",
            contributionIds: []
        }
    ];
    current.managerPlans = [
        {
            id: "plan-open",
            agendaId: "agenda-1",
            managerId: "manager-1",
            kind: "open_round",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            rationale: "plan",
            createdAt: 0,
            status: "completed"
        }
    ];
    const result = transitionMeetingStateV1(
        current,
        planNextStep(),
        manager,
        10,
        "fact-10",
        "plan-new"
    );
    expect(result).toEqual({
        kind: "rejected",
        state: current,
        code: "PRECONDITION_FAILED",
        facts: []
    });
});

it("appends a plan when the agenda has no active plan", () => {
    const current = publishedQuestionState(false);
    const result = transitionMeetingStateV1(
        current,
        planNextStep(),
        manager,
        10,
        "fact-10",
        "plan-new"
    );
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") return;
    expect(result.state.managerPlans).toEqual([
        current.managerPlans[0],
        {
            id: "plan-new",
            agendaId: "agenda-1",
            managerId: "manager-1",
            kind: "continue_agenda",
            rationale: "next",
            createdAt: 10,
            status: "active"
        }
    ]);
    expect(result.facts[0].relatedIds).toEqual(["meeting-1", "plan-new", "agenda-1"]);
});

it("rejects planning after the meeting is terminal", () => {
    const current = terminalState("terminal");
    current.identities = [
        ...current.identities,
        {
            id: "manager-1",
            displayName: "Manager",
            roles: ["manager"],
            agendaResponsibilityIds: [],
            riskAuthority: false,
            required: false
        }
    ];
    const result = transitionMeetingStateV1(
        current,
        planNextStep(),
        manager,
        10,
        "fact-10",
        "plan-new"
    );
    expect(result).toEqual({
        kind: "rejected",
        state: current,
        code: "MEETING_TERMINAL",
        facts: []
    });
});
