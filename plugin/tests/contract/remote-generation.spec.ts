import { cp, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateTypert } from "../../scripts/generate-typert.mjs";

describe("generated Remote contract", () => {
    it("emits deterministic Host and Client artifacts without checkout access", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-plugin-contract-"));
        try {
            await cp(new URL("../../src", import.meta.url), join(root, "src"), { recursive: true });
            await mkdir(join(root, "scripts"), { recursive: true });
            await cp(
                new URL("../../scripts/generate-typert.mjs", import.meta.url),
                join(root, "scripts/generate-typert.mjs")
            );
            await cp(new URL("../../package.json", import.meta.url), join(root, "package.json"));
            await cp(new URL("../../tsconfig.json", import.meta.url), join(root, "tsconfig.json"));
            await symlink(
                new URL("../../node_modules", import.meta.url),
                join(root, "node_modules")
            );
            const first = await generateTypert(root);
            const firstHost = await readFile(join(root, "lib/typert.host.js"), "utf8");
            const firstClient = await readFile(join(root, "lib/typert.remote-client.d.ts"), "utf8");
            const second = await generateTypert(root);
            expect(second.js).toBe(first.js);
            expect(second.remote?.dts).toBe(first.remote?.dts);
            expect(firstHost).toContain("authority");
            expect(firstClient).toContain("watchUpdates");
            for (const method of [
                "list",
                "getStatus",
                "pause",
                "resume",
                "reassign",
                "end",
                "acceptDecision",
                "disposeDecision",
                "disposeRisk",
                "watchUpdates"
            ]) {
                expect(firstClient).toContain(method);
            }
            expect(firstHost).not.toContain(root);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }, 20_000);
});
