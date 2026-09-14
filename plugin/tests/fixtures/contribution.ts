import type { MeetingState } from "@/domain/model.js";

import { questionState } from "../unit/domain/transitions/fixtures.js";

export const contributionNow = 1_700_000_000_000;

export function contributionMeeting(): MeetingState {
    const state = questionState();
    state.status = "running";
    state.activeAgendaItemId = state.agenda[0]!.id;
    return state;
}
