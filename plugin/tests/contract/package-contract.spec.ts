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

describe("plugin package contract", () => {
    it("publishes the closed bundle and client manifest contract", () => {
        expect(Object.keys(packageManifest.exports)).toEqual([
            ".",
            "./client",
            "./cordis.patch.yml",
            "./package.json"
        ]);
        expect(packageManifest.files).toEqual(["lib", "cordis.patch.yml"]);
        expect(packageManifest.dsh.bundle.patch).toBe("./cordis.patch.yml");
        expect(packageManifest.dsh.client.platform).toBe("web");
        expect(packageManifest.dsh.client.inject).toEqual([
            "@deepseek-ai/dsh-client-ui-renderer",
            "@deepseek-ai/dsh-client-ui-conversation"
        ]);
        expect(packageManifest.peerDependencies).toMatchObject({
            "@deepseek-ai/dsh-storage-domain": "0.1.2-rc.1"
        });
        for (const dependency of ["@deepseek-ai/dsh-storage", "@deepseek-ai/dsh-storage-sqlite"]) {
            expect(packageManifest.peerDependencies).not.toHaveProperty(dependency);
            expect(packageManifest.dependencies).not.toHaveProperty(dependency);
        }
        expect(patch).not.toMatch(/storage-domain|storage-sqlite/);
        expect(patch).toContain(`name: '${packageManifest.name}'`);
    });
});
