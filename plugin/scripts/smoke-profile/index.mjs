#!/usr/bin/env node
import { createConnection, createServer } from "node:net";
import { constants, createWriteStream } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import process from "node:process";
import {
    assertBrowserClientPreflight,
    createAuthenticatedBrowserFetch,
    parseBrowserLaunchUrl,
    redactBrowserCredentials
} from "./browser-client-preflight.mjs";
import { createSmokeEnvironment, loadSmokeApiKey } from "./environment.mjs";
import {
    parallelDiscussionDefinitions,
    parallelDiscussionModelOverrides
} from "./probe/scenarios/parallel-contribution-model.js";
import { validateScenarioResult } from "./result.mjs";

export { createSmokeEnvironment, loadSmokeApiKey } from "./environment.mjs";
export { validateScenarioResult } from "./result.mjs";

const DSH_VERSION = "0.1.2-rc.1";
const PROFILE = "web";
const PROVIDER = "spawn";
const DSH_PACKAGE = `@deepseek-ai/dsh@${DSH_VERSION}`;
const CONVIVIUM_PACKAGE = "@convivium/dsh-plugin";
const PROBE_PACKAGE = "@convivium/smoke-profile-probe";
const HOST = "127.0.0.1";
const pluginRoot = resolve(process.cwd());
const probeSourceDir = fileURLToPath(new URL("./probe", import.meta.url));
const BOOT_TIMEOUT_MS = Number(process.env.CONVIVIUM_SMOKE_BOOT_TIMEOUT_MS ?? "120000");
const COMMAND_TIMEOUT_MS = Number(process.env.CONVIVIUM_SMOKE_COMMAND_TIMEOUT_MS ?? "120000");
const BROWSER_MODE = process.env.CONVIVIUM_SMOKE_BROWSER_MODE === "1";
const BROWSER_SPEAKER_TIMEOUT_MS = 5 * 60 * 1000;
export const SMOKE_SCENARIOS = [
    "parallel-contribution",
    "parallel-contribution-model",
    "identity-admission",
    "meeting-business-loop"
];
export const CORE_SCENARIOS = ["parallel-contribution", "identity-admission", "meeting-business-loop"];

export function selectScenarios(args, scenario, browserMode) {
    if (args.some((arg) => !["--all", "--json"].includes(arg)))
        throw new Error("Usage: smoke:profile [--all] [--json]");
    if (args.includes("--all") && (scenario || browserMode))
        throw new Error("--all cannot be combined with a scenario or Browser mode.");
    if (scenario && !SMOKE_SCENARIOS.includes(scenario))
        throw new Error("Unsupported CONVIVIUM_SMOKE_SCENARIO: " + scenario);
    if (browserMode && scenario === "parallel-contribution-model")
        throw new Error("Model discussion smoke does not support Browser mode.");
    return scenario
        ? [scenario]
        : browserMode
          ? ["parallel-contribution"]
          : args.includes("--all")
            ? [...SMOKE_SCENARIOS]
            : [...CORE_SCENARIOS];
}

const tempPrefix = join(tmpdir(), "convivium-dsh-smoke-");

let tempRoot;
let bootProcess;
let activePort;

function validateTimeout(value, name) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }
}

function dshCommand(args) {
    if (process.env.DSH_SMOKE_DSH_BIN !== undefined && process.env.DSH_SMOKE_DSH_BIN !== "") {
        return { command: process.env.DSH_SMOKE_DSH_BIN, args };
    }
    return { command: "pnpm", args: ["dlx", DSH_PACKAGE, ...args] };
}

function runCommand(command, args, options = {}) {
    return new Promise((resolveCommand, rejectCommand) => {
        const child = spawn(command, args, {
            cwd: options.cwd ?? pluginRoot,
            env: createSmokeEnvironment(process.env, options.env),
            stdio: ["ignore", "pipe", "pipe"],
            shell: false
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled) return;
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 5000).unref();
            rejectCommand(new Error(`${command} ${args.join(" ")} timed out.`));
        }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);
        timeout.unref();

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr = (stderr + chunk).slice(-8000);
        });
        child.on("error", (error) => {
            settled = true;
            clearTimeout(timeout);
            rejectCommand(error);
        });
        child.on("close", (code, signal) => {
            settled = true;
            clearTimeout(timeout);
            if (code === 0) {
                resolveCommand({ stdout, stderr });
                return;
            }
            rejectCommand(
                new Error(
                    `${command} ${args.join(" ")} exited with code ${code ?? signal}.\n${stdout.slice(-4000)}\n${stderr}`
                )
            );
        });
    });
}

