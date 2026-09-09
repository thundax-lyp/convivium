import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WorkspaceTypertGenerator } from "@deepseek-ai/dsh-typert-generator";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));

/** @param {string} pluginRoot */
export async function generateTypert(pluginRoot) {
    const root = resolve(pluginRoot);
    const stage = await mkdtemp(join(tmpdir(), "convivium-typert-stage-"));
    const stagePlugin = join(stage, "packages/plugin");
    const stageProtocol = join(stage, "packages/protocol");
    try {
        await mkdir(stagePlugin, { recursive: true });
        await mkdir(stageProtocol, { recursive: true });
        await cp(join(root, "src"), join(stagePlugin, "src"), { recursive: true });
        await cp(join(root, "tsconfig.json"), join(stagePlugin, "tsconfig.json"));
        await writeFile(
            join(stagePlugin, "src/index.ts"),
            'export { ConviviumRemoteService } from "./remote/index.js";\n'
        );
        await symlink(join(root, "node_modules"), join(stage, "node_modules"));

        const pluginManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
        await writeFile(join(stagePlugin, "package.json"), JSON.stringify(pluginManifest, null, 4));
        await writeFile(
            join(stage, "package.json"),
            JSON.stringify({ private: true, workspaces: ["packages/*"] }, null, 4)
        );

        const protocolPackage = dirname(
            require.resolve("@deepseek-ai/dsh-typert-protocol/package.json")
        );
        await cp(join(protocolPackage, "lib/types"), join(stageProtocol, "lib/types"), {
            recursive: true
        });
        await cp(join(protocolPackage, "package.json"), join(stageProtocol, "package.json"));
        await writeFile(
            join(stageProtocol, "tsconfig.json"),
            JSON.stringify(
                {
                    compilerOptions: {
                        target: "ES2022",
                        module: "ESNext",
                        moduleResolution: "Bundler",
                        strict: true,
                        skipLibCheck: true,
                        noEmit: true,
                        types: []
                    },
                    include: ["lib/types/**/*.d.ts"]
                },
                null,
                4
            )
        );
        await writeFile(
            join(stage, "tsconfig.host.json"),
            JSON.stringify(
                {
                    compilerOptions: {
                        target: "ES2022",
                        module: "ESNext",
                        moduleResolution: "Bundler",
                        strict: true,
                        skipLibCheck: true,
                        noEmit: true,
                        types: [],
                        baseUrl: ".",
                        paths: {
                            "@/*": ["packages/plugin/src/*"],
                            "@deepseek-ai/dsh-typert-protocol": [
                                "packages/protocol/lib/types/index.d.ts"
                            ]
                        }
                    },
                    references: [{ path: "./packages/protocol" }, { path: "./packages/plugin" }],
                    files: []
                },
                null,
                4
            )
        );
        await writeFile(
            join(stage, "tsconfig.json"),
            JSON.stringify({ extends: "./tsconfig.host.json", include: [] }, null, 4)
        );

        const generated = new WorkspaceTypertGenerator(stage).generate(
            ["@convivium/dsh-plugin"],
            ["host"]
        );
        if (generated.length !== 1)
            throw new Error("Typert generator did not emit one plugin package.");
        const output = generated[0];
        if (!output.js || !output.dts || !output.remote?.js || !output.remote?.dts) {
            throw new Error("Typert generator did not emit the four required artifacts.");
        }
        await mkdir(join(root, "lib"), { recursive: true });
        await writeFile(join(root, "lib/typert.host.js"), output.js);
        await writeFile(join(root, "lib/typert.host.d.ts"), output.dts);
        await writeFile(join(root, "lib/typert.remote-client.js"), output.remote.js);
        await writeFile(join(root, "lib/typert.remote-client.d.ts"), output.remote.dts);
        return output;
    } finally {
        await rm(stage, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptDir, "generate-typert.mjs")) {
    await generateTypert(resolve(scriptDir, ".."));
}
