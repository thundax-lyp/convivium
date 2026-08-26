#!/usr/bin/env node
import { createConnection, createServer } from "node:net";
import { constants, createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const DSH_VERSION = "0.1.1-rc.2";
const PROFILE = "web";
const PROVIDER = "spawn";
const DSH_PACKAGE = `@deepseek-ai/dsh@${DSH_VERSION}`;
const CONVIVIUM_PACKAGE = "@convivium/dsh-plugin";
const HOST = "127.0.0.1";
const BOOT_TIMEOUT_MS = Number(process.env.CONVIVIUM_SMOKE_BOOT_TIMEOUT_MS ?? "30000");
const COMMAND_TIMEOUT_MS = Number(process.env.CONVIVIUM_SMOKE_COMMAND_TIMEOUT_MS ?? "120000");

const pluginRoot = resolve(process.cwd());
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
            env: { ...process.env, ...options.env },
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
        "    speakerTimeoutMs: 60000",
        "    outboxPollMs: 1000",
        ""
    ].join("\n");
    await writeFile(path, patch, "utf8");
}

async function installArtifact(env, artifact) {
    const dsh = dshCommand(["plugin", "--profile", PROFILE, "add", artifact]);
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

    let ready = false;
    const earlyExit = new Promise((_, rejectEarly) => {
        bootProcess.once("exit", (code, signal) => {
            if (ready) return;
            rejectEarly(new Error(`DSH host exited before readiness: ${code ?? signal}.`));
        });
        bootProcess.once("error", rejectEarly);
    });

    await Promise.race([waitForTcp(port, BOOT_TIMEOUT_MS), earlyExit]);
    ready = true;
    return { stdoutPath, stderrPath };
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
    await rm(resolvedTempRoot, { recursive: true, force: true });
    if (await pathExists(resolvedTempRoot)) {
        throw new Error(`Smoke restore failed to remove ${resolvedTempRoot}.`);
    }
}

async function main() {
    validateTimeout(BOOT_TIMEOUT_MS, "CONVIVIUM_SMOKE_BOOT_TIMEOUT_MS");
    validateTimeout(COMMAND_TIMEOUT_MS, "CONVIVIUM_SMOKE_COMMAND_TIMEOUT_MS");
    await access(join(pluginRoot, "package.json"), constants.R_OK);

    tempRoot = await mkdtemp(tempPrefix);
    const dshHome = join(tempRoot, "dsh-home");
    const workspaceDir = join(tempRoot, "workspace");
    const logsDir = join(tempRoot, "logs");
    const artifactDir = join(tempRoot, "artifact");
    const patchPath = join(tempRoot, "convivium-smoke.patch.yml");
    await mkdir(dshHome, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(logsDir, { recursive: true });
    await mkdir(artifactDir, { recursive: true });
    await writeSmokePatch(patchPath);

    const env = {
        DSH_HOME: dshHome,
        DSH_TELEMETRY_DISABLED: "1",
        DSH_PERMISSION_MODE: "workspace-write"
    };
    const port = await allocatePort();
    const artifact = await packArtifact(artifactDir);
    await installArtifact(env, artifact);
    const dumpPath = await dumpConfig(env, patchPath, logsDir);
    const bootLogs = await bootHost(env, patchPath, workspaceDir, logsDir, port);

    await stat(dumpPath);
    console.log(
        JSON.stringify(
            {
                ok: true,
                profile: PROFILE,
                provider: PROVIDER,
                port,
                artifact: basename(artifact),
                dumpConfig: dumpPath,
                bootLogs
            },
            null,
            2
        )
    );
}

try {
    await main();
} finally {
    await restore();
}
