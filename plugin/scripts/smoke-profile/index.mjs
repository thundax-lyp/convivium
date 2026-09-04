#!/usr/bin/env node
import { createConnection, createServer } from "node:net";
import { constants, createWriteStream } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import process from "node:process";
import { assertBrowserClientPreflight } from "./browser-client-preflight.mjs";
import { createSmokeEnvironment, loadSmokeApiKey } from "./environment.mjs";
import { validateColdCheckpoint } from "./probe/support.js";
import { validateScenarioResult } from "./result.mjs";

export { createSmokeEnvironment, loadSmokeApiKey } from "./environment.mjs";
export { validateScenarioResult } from "./result.mjs";

const DSH_VERSION = "0.1.1-rc.2";
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
    "baseline",
    "timeout",
    "reassign",
    "task-handraise",
    "completion-end",
    "risk-reopen",
    "decision-risk-closure",
    "cold-rebind",
    "archive-continuation",
    "mail-race",
    "cross-meeting",
    "convergence"
];
const SMOKE_SCENARIO = process.env.CONVIVIUM_SMOKE_SCENARIO ?? "baseline";

const tempPrefix = join(tmpdir(), "convivium-dsh-smoke-");

let tempRoot;
let bootProcess;

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
            process.stdout.write(chunk);
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
            process.stderr.write(chunk);
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
                new Error(`${command} ${args.join(" ")} exited with code ${code ?? signal}.`)
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

