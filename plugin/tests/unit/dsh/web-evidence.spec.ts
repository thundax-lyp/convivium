import type { Agent } from "@deepseek-ai/dsh-agent";
import { mkdtemp, writeFile, symlink, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readWebEvidence } from "@/dsh/index.ts";

it("reads only the fixed regular draft in the bound cwd and respects cancellation", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "convivium-web-content-"));
    const agent = { session: { header: { cwd } } } as Agent;
    const signal = new AbortController().signal;
    try {
        await expect(readWebEvidence(agent, signal)).rejects.toThrow();
        await writeFile(join(cwd, "other.txt"), "private other file");
        await symlink(join(cwd, "other.txt"), join(cwd, "web-evidence.txt"));
        await expect(readWebEvidence(agent, signal)).rejects.toThrow(/regular file/);
        await rm(join(cwd, "web-evidence.txt"));
        await mkdir(join(cwd, "web-evidence.txt"));
        await expect(readWebEvidence(agent, signal)).rejects.toThrow(/regular file/);
        await rm(join(cwd, "web-evidence.txt"), { recursive: true });
        await writeFile(join(cwd, "web-evidence.txt"), "own content");
        expect(await readWebEvidence(agent, signal)).toBe("own content");
        const abort = new AbortController();
        abort.abort();
        await expect(readWebEvidence(agent, abort.signal)).rejects.toThrow();
    } finally {
        await rm(cwd, { recursive: true, force: true });
    }
});