async function pathExists(path) {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function allocatePort() {
    const server = createServer();
    await new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(0, HOST, resolveListen);
    });
    const address = server.address();
    await new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
    });
    if (address === null || typeof address === "string") {
        throw new Error("Failed to allocate a TCP port for DSH smoke.");
    }
    return address.port;
}

function waitForTcp(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolveReady, rejectReady) => {
        const attempt = () => {
            const socket = createConnection({ host: HOST, port });
            socket.once("connect", () => {
                socket.end();
                resolveReady();
            });
            socket.once("error", (error) => {
                socket.destroy();
                if (Date.now() >= deadline) {
                    rejectReady(error);
                    return;
                }
                setTimeout(attempt, 250).unref();
            });
        };
        attempt();
    });
}

async function packArtifact(artifactDir) {
    await runCommand("pnpm", ["build"]);
    const { stdout } = await runCommand("pnpm", [
        "pack",
        "--json",
        "--pack-destination",
        artifactDir
    ]);
    const packed = JSON.parse(stdout.trim());
    const filename = Array.isArray(packed) ? packed[0]?.filename : packed.filename;
    if (typeof filename !== "string" || filename === "") {
        throw new Error("pnpm pack did not report an artifact filename.");
    }
    const artifact = resolve(artifactDir, basename(filename));
    await access(artifact, constants.R_OK);
    return artifact;
}

export async function writeSmokePatch(path, scenario) {
    const targetDefinitions =
        scenario === "meeting-business-loop"
            ? JSON.parse(
                  await readFile(join(pluginRoot, "meeting-roles", "definitions.json"), "utf8")
              ).definitions
            : undefined;
    const patch = [
        "- insert:",
        "    - id: convivium-smoke-storage-sqlite",
        "      name: '@deepseek-ai/dsh-storage-sqlite'",
        "      config:",
        `        path: ${JSON.stringify(join(dirname(path), "convivium-storage.sqlite"))}`,
        "        journalMode: wal",
        "- id: storage-domain",
        "  config:",
        "    backend: sqlite",
        "    routes:",
        "      workspace: json",
        "      session_projcache: json",
        "      message_feedback: json",
        "- id: convivium",
        "  config:",
        `    provider: ${PROVIDER}`,
            ...(targetDefinitions !== undefined
                ? [`    agentDefinitions: ${JSON.stringify(targetDefinitions)}`]
                : scenario === "parallel-contribution-model" || scenario === "identity-admission"
            ? [
                  `    agentDefinitions: ${JSON.stringify(parallelDiscussionDefinitions)}`,
                  ...(scenario === "parallel-contribution-model"
                      ? [
                            `    agentModelOverrides: ${JSON.stringify(parallelDiscussionModelOverrides)}`
                        ]
                      : [])
              ]
            : []),
        "    maxParticipants: 3",
        `    speakerTimeoutMs: ${BROWSER_MODE ? BROWSER_SPEAKER_TIMEOUT_MS : 60000}`,
        "    outboxPollMs: 1000",
        ""
    ].join("\n");
    await writeFile(path, patch, "utf8");
}

async function writeProbePackage(probeDir) {
    await cp(probeSourceDir, probeDir, { recursive: true });
    await writeFile(
        join(probeDir, "package.json"),
        JSON.stringify(
            {
                name: PROBE_PACKAGE,
                version: "0.0.0",
                private: true,
                type: "module",
                main: "index.js",
                dependencies: {
                    "@deepseek-ai/dsh-subagent": DSH_VERSION,
                    "@deepseek-ai/dsh-llm": DSH_VERSION,
                    "@deepseek-ai/dsh-storage-sqlite": DSH_VERSION,
                    ws: "8.18.3"
                },
                dsh: { bundle: { patch: "./cordis.patch.yml" } }
            },
            null,
            2
        ) + "\n",
        "utf8"
    );
    await writeFile(
        join(probeDir, "cordis.patch.yml"),
        "- insert:\n    - id: convivium-smoke-profile-probe\n      name: '@convivium/smoke-profile-probe'\n",
        "utf8"
    );
}

async function installArtifact(env, artifact) {
    const dsh = dshCommand(["plugin", "--profile", PROFILE, "add", artifact]);
    await runCommand(dsh.command, dsh.args, { env });
}

