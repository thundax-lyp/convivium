import { mkdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

export const meetingAgentDirectory = async (input: {
    workspaceRoot: string;
    meetingId: string;
    identityId: string;
    create: boolean;
}): Promise<string> => {
    const { meetingId, identityId } = input;
    if (
        [meetingId, identityId].some(
            (id) => !id.trim() || id === "." || id === ".." || /[/\\\0]/.test(id)
        )
    ) {
        throw new Error("RECOVERY_UNAVAILABLE: invalid Agent directory identity");
    }
    try {
        let directory = await realpath(input.workspaceRoot);
        for (const component of ["meetings", meetingId, "agents", identityId]) {
            directory = join(directory, component);
            if (input.create) {
                await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
                    if (error.code !== "EEXIST") {
                        throw error;
                    }
                });
            }
            if (
                (await realpath(directory)) !== directory ||
                !(await stat(directory)).isDirectory()
            ) {
                throw new Error("Agent directory is not an owned directory");
            }
        }
        return directory;
    } catch (cause) {
        throw new Error("RECOVERY_UNAVAILABLE: Agent directory unavailable", { cause });
    }
};
