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
const BOOT_TIMEOUT_MS = Number(process.env.CONVIVIUM_SMOKE_BOOT_TIMEOUT_MS ?? "120000");
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
export const inject = ["agents", "sessions", "tools"];

const outputPath = process.env.CONVIVIUM_SMOKE_RESULT;
const participants = ["participant-a", "participant-c", "participant-b"];
let captain;
let meetingId;
let nextCall = 1000;
const drivingAgents = new Set();

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
        selectionMode: "manager",
        objectiveContract: {
            requiredOutputs: [],
            acceptanceCriteria: [{ key: "smoke-order", description: "A/C/B committed" }],
            hardConstraints: [],
            requiredReviewerKeys: [],
            riskAcceptanceAuthorityKeys: [],
            acceptableRiskLevel: "low"
        },
        agenda: [{
            key: "agenda-1",
            title: "Smoke order",
            objective: "Commit A then C then B",
            inScope: ["tool execution"],
            outOfScope: ["Meeting HTTP route"],
            completionCriteria: ["smoke-order"],
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

async function waitForAgent(ctx, id) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const agent = ctx.agents.get(id);
        if (agent) return agent;
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error("Timed out waiting for real participant Agent " + id + ".");
}

async function waitForCommittedMessages(ctx, captain, meetingId, count) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const status = await callTool(ctx, captain, "convivium_meeting_status", {
            protocolVersion: 1,
            meetingId
        }, 100 + count);
        if (status.result.messages.length >= count) return status;
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error("Timed out waiting for committed participant message " + count + ".");
}

function createSmokeAgent(ctx, sessionId) {
    const session = ctx.sessions.create(sessionId, {
        meta: { cwd: process.cwd() }
    });
    return registerSmokeAgent(ctx, session);
}

function registerSmokeAgent(ctx, session) {
    const agent = {
        id: session.id,
        options: {},
        session,
        inbox: {
            nextTurn: [],
            nextStep: []
        },
        status: "idle",
        ctx,
        cancel() {},
        async whenIdle() {},
        async runMaintenance(task) {
            return task(new AbortController().signal);
        },
        send() {},
        followup() {},
        steer() {},
        inject() {}
    };
    const unregister = ctx.agents.register(agent);
    return {
        agent,
        async dispose() {
            unregister();
        }
    };
}

async function driveParticipant(ctx, agent) {
    if (captain === undefined || meetingId === undefined) return;
    const participantId = "participant-" + String(agent.id).split("-").at(-1);
    const index = participants.indexOf(participantId);
    if (index < 0) return;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (ctx.agents.get(agent.id) !== agent) return;
        const status = await callTool(ctx, captain.agent, "convivium_meeting_status", {
            protocolVersion: 1,
            meetingId
        }, nextCall++);
        if (status.result.messages.length >= index + 1) return;
        if (status.result.currentSpeakerId !== participantId) {
            await new Promise((resolveWait) => setTimeout(resolveWait, 100));
            continue;
        }
        try {
            await callTool(ctx, agent, "convivium_submit_turn", {
                protocolVersion: 1,
                meetingId,
                turnId: "turn-1",
                stepId: "step-turn-1-" + index,
                attemptId: "turn-1-attempt-" + index,
                deliveryId: "turn-1-delivery-" + index,
                agendaItemId: "agenda-agenda-1",
                kind: "statement",
                content: ["A", "C", "B"][index],
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic",
                changes: {}
            }, nextCall++);
            return;
        } catch (error) {
            if (String(error).includes('"code":"STALE_ATTEMPT"')) return;
            if (ctx.agents.get(agent.id) !== agent) return;
            throw error;
        }
    }
}

function scheduleParticipant(ctx, agent) {
    const id = String(agent.id);
    if (drivingAgents.has(id)) return;
    drivingAgents.add(id);
    void driveParticipant(ctx, agent)
        .catch((error) => {
            console.error("participant smoke driver failed:", error);
        })
        .finally(() => drivingAgents.delete(id));
}

async function run(ctx) {
    if (!outputPath) return;
    try {
        captain = createSmokeAgent(ctx, "convivium-smoke-captain");
        const created = await callTool(ctx, captain.agent, "convivium_create_meeting", createInput(), 0);
        meetingId = created.result.meetingId;
        const manager = await waitForAgent(ctx, meetingId + "-manager-manager");
        const managerPlan = await callTool(ctx, manager, "convivium_submit_manager_plan", {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: meetingId + "-planning-1",
            observedMeetingVersion: created.meetingVersion,
            requestId: "smoke-plan-1",
            agendaItemId: "agenda-agenda-1",
            intent: "explore",
            objective: "Commit A then C then B",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                { participantId: "participant-a", instruction: "A", reason: "manager_selected" },
                { participantId: "participant-c", instruction: "C", reason: "manager_selected" },
                { participantId: "participant-b", instruction: "B", reason: "manager_selected" }
            ]
        }, 1);
        const messages = [];
        for (let index = 0; index < participants.length; index += 1) {
            const participantId = participants[index];
            const stepDeadline = Date.now() + 30000;
            while (Date.now() < stepDeadline) {
                const beforeSubmit = await callTool(ctx, captain.agent, "convivium_meeting_status", {
                    protocolVersion: 1,
                    meetingId
                }, nextCall++);
                if (beforeSubmit.result.messages.length >= index + 1) break;
                await new Promise((resolveWait) => setTimeout(resolveWait, 100));
            }
            if (Date.now() >= stepDeadline) {
                throw new Error("Timed out waiting for committed participant step " + index + ".");
            }
        }
        const status = await callTool(ctx, captain.agent, "convivium_meeting_status", {
            protocolVersion: 1,
            meetingId
        }, 10);
        const transcript = status.result.messages;
        assert(transcript.map((message) => message.content).join("") === "ACB", "transcript order is not ACB");
        assert(status.result.status === "running", "next planning did not keep meeting running");
        assert(status.result.currentTurn === undefined, "next planning unexpectedly exposed a current turn");
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
            managerPlan: managerPlan.result,
            nextPlanObserved: status.result.currentTurn === undefined,
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
    ctx.on("agent/created", ({ agent }) => {
        if (String(agent.id).includes("-participant-")) {
            agent.ctx.on("agent/status", () => scheduleParticipant(ctx, agent));
            agent.ctx.on("agent/inbox/inserted", () => scheduleParticipant(ctx, agent));
            scheduleParticipant(ctx, agent);
        }
    });
    ctx.on("agent/status", ({ agent }) => {
        if (String(agent.id).includes("-participant-")) scheduleParticipant(ctx, agent);
    });
    ctx.on("agent/inbox/inserted", ({ agent }) => {
        if (String(agent.id).includes("-participant-")) scheduleParticipant(ctx, agent);
    });
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
        ...process.env,
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