async function installProbe(env, probeDir) {
    const artifactDir = resolve(probeDir, "..");
    const { stdout } = await runCommand(
        "pnpm",
        ["pack", "--json", "--pack-destination", artifactDir],
        { cwd: probeDir, env }
    );
    const packed = JSON.parse(stdout.trim());
    const filename = Array.isArray(packed) ? packed[0]?.filename : packed.filename;
    if (typeof filename !== "string" || filename === "") {
        throw new Error("pnpm pack did not report a probe artifact filename.");
    }
    const artifact = resolve(artifactDir, basename(filename));
    await access(artifact, constants.R_OK);
    const dsh = dshCommand(["plugin", "--profile", PROFILE, "add", artifact]);
    await runCommand(dsh.command, dsh.args, { env });
}

async function dumpConfig(env, patchPath, logsDir, roleAssetRoot) {
    const dsh = dshCommand([
        PROFILE,
        ...(roleAssetRoot ? ["--patch", join(roleAssetRoot, "cordis.patch.yml")] : []),
        "--patch",
        patchPath,
        "--dump-config"
    ]);
    const result = await runCommand(dsh.command, dsh.args, { env });
    const dumpPath = join(logsDir, "dump-config.yml");
    await writeFile(dumpPath, result.stdout, "utf8");
    for (const expected of [
        CONVIVIUM_PACKAGE,
        "@deepseek-ai/dsh-storage-sqlite",
        "convivium-smoke-storage-sqlite",
        "convivium-storage.sqlite",
        "@deepseek-ai/dsh-subagent-spawn-in-process",
        PROVIDER
    ]) {
        if (!result.stdout.includes(expected)) {
            throw new Error(`dump-config did not include ${expected}.`);
        }
    }
    if (/convivium-jsonl|dataRoot/.test(result.stdout))
        throw new Error("dump-config contains obsolete Convivium storage configuration.");
    return dumpPath;
}

async function bootHost(env, patchPath, workspaceDir, logsDir, port, roleAssetRoot) {
    const stdoutPath = join(logsDir, "boot.stdout.log");
    const stderrPath = join(logsDir, "boot.stderr.log");
    const stdout = createWriteStream(stdoutPath);
    const stderr = createWriteStream(stderrPath);
    const dsh = dshCommand([
        PROFILE,
        ...(roleAssetRoot ? ["--patch", join(roleAssetRoot, "cordis.patch.yml")] : []),
        "--patch",
        patchPath,
        "--no-open",
        "--host",
        HOST,
        "--port",
        String(port),
        "--trusted-host",
        `${HOST}:${port}`
    ]);

    bootProcess = spawn(dsh.command, dsh.args, {
        cwd: workspaceDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false
    });
    bootProcess.stdout.pipe(stdout);
    bootProcess.stderr.pipe(stderr);
    let startupStdout = "";
    let startupStderr = "";
    bootProcess.stdout.setEncoding("utf8");
    bootProcess.stderr.setEncoding("utf8");
    bootProcess.stdout.on("data", (chunk) => {
        startupStdout = (startupStdout + chunk).slice(-8000);
    });
    bootProcess.stderr.on("data", (chunk) => {
        startupStderr = (startupStderr + chunk).slice(-8000);
    });

    let ready = false;
    const earlyExit = new Promise((_, rejectEarly) => {
        bootProcess.once("exit", (code, signal) => {
            if (ready) return;
            rejectEarly(
                new Error(
                    `DSH host exited before readiness: ${code ?? signal}.\n` +
                        `stdout tail:\n${startupStdout}\n` +
                        `stderr tail:\n${startupStderr}`
                )
            );
        });
        bootProcess.once("error", rejectEarly);
    });

    await Promise.race([waitForTcp(port, BOOT_TIMEOUT_MS), earlyExit]);
    ready = true;
    return { stdoutPath, stderrPath };
}

async function waitForJson(path, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await pathExists(path)) {
            try {
                const content = await readFile(path, "utf8");
                if (content.trim() !== "") return JSON.parse(content);
            } catch (error) {
                if (!(error?.code === "ENOENT" || error instanceof SyntaxError)) throw error;
            }
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    throw new Error(`Timed out waiting for smoke result at ${path}.`);
}

