import { expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { transitionMeetingState } from "@/domain/meeting-state-transitions.ts";
import { openRound } from "@/domain/transitions/round.ts";
import { runMeetingActionTransition } from "@/runtime/application-service/meeting-action-transition.ts";

it("reissues an open round invitation after pause interrupts a pending contributor", () => {
    const initial = makeRunningMeetingStateV1();
    const planned = {
        ...initial,
        managerPlans: [
            {
                id: "plan-1",
                agendaId: "agenda-v1",
                managerId: "manager-v1",
                kind: "open_round" as const,
                roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
                rationale: "collect evidence",
                createdAt: 1,
                status: "active" as const
            }
        ]
    };
    const opened = openRound(planned, {
        roundId: "round-1",
        agendaId: "agenda-v1",
        planId: "plan-1",
        managerId: "manager-v1",
        now: 2
    });
    expect(opened.kind).toBe("accepted");
    if (opened.kind !== "accepted") {
        return;
    }
    const paused = transitionMeetingState(
        opened.state,
        { kind: "pause_meeting", reason: "operator" },
        { kind: "captain_user", id: "local" },
        3,
        "pause-fact"
    );
    expect(paused.kind).toBe("accepted");
    if (paused.kind !== "accepted") {
        return;
    }
    const state = paused.state;
    const result = runMeetingActionTransition({
        snapshot: { state, version: state.version },
        repositoryContext: {},
        deps: { ids: { nextId: () => "unused" } },
        command: {
            protocolVersion: 1,
            meetingId: state.id,
            expectedMeetingVersion: state.version,
            requestId: "resume-1",
            action: { kind: "resume_meeting", reason: "continue" }
        },
        context: { caller: { channel: "loopback_remote", principalId: "local-controller" } },
        scope: {
            role: "captain",
            caller: { channel: "loopback_remote", principalId: "local-controller" }
        },
        now: 4,
        factId: "resume-fact",
        committedFacts: []
    } as never);
    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") {
        expect(result.effectRequests).toContainEqual({
            kind: "agent_notice",
            noticeKind: "round_opened",
            recipientId: "contributor-v1",
            agendaId: "agenda-v1",
            roundId: "round-1"
        });
    }
});
