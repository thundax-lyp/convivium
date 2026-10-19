import type { Agent } from "@deepseek-ai/dsh-agent";
import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import { join } from "node:path";

export const readWebEvidence = async (agent: Agent, signal: AbortSignal): Promise<string> => {
    signal.throwIfAborted();
    const cwd = agent.session.header.cwd;
    if (!cwd) {
        throw new Error("Web evidence requires the bound Agent cwd");
    }
    const path = join(cwd, "web-evidence.txt");
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink()) {
        throw new Error("web-evidence.txt must be a regular file, not a link");
    }
    const file = await open(
        path,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
    );
    try {
        const actual = await file.stat();
        if (!actual.isFile() || actual.dev !== before.dev || actual.ino !== before.ino) {
            throw new Error("Web evidence file changed while opening");
        }
        return await readFile(file, { encoding: "utf8", signal });
    } finally {
        await file.close();
    }
};
