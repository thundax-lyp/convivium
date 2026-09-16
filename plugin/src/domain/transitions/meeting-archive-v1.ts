import type { ArchivePackageV1, MeetingState } from "@/domain/meeting-state-v1.js";

export function startMeetingArchiveV1(
    state: MeetingState,
    archive: ArchivePackageV1
): MeetingState {
    if (state.lifecycle.status === "archived") return state;
    const identityProvenance = state.identities
        .filter(
            (identity) =>
                !identity.required &&
                identity.definitionId !== undefined &&
                identity.definitionVersion !== undefined &&
                identity.definitionHash !== undefined
        )
        .map((identity) => ({
            identityId: identity.id,
            displayName: identity.displayName,
            roles: identity.roles,
            definitionId: identity.definitionId as string,
            definitionVersion: identity.definitionVersion as string,
            definitionHash: identity.definitionHash as string
        }));
    return {
        ...structuredClone(state),
        lifecycle: { ...state.lifecycle, status: "archiving" },
        archive: { ...structuredClone(archive), identityProvenance }
    };
}
