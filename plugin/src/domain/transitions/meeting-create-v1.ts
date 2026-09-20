import type { MeetingState } from "@/domain/meeting-state.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-validation.js";
import { rejectedTransitionV1, type MeetingTransitionResultV1 } from "./result.js";

export function createMeetingV1(state: MeetingState): MeetingTransitionResultV1 {
    const validation = validateMeetingStateV1(state);
    if (validation.kind === "invalid")
        return rejectedTransitionV1(state, "INVALID_ARGUMENT", "invalid meeting state");
    if (
        state.version !== 1 ||
        state.lifecycle.status !== "running" ||
        state.termination !== undefined ||
        state.archive !== undefined
    )
        return rejectedTransitionV1(
            state,
            "INVALID_STATE",
            "meeting is not a new running aggregate"
        );
    const activeAgenda = state.agenda.filter((agenda) => agenda.status === "active");
    if (activeAgenda.length !== 1)
        return rejectedTransitionV1(
            state,
            "INVALID_STATE",
            "meeting creation requires one active agenda"
        );
    const agendaId = activeAgenda[0]!.id;
    return {
        kind: "accepted",
        state: structuredClone(state),
        relatedIds: [state.id],
        effectRequests: state.identities
            .filter(
                (identity) =>
                    identity.roles.includes("contributor") &&
                    (identity.agendaResponsibilityIds.length === 0 ||
                        identity.agendaResponsibilityIds.includes(agendaId))
            )
            .map((identity) => ({
                kind: "agent_notice" as const,
                noticeKind: "meeting_started" as const,
                recipientId: identity.id,
                agendaId
            }))
    };
}
