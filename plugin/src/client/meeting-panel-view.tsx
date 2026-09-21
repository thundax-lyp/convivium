import type { ArchiveView, MeetingView } from "@/protocol/index.js";

/** The client renders the server-owned projection without deriving domain facts. */
export type MeetingPanelView = MeetingView;

export type MeetingPanelArchiveView = ArchiveView;

export function mapMeetingPanelView(view: MeetingView): MeetingPanelView {
    return view;
}
