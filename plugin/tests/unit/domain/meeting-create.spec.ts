import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { createMeeting } from "@/domain/transitions/meeting-create.js";

describe("meeting create", () => {
    it("creates an isolated target aggregate", () => {
        const state = makeRunningMeetingStateV1();
        state.agenda.push({
            id: "agenda-v2",
            title: "议题 B",
            question: "后续证据是什么",
            status: "pending",
            requiredOutputIds: []
        });
        state.identities.push(
            {
                id: "contributor-any-agenda",
                displayName: "contributor-any-agenda",
                roles: ["contributor"],
                agendaResponsibilityIds: [],
                riskAuthority: false,
                required: false
            },
            {
                id: "contributor-other-agenda",
                displayName: "contributor-other-agenda",
                roles: ["contributor"],
                agendaResponsibilityIds: ["agenda-v2"],
                riskAuthority: false,
                required: false
            }
        );
        const created = createMeeting(state);
        expect(created.kind).toBe("accepted");
        if (created.kind !== "accepted") return;
        expect(created.state).toEqual(state);
        expect(created.state).not.toBe(state);
        expect(created.effectRequests).toEqual([
            {
                kind: "agent_notice",
                noticeKind: "meeting_started",
                recipientId: "contributor-v1",
                agendaId: "agenda-v1"
            },
            {
                kind: "agent_notice",
                noticeKind: "meeting_started",
                recipientId: "contributor-any-agenda",
                agendaId: "agenda-v1"
            }
        ]);
    });

    it("does not emit a start notice when creation is rejected", () => {
        const state = makeRunningMeetingStateV1();
        state.version = 2;
        expect(createMeeting(state)).toMatchObject({
            kind: "rejected",
            effectRequests: []
        });
    });
});
