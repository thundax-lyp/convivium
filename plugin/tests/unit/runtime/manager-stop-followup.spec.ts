import { buildMeetingEvents } from "@/runtime/application-service/meeting-event.ts";
import { expect, it } from "vitest";
import { projectMeetingView } from "@/projection/meeting-view.ts";
import type { MeetingCommand } from "@/protocol/index.ts";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { runMeetingActionTransition } from "@/runtime/application-service/meeting-action-transition.ts";
import { endMeeting } from "@/domain/transitions/meeting-end.ts";

it("queues one Manager follow-up without requiring a stopped agenda before normal termination", () => {
    const state = makeRunningMeetingStateV1();
    const result = runMeetingActionTransition({
        snapshot: { state, version: state.version },
        repositoryContext: {},
        deps: { ids: { nextId: () => "plan-stop" } },
        command: {
            protocolVersion: 1,
            meetingId: state.id,
            expectedMeetingVersion: state.version,
            requestId: "stop-1",
            action: {
                kind: "submit_manager_plan",
                agendaId: "agenda-v1",
                planKind: "stop_agenda",
                rationale: "The current evidence path is exhausted."
            }
        },
        context: { caller: { channel: "dsh_tool", principalId: "manager-v1" } },
        scope: {
            role: "manager",
            identityId: "manager-v1",
            caller: { channel: "dsh_tool", principalId: "manager-v1" }
        },
        now: 10,
        factId: "fact-stop",
        committedFacts: []
    } as never);
    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") {
        expect(result.state.managerPlans.at(-1)).toMatchObject({
            id: "plan-stop",
            kind: "stop_agenda",
            status: "active"
        });
        expect(result.state.agenda).toEqual(state.agenda);
        expect(result.state.lifecycle).toEqual(state.lifecycle);
        expect(result.effectRequests).toEqual([
            {
                kind: "agent_notice",
                noticeKind: "agenda_stopped",
                recipientId: "manager-v1",
                agendaId: "agenda-v1",
                planId: "plan-stop"
            }
        ]);
        const ended = endMeeting(result.state, {
            terminationId: "termination-stop",
            outcome: "partial",
            reason: "Evidence paths are exhausted; the objective remains unproven.",
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            actorId: "manager-v1",
            now: 11
        });
        expect(ended.kind).toBe("accepted");
        expect(ended.state.lifecycle.status).toBe("terminal");
        expect(ended.state.termination?.outcome).toBe("partial");
    }
});

it("retains a local blocker in the plan and event while opening independent evidence work", () => {
    const state = makeRunningMeetingStateV1();
    const action = {
        kind: "submit_manager_plan" as const,
        agendaId: "agenda-v1",
        planKind: "open_round" as const,
        blockingReason: "Live API replication requires an unavailable credential.",
        rationale:
            "Keep the replication claim unverified; the Contributor can clarify the published source without that credential.",
        roundGoal: {
            question: "What does the published source support?",
            evidenceGap: "The quoted claim has no table-level citation.",
            expectedOutput: "A source-backed qualification of the claim."
        }
    };
    const context = {
        snapshot: { state, version: state.version },
        repositoryContext: {},
        deps: { ids: { nextId: () => "plan-continue" } },
        command: {
            protocolVersion: 1,
            meetingId: state.id,
            expectedMeetingVersion: state.version,
            requestId: "continue-1",
            action
        },
        context: { caller: { channel: "dsh_tool", principalId: "manager-v1" } },
        scope: {
            role: "manager",
            identityId: "manager-v1",
            caller: { channel: "dsh_tool", principalId: "manager-v1" }
        },
        now: 10,
        factId: "fact-continue",
        committedFacts: []
    } as const;
    const result = runMeetingActionTransition(context as never);
    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") {
        throw new Error("The independent evidence plan must be accepted.");
    }
    expect(result.state.managerPlans.at(-1)).toMatchObject({
        id: "plan-continue",
        kind: "open_round",
        blockingReason: action.blockingReason,
        rationale: action.rationale
    });
    expect(result.effectRequests).toEqual([]);
    expect(
        buildMeetingEvents({
            action,
            scope: context.scope as never,
            beforeState: state,
            transition: result,
            meetingId: state.id,
            now: 10
        })
    ).toMatchObject([
        {
            type: "manager_plan.recorded",
            payload: {
                data: {
                    planKind: "open_round",
                    blockingReason: action.blockingReason,
                    rationale: action.rationale
                }
            }
        }
    ]);
    const opened = runMeetingActionTransition({
        ...context,
        snapshot: { state: result.state, version: result.state.version },
        command: {
            ...context.command,
            expectedMeetingVersion: result.state.version,
            requestId: "open-independent",
            action: { kind: "open_round", agendaId: "agenda-v1", planId: "plan-continue" }
        },
        deps: { ids: { nextId: () => "round-independent" } }
    } as never);
    expect(opened.kind).toBe("accepted");
    if (opened.kind !== "accepted") {
        throw new Error("A local blocker must not block independent work.");
    }
    expect(opened.state.rounds.at(-1)).toMatchObject({ status: "open", planId: "plan-continue" });
    expect(opened.state.managerPlans.at(-1)?.blockingReason).toBe(action.blockingReason);
    expect(opened.state.lifecycle.status).toBe("running");
    expect(opened.state.termination).toBeUndefined();
    expect(opened.state.objective).toEqual(state.objective);
});

