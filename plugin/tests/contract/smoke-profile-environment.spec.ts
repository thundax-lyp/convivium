import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSmokeApiKey } from "../../scripts/smoke-profile/environment.mjs";

describe("smoke-profile environment", () => {
    it("reads the required key while allowing unrelated local entries", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-smoke-env-"));
        const path = join(root, "dev.env");
        try {
            await writeFile(path, "DEEPSEEK_API_KEY=smoke-key\nLOCAL_NOTE=keep-local\n");
            await expect(loadSmokeApiKey(path)).resolves.toBe("smoke-key");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
