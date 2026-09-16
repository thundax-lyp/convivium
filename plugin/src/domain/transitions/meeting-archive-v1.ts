import type { ArchivePackageV1, MeetingState } from "@/domain/meeting-state-v1.js";

export function startMeetingArchiveV1(
    state: MeetingState,
    archive: ArchivePackageV1
): MeetingState {
    if (state.lifecycle.status === "archived") return state;
    return {
        ...structuredClone(state),
        lifecycle: { ...state.lifecycle, status: "archiving" },
        archive: structuredClone(archive)
    };
}