it("activates an authorized next agenda and opens its round with the same Manager", () => {
    let state = makeRunningMeetingStateV1();
    state.agenda = [
        ...state.agenda,
        {
            id: "agenda-next",
            title: "Next",
            question: "Independent next work",
            status: "pending",
            requiredOutputIds: ["output-v1"]
        }
    ];
    state.identities = state.identities.map((identity) =>
        identity.id === "contributor-v1"
            ? { ...identity, agendaResponsibilityIds: ["agenda-v1", "agenda-next"] }
            : identity
    );
    const identitiesBefore = state.identities;
    const caller = {
        kind: "identity" as const,
        identityId: "manager-v1",
        roles: ["manager" as const]
    };
    expect
        .soft(
            projectMeetingView(
                { meetingId: state.id, state, version: state.version, createdAt: 0, updatedAt: 0 },
                caller
            ).controls
        )
        .toContain("activate_agenda");
    let sequence = 0;
    const execute = (action: MeetingCommand["action"]) => {
        sequence += 1;
        const result = runMeetingActionTransition({
            snapshot: { state, version: state.version },
            repositoryContext: {},
            deps: { ids: { nextId: (kind: string) => `${kind}-${sequence}` } },
            command: {
                protocolVersion: 1,
                meetingId: state.id,
                expectedMeetingVersion: state.version,
                requestId: `request-${sequence}`,
                action
            },
            context: { caller: { channel: "dsh_tool", principalId: "manager-v1" } },
            scope: {
                role: "manager",
                identityId: "manager-v1",
                caller: { channel: "dsh_tool", principalId: "manager-v1" }
            },
            now: sequence,
            factId: `fact-${sequence}`,
            committedFacts: []
        } as never);
        expect(result, action.kind).toMatchObject({ kind: "accepted" });
        if (result.kind !== "accepted") {
            throw new Error("Manager progression rejected.");
        }
        state = result.state;
    };
    execute({
        kind: "submit_manager_plan",
        agendaId: "agenda-v1",
        planKind: "continue_agenda",
        blockingReason: "API credential is unavailable.",
        rationale: "Keep replication unresolved and proceed with agenda-next."
    });
    const oldPlan = state.managerPlans.at(-1);
    execute({
        kind: "activate_agenda",
        agendaId: "agenda-next",
        previousDisposition: "deferred",
        reason: "Independent documented work can proceed without the unavailable credential."
    });
    expect
        .soft(state.identities.find(({ id }) => id === "manager-v1")?.agendaResponsibilityIds)
        .toEqual(["agenda-v1", "agenda-next"]);
    expect(state.identities.filter(({ id }) => id !== "manager-v1")).toEqual(
        identitiesBefore.filter(({ id }) => id !== "manager-v1")
    );
    expect(state.managerPlans).toContainEqual(oldPlan);
    execute({
        kind: "submit_manager_plan",
        agendaId: "agenda-next",
        planKind: "open_round",
        rationale: "Use retained documents for independent work.",
        roundGoal: {
            question: "What do retained documents show?",
            evidenceGap: "Comparison is missing.",
            expectedOutput: "A bounded comparison with citations."
        }
    });
    execute({ kind: "open_round", agendaId: "agenda-next", planId: state.managerPlans.at(-1)!.id });
    expect(state.rounds.at(-1)).toMatchObject({
        agendaId: "agenda-next",
        status: "open",
        invitedContributorIds: ["contributor-v1"]
    });
    expect(state.lifecycle.status).toBe("running");
    expect(state.objective.requiredOutputs[0]?.status).toBe("pending");
});