async function writeSmokePatch(path) {
    const patch = [
        "- id: convivium",
        "  config:",
        `    provider: ${PROVIDER}`,
        "    dataRoot: convivium-smoke-data",
        "    maxParticipants: 3",
        `    speakerTimeoutMs: ${process.env.CONVIVIUM_SMOKE_SCENARIO === "timeout" ? 250 : BROWSER_MODE ? BROWSER_SPEAKER_TIMEOUT_MS : 60000}`,
        `    outboxPollMs: ${process.env.CONVIVIUM_SMOKE_SCENARIO === "timeout" ? 25 : 1000}`,
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
    const dsh = dshCommand(["plugin", "--profile", PROFILE, "add", probeDir]);
    await runCommand(dsh.command, dsh.args, { env });
}

async function dumpConfig(env, patchPath, logsDir) {
    const dsh = dshCommand([PROFILE, "--patch", patchPath, "--dump-config"]);
    const result = await runCommand(dsh.command, dsh.args, { env });
    const dumpPath = join(logsDir, "dump-config.yml");
    await writeFile(dumpPath, result.stdout, "utf8");
    for (const expected of [
        CONVIVIUM_PACKAGE,
        "@deepseek-ai/dsh-subagent-spawn-in-process",
        PROVIDER
    ]) {
        if (!result.stdout.includes(expected)) {
            throw new Error(`dump-config did not include ${expected}.`);
        }
    }
    return dumpPath;
}

async function bootHost(env, patchPath, workspaceDir, logsDir, port) {
    const stdoutPath = join(logsDir, "boot.stdout.log");
    const stderrPath = join(logsDir, "boot.stderr.log");
    const stdout = createWriteStream(stdoutPath);
    const stderr = createWriteStream(stderrPath);
    const dsh = dshCommand([
        PROFILE,
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

async function restore() {
    await stopHost();
    if (tempRoot === undefined) return;
    const resolvedTempRoot = resolve(tempRoot);
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
}

function waitForBrowserStop() {
    return new Promise((resolveStop) => {
        const stop = () => {
            process.off("SIGINT", stop);
            process.off("SIGTERM", stop);
            resolveStop();
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
    });
}

async function main() {
    validateTimeout(BOOT_TIMEOUT_MS, "CONVIVIUM_SMOKE_BOOT_TIMEOUT_MS");
    validateTimeout(COMMAND_TIMEOUT_MS, "CONVIVIUM_SMOKE_COMMAND_TIMEOUT_MS");
    if (!SMOKE_SCENARIOS.includes(SMOKE_SCENARIO)) {
        throw new Error(`Unsupported CONVIVIUM_SMOKE_SCENARIO: ${SMOKE_SCENARIO}.`);
    }
    await access(join(pluginRoot, "package.json"), constants.R_OK);
    const deepSeekApiKey = await loadSmokeApiKey(resolve(pluginRoot, "..", "dev.env"));

    tempRoot = await mkdtemp(tempPrefix);
    const dshHome = join(tempRoot, "dsh-home");
    const workspaceDir = join(tempRoot, "workspace");
    const logsDir = join(tempRoot, "logs");
    const artifactDir = join(tempRoot, "artifact");
    const probeDir = join(tempRoot, "probe");
    const controlDir = join(tempRoot, "control");
    const patchPath = join(tempRoot, "convivium-smoke.patch.yml");
    const resultPath = join(tempRoot, "smoke-result.json");
    const coldCheckpointPath = join(controlDir, "cold-rebind-checkpoint.json");
    await mkdir(dshHome, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(logsDir, { recursive: true });
    await mkdir(artifactDir, { recursive: true });
    if (SMOKE_SCENARIO === "cold-rebind") await mkdir(controlDir, { recursive: true });
    await writeSmokePatch(patchPath);
    await writeProbePackage(probeDir);

    const env = createSmokeEnvironment(process.env, {
        DSH_HOME: dshHome,
        DSH_TELEMETRY_DISABLED: "1",
        DSH_PERMISSION_MODE: "workspace-write",
        CONVIVIUM_SMOKE_RESULT: resultPath,
        CONVIVIUM_SMOKE_SCENARIO: SMOKE_SCENARIO,
        ...(SMOKE_SCENARIO === "cold-rebind"
            ? { CONVIVIUM_SMOKE_COLD_CHECKPOINT: coldCheckpointPath }
            : {})
    });
    const port = await allocatePort();
    const artifact = await packArtifact(artifactDir);
    await installArtifact(env, artifact);
    await installProbe(env, probeDir);
    const dumpPath = await dumpConfig(env, patchPath, logsDir);
    const hostEnv = createSmokeEnvironment(env, {}, deepSeekApiKey);
    let bootLogs = await bootHost(hostEnv, patchPath, workspaceDir, logsDir, port);
    let probeResult = await waitForJson(resultPath, BOOT_TIMEOUT_MS);
    if (SMOKE_SCENARIO === "cold-rebind" && probeResult.phase1Complete === true) {
        const checkpoint = validateColdCheckpoint(
            JSON.parse(await readFile(coldCheckpointPath, "utf8"))
        );
        let missingFieldRejected = false;
        try {
            validateColdCheckpoint({ ...checkpoint, managerPlanningAttemptId: undefined });
        } catch {
            missingFieldRejected = true;
        }
        if (!missingFieldRejected) throw new Error("Cold checkpoint missing-field check failed.");
        await stopHost();
        await writeFile(resultPath, "", "utf8");
        await rm(resultPath + ".tmp", { force: true });
        hostEnv.CONVIVIUM_SMOKE_COLD_PHASE = "2";
        hostEnv.CONVIVIUM_SMOKE_COLD_CHECKPOINT = coldCheckpointPath;
        bootLogs = await bootHost(hostEnv, patchPath, workspaceDir, logsDir, port);
        await waitForTcp(port, BOOT_TIMEOUT_MS);
        probeResult = await waitForJson(resultPath, BOOT_TIMEOUT_MS);
    }
    if (!probeResult.ok) {
        const stdoutTail = (await readFile(bootLogs.stdoutPath, "utf8")).slice(-8000);
        const stderrTail = (await readFile(bootLogs.stderrPath, "utf8")).slice(-8000);
        throw new Error(
            `smoke probe failed: ${probeResult.error ?? "unknown error"}\n` +
                `stdout tail:\n${stdoutTail}\n` +
                `stderr tail:\n${stderrTail}`
        );
    }
    probeResult = validateScenarioResult(probeResult, SMOKE_SCENARIO);

    await stat(dumpPath);
    if (BROWSER_MODE && probeResult.browserReady === true) {
        const origin = `http://${HOST}:${port}`;
        await assertBrowserClientPreflight(origin);
    }
    console.log(
        JSON.stringify(
            {
                ok: true,
                profile: PROFILE,
                provider: PROVIDER,
                port,
                artifact: basename(artifact),
                probe: probeResult,
                dumpConfig: dumpPath,
                bootLogs
            },
            null,
            2
        )
    );
    if (BROWSER_MODE) {
        console.log(`CONVIVIUM_SMOKE_BROWSER_URL=http://${HOST}:${port}`);
        console.log(`CONVIVIUM_SMOKE_TEMP_ROOT=${tempRoot}`);
        await waitForBrowserStop();
    }
}

const isMain =
    process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    try {
        await main();
    } finally {
        await restore();
        if (BROWSER_MODE) console.log("CONVIVIUM_SMOKE_BROWSER_CLEANUP=ok");
    }
}
