import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageManifest = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as {
    name: string;
    exports: Record<string, unknown>;
    files: string[];
    dsh: {
        bundle: { patch: string };
        client: { platform: string; inject: string[] };
    };
    peerDependencies: Record<string, string>;
    dependencies: Record<string, string>;
};
const patch = readFileSync(new URL("../../cordis.patch.yml", import.meta.url), "utf8");

describe("package contract framework", () => {
    it("keeps backend implementation symbols package-private", async () => {
        const runtime = await import("../../lib/index.js");
        expect(Object.keys(runtime).sort()).toEqual([
            "Config",
            "apply",
            "assertContinuableProvider",
            "inject",
            "name"
        ]);
        expect(runtime).not.toHaveProperty("BACKEND_NAME");
        expect(runtime).not.toHaveProperty("jsonlStoragePlugin");
        expect(runtime).not.toHaveProperty("JsonlStorageBackend");
        expect(runtime).not.toHaveProperty("JsonlStorageError");
    });
    it("publishes the closed bundle and client manifest contract", () => {
        expect(Object.keys(packageManifest.exports)).toEqual([
            ".",
            "./client",
            "./cordis.patch.yml",
            "./package.json"
        ]);
        expect(packageManifest.files).toEqual(["lib", "cordis.patch.yml", "README.md"]);
        expect(packageManifest.dsh.bundle.patch).toBe("./cordis.patch.yml");
        expect(packageManifest.dsh.client.platform).toBe("web");
        expect(packageManifest.dsh.client.inject).toEqual([
            "@deepseek-ai/dsh-client-runtime",
            "@deepseek-ai/dsh-client-locale",
            "@deepseek-ai/dsh-client-ui-layout",
            "@deepseek-ai/dsh-client-ui-conversation",
            "@deepseek-ai/dsh-client-ui-primitives",
            "@deepseek-ai/dsh-client-ui-slots"
        ]);
        expect(packageManifest.peerDependencies).toMatchObject({
            "@deepseek-ai/dsh-storage": "^0.1.1-rc.2",
            "@deepseek-ai/dsh-storage-domain": "^0.1.1-rc.2"
        });
        expect(packageManifest.dependencies.zod).toBe("^4.4.3");
        expect(patch).toContain(`name: '${packageManifest.name}'`);
    });
});
