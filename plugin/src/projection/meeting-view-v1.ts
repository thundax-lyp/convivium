import type { MeetingSnapshot } from "@/repository/types.js";
import type { MeetingState } from "@/domain/index.js";
import type { MeetingAgentCatalogV1 } from "@/dsh/index.js";

export interface MeetingViewV1 {
    meetingId: string;
    meetingVersion: number;
    state: MeetingState;
    managerCatalog?: MeetingAgentCatalogV1;
}

export function projectMeetingViewV1(snapshot: MeetingSnapshot): MeetingViewV1 {
    return {
        meetingId: snapshot.meetingId,
        meetingVersion: snapshot.version,
        state: structuredClone(snapshot.state) as unknown as MeetingState
    };
}

export function projectMeetingIdentityViewV1(
    snapshot: MeetingSnapshot,
    caller: { kind: "manager" | "captain" | "local" | "participant" },
    catalog?: MeetingAgentCatalogV1
): MeetingViewV1 {
    const view = projectMeetingViewV1(snapshot);
    if (catalog !== undefined && caller.kind !== "participant")
        return { ...view, managerCatalog: structuredClone(catalog) };
    return view;
}
