import {
    chmod,
    copyFile,
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    symlink,
    writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const installScript = resolve(import.meta.dirname, "../../scripts/install.sh");

async function executable(path: string, content: string): Promise<void> {
    await writeFile(path, content);
    await chmod(path, 0o755);
}

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "convivium-install-"));
    roots.push(root);
    const packageRoot = join(root, "artifact", "package");
    const fakeBin = join(root, "bin");
    const calls = join(root, "pnpm-calls");
    await mkdir(join(packageRoot, "meeting-roles"), { recursive: true });
    await mkdir(join(packageRoot, "scripts"));
    await mkdir(fakeBin);
    await writeFile(
        join(packageRoot, "package.json"),
        JSON.stringify({ name: "@convivium/dsh-plugin", version: "1.2.3" })
    );
    await writeFile(join(packageRoot, "meeting-roles", "cordis.patch.yml"), "- id: roles\n");
    await copyFile(
        resolve(import.meta.dirname, "../../scripts/start.sh"),
        join(packageRoot, "scripts", "start.sh")
    );
    const artifact = join(root, "convivium-dsh-plugin-1.2.3.tgz");
    const packed = spawnSync("tar", ["-czf", artifact, "-C", join(root, "artifact"), "package"]);
    expect(packed.status, packed.stderr.toString()).toBe(0);
    await executable(
        join(fakeBin, "pnpm"),
        `#!/bin/sh
printf '%s\\n' "DSH_HOME=$DSH_HOME PWD=$PWD ARGS=$*" >> "$CALLS_FILE"
mkdir -p "$DSH_HOME/profiles/web"
if [ ! -f "$DSH_HOME/profiles/web/package.json" ]; then
    printf '%s\\n' '{"name":"dsh-profile-web","dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"],"patchReload":"live"}}}' > "$DSH_HOME/profiles/web/package.json"
fi
if [ -n "$FAIL_FIRST_ADD_FILE" ] && [ ! -f "$FAIL_FIRST_ADD_FILE" ]; then
    : > "$FAIL_FIRST_ADD_FILE"
    exit 42
fi
`
    );
    return { root, artifact, fakeBin, calls, installRoot: join(root, "installation") };
}

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("user installation entrypoints", () => {
    it("packages the current npm release when no version or artifact is supplied", async () => {
        const { root, fakeBin, calls, installRoot } = await fixture();
        const npmBin = join(fakeBin, "convivium-install");
        await symlink(installScript, npmBin);
        const result = spawnSync(npmBin, [], {
            cwd: root,
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${fakeBin}:${process.env.PATH}`,
                CALLS_FILE: calls,
                CONVIVIUM_INSTALL_ROOT: installRoot
            }
        });

        expect(result.status, result.stderr).toBe(0);
        expect(await readFile(join(installRoot, "release"), "utf8")).toBe("0.1.0-alpha.1\n");
        expect(await readFile(join(installRoot, "workspace-path"), "utf8")).toBe(
            `${join(await realpath(root), "dsh-workspace")}\n`
        );
        expect(await readFile(calls, "utf8")).toContain(
            `plugin --profile web add ${join(installRoot, "artifacts", "convivium-dsh-plugin-0.1.0-alpha.1.tgz")}`
        );
    }, 15_000);

    it("derives the release from one artifact and prepares a persistent profile", async () => {
        const { root, artifact, fakeBin, calls, installRoot } = await fixture();
        await mkdir(installRoot);
        await writeFile(join(installRoot, "dev.env"), "DEEPSEEK_API_KEY=existing-key\n");
        const result = spawnSync(installScript, ["--artifact", artifact], {
            cwd: root,
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${fakeBin}:${process.env.PATH}`,
                CALLS_FILE: calls,
                CONVIVIUM_INSTALL_ROOT: installRoot
            }
        });

        expect(result.status, result.stderr).toBe(0);
        expect(await readFile(join(installRoot, "release"), "utf8")).toBe("1.2.3\n");
        expect(
            JSON.parse(
                await readFile(
                    join(installRoot, "releases", "1.2.3", "package", "package.json"),
                    "utf8"
                )
            )
        ).toMatchObject({ name: "@convivium/dsh-plugin", version: "1.2.3" });
        expect(await readFile(join(installRoot, "storage.patch.yml"), "utf8")).toContain(
            JSON.stringify(join(installRoot, "convivium-storage.sqlite"))
        );
        expect(await readFile(join(installRoot, "dev.env"), "utf8")).toBe(
            "DEEPSEEK_API_KEY=existing-key\n"
        );
        expect(
            JSON.parse(
                await readFile(
                    join(root, "dsh-workspace", "dsh-home", "profiles", "web", "package.json"),
                    "utf8"
                )
            ).dsh.profile.patchReload
        ).toBe("startup");
        const recordedCalls = await readFile(calls, "utf8");
        expect(recordedCalls).toContain(
            `plugin --profile web add ${join(installRoot, "artifacts", "convivium-dsh-plugin-1.2.3.tgz")}`
        );
        expect(recordedCalls).toContain(
            "plugin --profile web add @deepseek-ai/dsh-storage-sqlite@0.1.2-rc.1"
        );
    });

    it("preserves an existing web profile reload setting", async () => {
        const { root, artifact, fakeBin, calls, installRoot } = await fixture();
        const profileManifest = join(
            root,
            "dsh-workspace",
            "dsh-home",
            "profiles",
            "web",
            "package.json"
        );
        await mkdir(join(root, "dsh-workspace", "dsh-home", "profiles", "web"), {
            recursive: true
        });
        const existing = {
            name: "dsh-profile-web",
            dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"], patchReload: "live" } }
        };
        await writeFile(profileManifest, `${JSON.stringify(existing)}\n`);
        const result = spawnSync(installScript, ["--artifact", artifact], {
            cwd: root,
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${fakeBin}:${process.env.PATH}`,
                CALLS_FILE: calls,
                CONVIVIUM_INSTALL_ROOT: installRoot
            }
        });

        expect(result.status, result.stderr).toBe(0);
        expect(JSON.parse(await readFile(profileManifest, "utf8"))).toEqual(existing);
    });

    it("completes the new profile reload setting after a failed first add", async () => {
        const { root, artifact, fakeBin, calls, installRoot } = await fixture();
        const failFirstAddFile = join(root, "failed-first-add");
        const env = {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH}`,
            CALLS_FILE: calls,
            CONVIVIUM_INSTALL_ROOT: installRoot,
            FAIL_FIRST_ADD_FILE: failFirstAddFile
        };
        const first = spawnSync(installScript, ["--artifact", artifact], {
            cwd: root,
            encoding: "utf8",
            env
        });
        expect(first.status).not.toBe(0);

        const retry = spawnSync(installScript, ["--artifact", artifact], {
            cwd: root,
            encoding: "utf8",
            env
        });
        expect(retry.status, retry.stderr).toBe(0);
        const profileManifest = join(
            root,
            "dsh-workspace",
            "dsh-home",
            "profiles",
            "web",
            "package.json"
        );
        expect(JSON.parse(await readFile(profileManifest, "utf8")).dsh.profile.patchReload).toBe(
            "startup"
        );
    });

    it("starts with the installed release, profile, workspace, and environment", async () => {
        const { root, artifact, fakeBin, calls, installRoot } = await fixture();
        const workspace = join(installRoot, "custom-workspace");
        const env = {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH}`,
            CALLS_FILE: calls,
            CONVIVIUM_INSTALL_ROOT: installRoot
        };
        expect(
            spawnSync(installScript, ["--artifact", artifact, "--workspace", workspace], {
                cwd: root,
                env
            }).status
        ).toBe(0);
        expect(await readFile(join(installRoot, "workspace-path"), "utf8")).toBe(`${workspace}\n`);
        await writeFile(join(installRoot, "dev.env"), "DEEPSEEK_API_KEY=secret\n");
        await writeFile(calls, "");

        const result = spawnSync(join(installRoot, "start.sh"), [], {
            cwd: root,
            encoding: "utf8",
            env
        });

        expect(result.status, result.stderr).toBe(0);
        const recordedCall = await readFile(calls, "utf8");
        expect(recordedCall).toContain(`DSH_HOME=${workspace}/dsh-home`);
        expect(recordedCall).toContain(`PWD=${workspace}`);
        expect(recordedCall).toContain(
            `--patch ${join(installRoot, "releases", "1.2.3", "package", "meeting-roles", "cordis.patch.yml")}`
        );
    });

    it("refreshes a development build with the same package version while retaining Meeting storage", async () => {
        const { root, artifact, fakeBin, calls, installRoot } = await fixture();
        const workspace = join(root, "dsh-workspace");
        const env = {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH}`,
            CALLS_FILE: calls,
            CONVIVIUM_INSTALL_ROOT: installRoot
        };
        const args = ["--artifact", artifact, "--workspace", workspace, "--dev-refresh"];
        const first = spawnSync(installScript, args, { cwd: root, encoding: "utf8", env });
        expect(first.status, first.stderr).toBe(0);
        const firstRelease = (await readFile(join(installRoot, "release"), "utf8")).trim();
        await writeFile(join(installRoot, "convivium-storage.sqlite"), "existing-meeting-data");
        const sessionRecord = join(
            workspace,
            "dsh-home",
            "sessions",
            "existing-session.jsonl.zstd"
        );
        await mkdir(join(workspace, "dsh-home", "sessions"), { recursive: true });
        await writeFile(sessionRecord, "existing-session-data");

        await writeFile(
            join(root, "artifact", "package", "meeting-roles", "cordis.patch.yml"),
            "- id: updated-roles\n"
        );
        const packed = spawnSync("tar", [
            "-czf",
            artifact,
            "-C",
            join(root, "artifact"),
            "package"
        ]);
        expect(packed.status, packed.stderr.toString()).toBe(0);
        const second = spawnSync(installScript, args, { cwd: root, encoding: "utf8", env });
        expect(second.status, second.stderr).toBe(0);
        const secondRelease = (await readFile(join(installRoot, "release"), "utf8")).trim();

        expect(firstRelease).not.toBe(secondRelease);
        expect(await readFile(join(installRoot, "convivium-storage.sqlite"), "utf8")).toBe(
            "existing-meeting-data"
        );
        expect(await readFile(sessionRecord, "utf8")).toBe("existing-session-data");
        expect(
            await readFile(
                join(
                    installRoot,
                    "releases",
                    firstRelease,
                    "package",
                    "meeting-roles",
                    "cordis.patch.yml"
                ),
                "utf8"
            )
        ).toBe("- id: roles\n");
        expect(
            await readFile(
                join(
                    installRoot,
                    "releases",
                    secondRelease,
                    "package",
                    "meeting-roles",
                    "cordis.patch.yml"
                ),
                "utf8"
            )
        ).toBe("- id: updated-roles\n");
        expect(await readFile(calls, "utf8")).toContain(`DSH_HOME=${workspace}/dsh-home`);
    });
});
