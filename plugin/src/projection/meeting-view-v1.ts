import type { MeetingSnapshot } from "@/repository/types.js";
import type { MeetingState } from "@/domain/meeting-state-v1.js";

export interface MeetingViewV1 {
    meetingId: string;
    meetingVersion: number;
    state: MeetingState;
}

export function projectMeetingViewV1(snapshot: MeetingSnapshot): MeetingViewV1 {
    return {
        meetingId: snapshot.meetingId,
        meetingVersion: snapshot.version,
        state: structuredClone(snapshot.state) as unknown as MeetingState
    };
}
