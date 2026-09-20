import type { ArchiveView, MeetingViewV1 } from "@/protocol/index.js";

/** The client renders the server-owned projection without deriving domain facts. */
export type MeetingPanelView = MeetingViewV1;

export type MeetingPanelArchiveView = ArchiveView;

export function mapMeetingPanelView(view: MeetingViewV1): MeetingPanelView {
    return view;
}
