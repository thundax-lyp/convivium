import { buildMeetingEvents } from "@/runtime/application-service/meeting-event.ts";
import { expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { runMeetingActionTransition } from "@/runtime/application-service/meeting-action-transition.ts";

it("queues one Manager follow-up after committing stop_agenda", () => {
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
            kind: "stop_agenda"
        });
        expect(result.effectRequests).toEqual([
            {
                kind: "agent_notice",
                noticeKind: "agenda_stopped",
                recipientId: "manager-v1",
                agendaId: "agenda-v1",
                planId: "plan-stop"
            }
        ]);
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
