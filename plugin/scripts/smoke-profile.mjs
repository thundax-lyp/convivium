#!/usr/bin/env node
import { createConnection, createServer } from "node:net";
import { constants, createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const DSH_VERSION = "0.1.1-rc.2";
const PROFILE = "web";
const PROVIDER = "spawn";
const DSH_PACKAGE = `@deepseek-ai/dsh@${DSH_VERSION}`;
const CONVIVIUM_PACKAGE = "@convivium/dsh-plugin";
const PROBE_PACKAGE = "@convivium/smoke-profile-probe";
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

async function writeProbePackage(probeDir) {
    await mkdir(probeDir, { recursive: true });
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
    await writeFile(
        join(probeDir, "index.js"),
        String.raw`
export const name = "convivium-smoke-profile-probe";
export const inject = ["agents", "tools"];

const outputPath = process.env.CONVIVIUM_SMOKE_RESULT;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function callTool(ctx, agent, name, input, index) {
    const result = await ctx.tools.execute({
        callId: "convivium-smoke-" + index,
        name,
        arguments: { input },
        agent,
        signal: new AbortController().signal
    });
    if (result.isError) throw new Error(result.error.message);
    if (!result.value?.ok) throw new Error(name + " failed: " + JSON.stringify(result.value));
    return result.value;
}

function createInput() {
    return {
        protocolVersion: 1,
        requestId: "smoke-create-1",
        teamId: "smoke-team",
        topic: "Runtime smoke",
        objective: "Verify Convivium tool sequencing",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [],
            hardConstraints: [],
            requiredReviewerKeys: [],
            riskAcceptanceAuthorityKeys: [],
            acceptableRiskLevel: "low"
        },
        agenda: [{
            key: "agenda-1",
            title: "Smoke order",
            objective: "Commit A then B then C",
            inScope: ["tool execution"],
            outOfScope: ["Meeting HTTP route"],
            completionCriteria: ["A/B/C committed"],
            requiredParticipantKeys: ["a", "b", "c"]
        }],
        participants: [
            { participantKey: "a", displayName: "A" },
            { participantKey: "b", displayName: "B" },
            { participantKey: "c", displayName: "C" }
        ]
    };
}

async function writeResult(value) {
    if (!outputPath) return;
    const fs = await import("node:fs/promises");
    await fs.writeFile(outputPath, JSON.stringify(value, null, 2));
}

async function run(ctx) {
    if (!outputPath) return;
    let captain;
    try {
        captain = await ctx.agents.create({
            sessionId: "convivium-smoke-captain",
            meta: { cwd: process.cwd() }
        });
        const created = await callTool(ctx, captain.agent, "convivium_create_meeting", createInput(), 0);
        const meetingId = created.result.meetingId;
        const participants = created.result.participants.map((participant) => participant.participantId);
        const messages = [];
        for (let index = 0; index < participants.length; index += 1) {
            const participantId = participants[index];
            const agent = ctx.agents.get(meetingId + "-participant-" + participantId);
            assert(agent, "participant agent not found: " + participantId);
            const submitted = await callTool(ctx, agent, "convivium_submit_turn", {
                protocolVersion: 1,
                meetingId,
                turnId: "turn-1",
                stepId: "step-" + participantId + "-" + index,
                attemptId: "attempt-" + index,
                deliveryId: "delivery-" + index,
                agendaItemId: "agenda-agenda-1",
                kind: "statement",
                content: String.fromCharCode(65 + index),
                mentions: [],
                taskIds: [],
                agendaRelation: "active",
                changes: {}
            }, index + 1);
            messages.push(submitted.result.messageId);
        }
        const status = await callTool(ctx, captain.agent, "convivium_meeting_status", {
            protocolVersion: 1,
            meetingId
        }, 10);
        const transcript = status.result.transcript;
        assert(transcript.map((message) => message.content).join("") === "ABC", "transcript order is not ABC");
        const pause = await callTool(ctx, captain.agent, "convivium_pause_meeting", {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: status.meetingVersion,
            requestId: "smoke-pause-1",
            reason: "profile smoke"
        }, 11);
        const resume = await callTool(ctx, captain.agent, "convivium_resume_meeting", {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: pause.meetingVersion,
            requestId: "smoke-resume-1"
        }, 12);
        await writeResult({
            ok: true,
            meetingId,
            participants,
            messages,
            transcript: transcript.map((message) => ({
                id: message.id,
                seq: message.seq,
                content: message.content,
                speaker: message.speaker
            })),
            pause: pause.result,
            resume: resume.result,
            httpRouteUsed: false
        });
    } catch (error) {
        await writeResult({
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        });
    } finally {
        await captain?.dispose();
    }
}

export function apply(ctx) {
    ctx.effect(() => {
        void run(ctx);
    }, "convivium-smoke-profile-probe");
}
`,
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

async function waitForJson(path, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await pathExists(path)) {
            return JSON.parse(await readFile(path, "utf8"));
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
    const probeDir = join(tempRoot, "probe");
    const patchPath = join(tempRoot, "convivium-smoke.patch.yml");
    const resultPath = join(tempRoot, "smoke-result.json");
    await mkdir(dshHome, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    await mkdir(logsDir, { recursive: true });
    await mkdir(artifactDir, { recursive: true });
    await writeSmokePatch(patchPath);
    await writeProbePackage(probeDir);

    const env = {
        DSH_HOME: dshHome,
        DSH_TELEMETRY_DISABLED: "1",
        DSH_PERMISSION_MODE: "workspace-write",
        CONVIVIUM_SMOKE_RESULT: resultPath
    };
    const port = await allocatePort();
    const artifact = await packArtifact(artifactDir);
    await installArtifact(env, artifact);
    await installProbe(env, probeDir);
    const dumpPath = await dumpConfig(env, patchPath, logsDir);
    const bootLogs = await bootHost(env, patchPath, workspaceDir, logsDir, port);
    const probeResult = await waitForJson(resultPath, BOOT_TIMEOUT_MS);
    if (!probeResult.ok) {
        throw new Error(`smoke probe failed: ${probeResult.error ?? "unknown error"}`);
    }

    await stat(dumpPath);
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
}

try {
    await main();
} finally {
    await restore();
}
