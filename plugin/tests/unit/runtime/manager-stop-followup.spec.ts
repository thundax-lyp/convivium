import { expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { runMeetingActionTransition } from "@/runtime/application-service/meeting-action-transition.js";

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