async function waitForBrowserLaunchUrl(stdoutPath, origin) {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    while (Date.now() < deadline) {
        try {
            const stdout = await readFile(stdoutPath, "utf8");
            const lineEnd = stdout.lastIndexOf("\n");
            if (lineEnd >= 0) {
                const launchUrl = parseBrowserLaunchUrl(stdout.slice(0, lineEnd + 1), origin);
                if (launchUrl !== undefined) return launchUrl;
            }
        } catch (error) {
            if (error?.code !== "ENOENT") throw error;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    throw new Error("browser authentication: launch URL timeout");
}

async function stopHost() {
    if (bootProcess === undefined) return;
    const child = bootProcess;
    bootProcess = undefined;
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolveStop) => {
        const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            resolveStop();
        }, 5000);
        child.once("exit", () => {
            clearTimeout(timeout);
            resolveStop();
        });
        child.kill("SIGTERM");
    });
}

async function restore(root = tempRoot) {
    await stopHost();
    if (root === undefined) return;
    const resolvedTempRoot = resolve(root);
    if (!resolvedTempRoot.startsWith(resolve(tmpdir()) + sep)) {
        throw new Error(`Refusing to remove non-temporary smoke root: ${resolvedTempRoot}`);
    }
    if (!basename(resolvedTempRoot).startsWith("convivium-dsh-smoke-")) {
        throw new Error(`Refusing to remove unexpected smoke root: ${resolvedTempRoot}`);
    }
    const cleanupDeadline = Date.now() + 5000;
    while (true) {
        try {
            await rm(resolvedTempRoot, { recursive: true, force: true });
            break;
        } catch (error) {
            if (
                !(error?.code === "ENOTEMPTY" || error?.code === "EBUSY") ||
                Date.now() >= cleanupDeadline
            ) {
                throw error;
            }
            await new Promise((resolveWait) => setTimeout(resolveWait, 100));
        }
    }
    if (await pathExists(resolvedTempRoot)) {
        throw new Error(`Smoke restore failed to remove ${resolvedTempRoot}.`);
    }
    if (activePort !== undefined) {
        await assertPortReleased(activePort);
        activePort = undefined;
    }
}

export function waitForBrowserStop() {
    return new Promise((resolveStop) => {
        // pnpm and the terminal can both forward a stop signal. Keep the CLI
        // handlers until process exit so a second signal cannot interrupt finally.
        process.on("SIGINT", resolveStop);
        process.on("SIGTERM", resolveStop);
    });
}

