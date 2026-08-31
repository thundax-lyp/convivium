import { join } from "node:path";

/** Resolves the current physical storage location without exposing it to callers. */
export function locateMeetingRepository(
    dataRoot: string,
    teamId: string,
    meetingId: string
): string {
    if (!/^(?!\.\.?(?:$|[\\/]))[^\\/\0]+$/.test(teamId)) {
        throw new Error("Invalid teamId path component.");
    }
    return join(dataRoot, encodeURIComponent(teamId), `${encodeURIComponent(meetingId)}.sqlite`);
}
