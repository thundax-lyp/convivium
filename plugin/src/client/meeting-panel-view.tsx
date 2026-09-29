import type { ArchiveView, MeetingView } from "@/protocol/index.ts";
/** The client renders the server-owned projection without deriving domain facts. */
export type MeetingPanelView = MeetingView;

export type MeetingPanelArchiveView = ArchiveView;

export const mapMeetingPanelView = (view: MeetingView): MeetingPanelView => {
    return view;
};