async function runScenario(scenario, artifact, deepSeekApiKey) {
    tempRoot = await mkdtemp(tempPrefix);
    const dshHome = join(tempRoot, "dsh-home");
    const workspaceDir = join(tempRoot, "workspace");
    const logsDir = join(tempRoot, "logs");
    const probeDir = join(tempRoot, "probe");
    const patchPath = join(tempRoot, "convivium-smoke.patch.yml");
    const resultPath = join(tempRoot, "smoke-result.json");
    const modelEvidencePath = join(tempRoot, "model-discussion-evidence.json");
    await mkdir(dshHome, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(logsDir, { recursive: true });
    await writeSmokePatch(patchPath, scenario);
    await writeProbePackage(probeDir);

    let roleAssetRoot;
    if (scenario === "parallel-contribution-model" || scenario === "identity-admission" || scenario === "meeting-business-loop") {
        const unpackRoot = join(tempRoot, "role-package");
        await mkdir(unpackRoot, { recursive: true });
        await runCommand("tar", ["-xzf", artifact, "-C", unpackRoot], {
            env: createSmokeEnvironment(process.env)
        });
        roleAssetRoot = join(unpackRoot, "package", "meeting-roles");
        await access(join(roleAssetRoot, "cordis.patch.yml"), constants.R_OK);
    }
    const env = createSmokeEnvironment(process.env, {
        ...(roleAssetRoot ? { CONVIVIUM_MEETING_ROLES_ROOT: roleAssetRoot } : {}),
        DSH_HOME: dshHome,
        DSH_TELEMETRY_DISABLED: "1",
        DSH_PERMISSION_MODE: "workspace-write",
        CONVIVIUM_SMOKE_RESULT: resultPath,
        ...(scenario === "parallel-contribution-model"
            ? { CONVIVIUM_SMOKE_MODEL_EVIDENCE: modelEvidencePath }
            : {}),
        CONVIVIUM_SMOKE_SCENARIO: scenario
    });
    const port = await allocatePort();
    activePort = port;
    await installArtifact(env, artifact);
    await installProbe(env, probeDir);
    const dumpPath = await dumpConfig(env, patchPath, logsDir, roleAssetRoot);
    const hostEnv = createSmokeEnvironment(env, {}, deepSeekApiKey);
    const bootLogs = await bootHost(hostEnv, patchPath, workspaceDir, logsDir, port, roleAssetRoot);
    let probeResult = await waitForJson(
        resultPath,
        scenario === "parallel-contribution-model" ? 2100000 : BOOT_TIMEOUT_MS
    );
    if (!probeResult.ok) {
        const stdoutTail = (await readFile(bootLogs.stdoutPath, "utf8")).slice(-8000);
        const stderrTail = (await readFile(bootLogs.stderrPath, "utf8")).slice(-8000);
        throw new Error(
            `smoke probe failed: ${probeResult.error ?? "unknown error"}\n` +
                `stdout tail:\n${stdoutTail}\n` +
                `stderr tail:\n${stderrTail}`
        );
    }
    probeResult = validateScenarioResult(probeResult, scenario);

    await stat(dumpPath);
    let browserLaunchUrl;
    if (BROWSER_MODE) {
        const origin = `http://${HOST}:${port}`;
        browserLaunchUrl = await waitForBrowserLaunchUrl(bootLogs.stdoutPath, origin);
        const authenticatedFetch = await createAuthenticatedBrowserFetch(
            browserLaunchUrl,
            origin,
            globalThis.fetch,
            BOOT_TIMEOUT_MS
        );
        await assertBrowserClientPreflight(origin, authenticatedFetch, BOOT_TIMEOUT_MS);
    }
    const result = {
        ok: true,
        scenario,
        profile: PROFILE,
        provider: PROVIDER,
        port,
        artifact: basename(artifact),
        probe: probeResult,
        dumpConfig: dumpPath,
        bootLogs
    };
    if (scenario === "parallel-contribution-model") {
        const evidence = JSON.parse(await readFile(modelEvidencePath, "utf8"));
        if (
            !Array.isArray(evidence) ||
            evidence.length !== probeResult.observed.messageIds.length ||
            evidence.some(
                (message, index) =>
                    message.id !== probeResult.observed.messageIds[index] ||
                    !["summary", "proposal"].includes(message.kind) ||
                    typeof message.content !== "string"
            )
        )
            throw new Error("Model discussion original evidence does not match the probe result.");
        result.modelDiscussion = evidence;
    }
    if (BROWSER_MODE) {
        console.log(JSON.stringify(result));
        console.log(`CONVIVIUM_SMOKE_BROWSER_URL=${browserLaunchUrl}`);
        console.log(`CONVIVIUM_SMOKE_TEMP_ROOT=${tempRoot}`);
        await waitForBrowserStop();
    }
    return result;
}

async function assertPortReleased(port) {
    const server = createServer();
    await new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen({ host: HOST, port, exclusive: true }, resolveListen);
    });
    await new Promise((resolveClose, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolveClose()))
    );
}

async function main() {
    const args = process.argv.slice(2);
    const scenarios = selectScenarios(args, process.env.CONVIVIUM_SMOKE_SCENARIO, BROWSER_MODE);
    validateTimeout(BOOT_TIMEOUT_MS, "CONVIVIUM_SMOKE_BOOT_TIMEOUT_MS");
    validateTimeout(COMMAND_TIMEOUT_MS, "CONVIVIUM_SMOKE_COMMAND_TIMEOUT_MS");
    const deepSeekApiKey = await loadSmokeApiKey(resolve(pluginRoot, "..", "dev.env"));
    const buildRoot = await mkdtemp(tempPrefix);
    const started = Date.now();
    try {
        const artifact = await packArtifact(buildRoot);
        for (const scenario of scenarios) {
            const start = Date.now();
            let result;
            try {
                result = await runScenario(scenario, artifact, deepSeekApiKey);
            } catch (error) {
                throw new Error(`Smoke ${scenario} failed: ${error.message}`, { cause: error });
            } finally {
                await restore();
                tempRoot = undefined;
            }
            if (args.includes("--json"))
                console.log(
                    JSON.stringify({ ...result, restore: "PASS", durationMs: Date.now() - start })
                );
            else console.log(`PASS ${scenario} ${Date.now() - start}ms restore=PASS`);
        }
    } finally {
        await restore(buildRoot);
    }
    if (BROWSER_MODE) console.log("CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok");
    if (!args.includes("--json"))
        console.log(`PASS ${scenarios.length} scenarios ${Date.now() - started}ms (one build)`);
}

const isMain =
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    try {
        await main();
    } catch (error) {
        console.error(redactBrowserCredentials(error.message));
        process.exitCode = 1;
    }
}
