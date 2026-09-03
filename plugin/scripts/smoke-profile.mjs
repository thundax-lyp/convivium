#!/usr/bin/env node
import { createConnection, createServer } from "node:net";
import { constants, createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import process from "node:process";
import { createSmokeEnvironment } from "./smoke-environment.mjs";

const DSH_VERSION = "0.1.1-rc.2";
const PROFILE = "web";
const PROVIDER = "spawn";
const DSH_PACKAGE = `@deepseek-ai/dsh@${DSH_VERSION}`;
const CONVIVIUM_PACKAGE = "@convivium/dsh-plugin";
const PROBE_PACKAGE = "@convivium/smoke-profile-probe";
const HOST = "127.0.0.1";
const pluginRoot = resolve(process.cwd());
const BOOT_TIMEOUT_MS = Number(process.env.CONVIVIUM_SMOKE_BOOT_TIMEOUT_MS ?? "120000");
const COMMAND_TIMEOUT_MS = Number(process.env.CONVIVIUM_SMOKE_COMMAND_TIMEOUT_MS ?? "120000");
const BROWSER_MODE = process.env.CONVIVIUM_SMOKE_BROWSER_MODE === "1";
const SMOKE_SCENARIOS = [
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
    "cross-meeting"
];
const SMOKE_SCENARIO = process.env.CONVIVIUM_SMOKE_SCENARIO ?? "baseline";

export function validateScenarioResult(value, expectedScenario) {
    if (value === null || typeof value !== "object" || value.ok !== true) {
        throw new Error("Smoke result is not successful.");
    }
    if (value.scenario !== expectedScenario || !Array.isArray(value.assertions)) {
        throw new Error("Smoke result scenario contract mismatch.");
    }
    if (expectedScenario === "decision-risk-closure") {
        const requiredAssertions = [
            "candidate-visible-to-captain",
            "candidate-accepted",
            "accepted-candidate-not-pending",
            "decision-history-current-state",
            "decision-pending-by-current-revision",
            "risk-disposition-status",
            "risk-blocking-facts",
            "risk-replay-version-stable",
            "event-order-not-observable-by-command-status"
        ];
        if (requiredAssertions.some((label) => !value.assertions.includes(label))) {
            throw new Error("Decision risk smoke assertions are incomplete.");
        }
    }
    return value;
}

function validateColdCheckpoint(value) {
    if (value === null || typeof value !== "object") {
        throw new Error("Cold checkpoint must be an object.");
    }
    const stringFields = [
        "captainSessionId",
        "meetingId",
        "managerSessionId",
        "participantSessionId",
        "managerPlanningAttemptId"
    ];
    if (value.schemaVersion !== 1 || value.scenario !== "cold-rebind" || value.phase !== 1) {
        throw new Error("Cold checkpoint constants are invalid.");
    }
    if (!Number.isInteger(value.hostPid) || value.hostPid <= 0) {
        throw new Error("Cold checkpoint hostPid is invalid.");
    }
    if (!Number.isInteger(value.meetingVersion) || value.meetingVersion < 0) {
        throw new Error("Cold checkpoint meetingVersion is invalid.");
    }
    if (
        !Number.isInteger(value.managerPlanningMeetingVersion) ||
        value.managerPlanningMeetingVersion !== value.meetingVersion
    ) {
        throw new Error("Cold checkpoint planning version is invalid.");
    }
    for (const field of stringFields) {
        if (typeof value[field] !== "string" || value[field] === "") {
            throw new Error(`Cold checkpoint ${field} is invalid.`);
        }
    }
    if (value.captainSessionId !== "convivium-smoke-captain") {
        throw new Error("Cold checkpoint Captain Session is invalid.");
    }
    if (
        !Array.isArray(value.sessionIds) ||
        value.sessionIds.length !== 2 ||
        value.sessionIds[0] !== value.managerSessionId ||
        value.sessionIds[1] !== value.participantSessionId
    ) {
        throw new Error("Cold checkpoint child Session IDs are invalid.");
    }
    if (
        !Array.isArray(value.transcriptMessageIds) ||
        value.transcriptMessageIds.length === 0 ||
        value.transcriptMessageIds.some((id) => typeof id !== "string" || id === "")
    ) {
        throw new Error("Cold checkpoint transcript IDs are invalid.");
    }
    return Object.freeze({
        ...value,
        sessionIds: Object.freeze([...value.sessionIds]),
        transcriptMessageIds: Object.freeze([...value.transcriptMessageIds])
    });
}

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
        `    speakerTimeoutMs: ${process.env.CONVIVIUM_SMOKE_SCENARIO === "timeout" ? 250 : 60000}`,
        `    outboxPollMs: ${process.env.CONVIVIUM_SMOKE_SCENARIO === "timeout" ? 25 : 1000}`,
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
export const inject = ["agents", "sessions", "sessionPersistence", "subagents", "tools", "webServer", "workspaceRegistry"];

const outputPath = process.env.CONVIVIUM_SMOKE_RESULT;
const browserMode = process.env.CONVIVIUM_SMOKE_BROWSER_MODE === "1";
const scenario = process.env.CONVIVIUM_SMOKE_SCENARIO || "baseline";
${validateColdCheckpoint.toString()}
const participants = ["participant-a", "participant-c", "participant-b"];
let captain;
let meetingId;
let nextCall = 1000;
const drivingAgents = new Set();
const observedAgents = new Map();
const observedInboxMessages = new Map();
const inboxWaiters = new Set();
let releaseColdMaintenance;
let coldMaintenancePromise;
let releaseMailMaintenance;
let mailMaintenancePromise;

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
    if (result.isError) throw new Error(name + "#" + index + ": " + result.error.message);
    if (!result.value?.ok) throw new Error(name + " failed: " + JSON.stringify(result.value));
    return result.value;
}

async function callHttp(url, options) {
    const response = await fetch(url, options);
    assert(response.status === 200, "unexpected HTTP status for " + url + ": " + response.status);
    assert(
        response.headers.get("content-type")?.startsWith("application/json") === true,
        "unexpected HTTP content type for " + url
    );
    return response.json();
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
    const tempPath = outputPath + ".tmp";
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
    await fs.rename(tempPath, outputPath);
}

async function waitForAgent(ctx, id) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const agent = ctx.agents.get(id);
        if (agent) return agent;
        if (observedAgents.has(String(id)) && captain?.agent !== undefined) {
            return resumeParticipantForProbe(
                ctx,
                captain.agent,
                id,
                "convivium-smoke-resume:" + id
            );
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error(
        "Timed out waiting for real participant Agent " +
            id +
            "; observed=" +
            JSON.stringify([...observedAgents.keys()].sort())
    );
}

async function waitForObservedParticipant(ctx, meetingId, participantKey) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        for (const agent of observedAgents.values()) {
            const id = String(agent.id);
            if (id.includes(meetingId) && id.includes("participant-" + participantKey)) {
                const live = ctx.agents.get(agent.id);
                if (live === agent) return agent;
                if (captain?.agent !== undefined) {
                    return resumeParticipantForProbe(
                        ctx,
                        captain.agent,
                        agent.id,
                        "convivium-smoke-resume:" + id
                    );
                }
            }
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error("Timed out waiting for observed participant Agent " + participantKey + ".");
}

function observedMessages(agent) {
    return [
        ...(agent.inbox.nextTurn ?? []),
        ...(agent.inbox.nextStep ?? []),
        ...(observedInboxMessages.get(String(agent.id)) ?? [])
    ];
}

function messageText(message) {
    return Array.isArray(message.content)
        ? message.content.find((part) => part.type === "text")?.text
        : message.content;
}

function messageTexts(message) {
    if (!Array.isArray(message.content)) {
        return typeof message.content === "string" ? [message.content] : [];
    }
    return message.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text);
}

function recordInbox(agent, message) {
    const list = observedInboxMessages.get(String(agent.id)) ?? [];
    list.push(message);
    observedInboxMessages.set(String(agent.id), list);
    for (const waiter of [...inboxWaiters]) waiter(agent, message);
}

function waitForInbox(ctx, agentId, select) {
    return new Promise((resolveInbox, rejectInbox) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            inboxWaiters.delete(onInbox);
            resolveInbox(value);
        };
        const onInbox = (agent, message) => {
            if (String(agent.id) !== String(agentId) || ctx.agents.get(agent.id) !== agent) return;
            const selected = select(message, agent);
            if (selected !== undefined) finish({ value: selected, agent });
        };
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            inboxWaiters.delete(onInbox);
            rejectInbox(new Error("Timed out waiting for live inbox delivery " + agentId + "."));
        }, 30000);
        inboxWaiters.add(onInbox);
        const live = ctx.agents.get(agentId);
        if (live !== undefined) {
            for (const message of observedMessages(live)) onInbox(live, message);
        }
    });
}

async function resumeParticipantForProbe(ctx, parent, childId, marker) {
    const delivery = waitForInbox(ctx, childId, (message) =>
        messageText(message)?.includes(marker) ? marker : undefined
    );
    await ctx.subagents.followup(
        parent,
        childId,
        [{ type: "text", text: marker }],
        {
            source: { kind: "coordinator", form: "relay", senderSessionId: parent.id },
            signal: new AbortController().signal
        }
    );
    return (await delivery).agent;
}

async function waitForSpeakerContext(ctx, agentId, attemptId) {
    return waitForInbox(ctx, agentId, (message) => {
            const text = messageText(message);
            const marker = typeof text === "string" ? text.indexOf("speaker context: ") : -1;
            if (marker < 0) return undefined;
            try {
                const context = JSON.parse(text.slice(marker + "speaker context: ".length));
                if (context.attempt?.attemptId === attemptId) return context;
            } catch {}
            return undefined;
    });
}

async function waitForTaskDelivery(ctx, agentId, meetingTaskId) {
    return waitForInbox(ctx, agentId, (message) => {
            const text = messageText(message);
            if (typeof text !== "string" || !text.startsWith("Execute MeetingTask " + meetingTaskId + ":")) return undefined;
            const executionId = text.match(/^executionId: (.+)$/m)?.[1];
            const deliveryId = text.match(/^deliveryId: (.+)$/m)?.[1];
            if (executionId && deliveryId) return { executionId, deliveryId };
            return undefined;
    });
}

async function waitForStoredManagerContext(
    agentId,
    meetingId,
    excludedPlanningAttemptId,
    expectedMeetingVersion
) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        for (const message of observedInboxMessages.get(String(agentId)) ?? []) {
            const text = messageText(message);
            if (typeof text !== "string") continue;
            try {
                const marker = text.indexOf("manager context: ");
                const context = JSON.parse(marker >= 0 ? text.slice(marker + "manager context: ".length) : text);
                if (
                    context.meetingId === meetingId &&
                    context.planningAttemptId &&
                    context.planningAttemptId !== excludedPlanningAttemptId &&
                    Number.isInteger(context.meetingVersion) &&
                    (expectedMeetingVersion === undefined ||
                        context.meetingVersion === expectedMeetingVersion)
                )
                    return context;
            } catch {}
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error("Timed out waiting for the later Manager planning context.");
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
    if (scenario === "reassign" || scenario === "task-handraise" || scenario === "archive-continuation" || scenario === "mail-race" || scenario === "cross-meeting" || scenario === "decision-risk-closure") return;
    if (scenario === "timeout" && participantId === "participant-a") return;
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

async function runDecisionRiskClosureScenario(ctx) {
    const input = createInput();
    input.requestId = "smoke-decision-risk-create-1";
    input.topic = "Decision risk closure";
    input.objectiveContract.acceptableRiskLevel = "high";
    input.agenda[0].requiredParticipantKeys = ["a"];
    input.participants = [{ participantKey: "a", displayName: "A" }];

    const created = await callTool(
        ctx,
        captain.agent,
        "convivium_create_meeting",
        input,
        1100
    );
    meetingId = created.result.meetingId;
    const initialStatus = await callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1101
    );
    const manager = await waitForAgent(ctx, meetingId + "-manager-manager");
    const managerContext = await waitForStoredManagerContext(manager.id, meetingId, "");
    const plan = await callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: managerContext.planningAttemptId,
            observedMeetingVersion: managerContext.meetingVersion,
            requestId: "smoke-decision-risk-plan-1",
            agendaItemId: initialStatus.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Submit a proposal and decision candidate",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-a",
                    instruction: "Submit the proposal",
                    reason: "manager_selected"
                }
            ]
        },
        1102
    );
    const participantSessionId = meetingId + "-participant-participant-a";
    const delivery = await waitForSpeakerContext(
        ctx,
        participantSessionId,
        plan.result.firstAttemptId
    );
    const deliveryId = delivery.value.attempt.deliveryId;
    const submitted = await callTool(
        ctx,
        delivery.agent,
        "convivium_submit_turn",
        {
            protocolVersion: 1,
            meetingId,
            turnId: delivery.value.turn.id,
            stepId: delivery.value.step.id,
            attemptId: delivery.value.attempt.attemptId,
            deliveryId,
            agendaItemId: delivery.value.activeAgendaItem.id,
            kind: "proposal",
            content: "Use the accepted proposal",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {
                proposals: [
                    {
                        title: "Closure proposal",
                        description: "Use the accepted proposal."
                    }
                ],
                positions: [
                    {
                        proposalId: deliveryId + "-proposal-1",
                        proposalRevision: 1,
                        position: "accept",
                        blocking: false
                    }
                ],
                decisionProposals: [
                    {
                        proposalId: deliveryId + "-proposal-1",
                        proposalRevision: 1,
                        statement: "Accept the closure proposal",
                        rationale: "The proposal satisfies the objective."
                    }
                ],
                questions: [],
                issues: [],
                agendaCandidates: []
            }
        },
        1103
    );
    const candidateStatus = await callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1104
    );
    const candidates = candidateStatus.result.pendingDecisionCandidates;
    assert(Array.isArray(candidates) && candidates.length === 1, "pending decision candidate missing");
    const candidate = candidates[0];
    assert(candidate.proposalRevision === 1, "candidate revision mismatch");
    assert(candidate.sourceMessageId === submitted.result.messageId, "candidate source message mismatch");

    const accepted = await callTool(
        ctx,
        captain.agent,
        "convivium_accept_decision",
        {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: candidateStatus.meetingVersion,
            requestId: "smoke-decision-risk-accept-1",
            decisionCandidateId: candidate.id,
            reason: "Captain accepts the candidate.",
            evidenceMessageIds: [submitted.result.messageId]
        },
        1105
    );
    const acceptedStatus = await callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1106
    );
    assert(acceptedStatus.result.pendingDecisionCandidates.length === 0, "accepted candidate remained pending");
    assert(acceptedStatus.result.acceptedDecisions.some((decision) => decision.id === accepted.result.decisionId), "accepted decision missing");
    assert(acceptedStatus.result.decisionHistory.some((decision) => decision.id === accepted.result.decisionId), "decision history missing accepted decision");
    const pauseAfterAcceptance = await callTool(ctx, captain.agent, "convivium_pause_meeting", {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: acceptedStatus.meetingVersion,
        reason: "Refresh decision lifecycle planning context.",
        requestId: "smoke-decision-risk-pause-1"
    }, 1107);
    const resumeAfterAcceptance = await callTool(ctx, captain.agent, "convivium_resume_meeting", {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: pauseAfterAcceptance.meetingVersion,
        requestId: "smoke-decision-risk-resume-1"
    }, 1110);
    const laterManagerContext = await waitForStoredManagerContext(
        manager.id,
        meetingId,
        managerContext.planningAttemptId,
        resumeAfterAcceptance.meetingVersion
    );
    const replacementPlan = await callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: laterManagerContext.planningAttemptId,
            observedMeetingVersion: laterManagerContext.meetingVersion,
            requestId: "smoke-decision-risk-plan-2",
            agendaItemId: acceptedStatus.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Submit a replacement decision candidate",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [{
                participantId: "participant-a",
                instruction: "Revise the proposal",
                reason: "manager_selected"
            }]
        },
        1111
    );
    const replacementDelivery = await waitForSpeakerContext(
        ctx,
        participantSessionId,
        replacementPlan.result.firstAttemptId
    );
    const replacementDeliveryId = replacementDelivery.value.attempt.deliveryId;
    const replacementSubmitted = await callTool(ctx, replacementDelivery.agent, "convivium_submit_turn", {
        protocolVersion: 1,
        meetingId,
        turnId: replacementDelivery.value.turn.id,
        stepId: replacementDelivery.value.step.id,
        attemptId: replacementDelivery.value.attempt.attemptId,
        deliveryId: replacementDeliveryId,
        agendaItemId: replacementDelivery.value.activeAgendaItem.id,
        kind: "proposal",
        content: "Revise the accepted proposal",
        mentions: [],
        taskIds: [],
        agendaRelation: "on_topic",
        changes: {
            proposals: [{
                proposalId: candidate.proposalId,
                expectedRevision: 1,
                title: "Closure proposal revision",
                description: "Use the revised accepted proposal."
            }],
            positions: [{
                proposalId: candidate.proposalId,
                proposalRevision: 2,
                position: "accept",
                blocking: false
            }],
            decisionProposals: [{
                proposalId: candidate.proposalId,
                proposalRevision: 2,
                statement: "Accept the revised closure proposal",
                rationale: "The revision addresses the new evidence."
            }],
            questions: [],
            issues: [],
            agendaCandidates: []
        }
    }, 1108);
    const replacementCandidateStatus = await callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1109
    );
    const replacementCandidates = replacementCandidateStatus.result.pendingDecisionCandidates;
    assert(
        replacementCandidates.length === 1 &&
            replacementCandidates[0].proposalRevision === 2 &&
            replacementCandidates[0].proposalId === candidate.proposalId,
        "replacement candidate revision is not pending"
    );
    const replacementCandidate = replacementCandidates[0];
    const supersedeInput = {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: replacementCandidateStatus.meetingVersion,
        requestId: "smoke-decision-risk-supersede-1",
        decisionId: accepted.result.decisionId,
        action: "supersede",
        reason: "Supersede with the revised candidate.",
        evidenceMessageIds: [submitted.result.messageId, replacementSubmitted.result.messageId],
        replacementCandidateId: replacementCandidate.id
    };
    const superseded = await callTool(ctx, captain.agent, "convivium_dispose_decision", supersedeInput, 1112);
    const supersedeReplay = await callTool(ctx, captain.agent, "convivium_dispose_decision", supersedeInput, 1113);
    assert(JSON.stringify(supersedeReplay.result) === JSON.stringify(superseded.result), "decision supersede replay result mismatch");
    assert(supersedeReplay.meetingVersion === superseded.meetingVersion, "decision supersede replay changed meeting version");
    const supersededStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 1114);
    const oldDecision = supersededStatus.result.decisionHistory.find((decision) => decision.id === accepted.result.decisionId);
    const replacementDecision = supersededStatus.result.decisionHistory.find((decision) => decision.id === superseded.result.replacementDecisionId);
    assert(oldDecision?.status === "superseded", "old decision was not superseded");
    assert(oldDecision.supersededByDecisionId === replacementDecision?.id, "superseded decision link is missing");
    assert(replacementDecision?.status === "accepted", "replacement decision is not accepted");
    assert(supersededStatus.result.acceptedDecisions.length === 1 && supersededStatus.result.acceptedDecisions[0].id === replacementDecision.id, "replacement decision is not the current accepted decision");
    assert(supersededStatus.result.pendingDecisionCandidates.length === 0, "superseded candidate remained pending");
    const revokeInput = {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: supersededStatus.meetingVersion,
        requestId: "smoke-decision-risk-revoke-1",
        decisionId: replacementDecision.id,
        action: "revoke",
        reason: "Revoke the replacement decision.",
        evidenceMessageIds: [replacementSubmitted.result.messageId]
    };
    const revoked = await callTool(ctx, captain.agent, "convivium_dispose_decision", revokeInput, 1115);
    const revokedStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 1116);
    const history = revokedStatus.result.decisionHistory;
    assert(history.length === 2, "decision history does not retain both decisions");
    assert(history[0].id === oldDecision.id && history[0].status === "superseded", "decision history order changed");
    assert(history[1].id === replacementDecision.id && history[1].status === "revoked", "replacement revoke missing from history");
    assert(revokedStatus.result.acceptedDecisions.length === 0, "revoked decision remains current accepted");
    assert(revoked.result.action === "revoke", "revoke result action mismatch");
    const pauseAfterRevoke = await callTool(ctx, captain.agent, "convivium_pause_meeting", {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: revokedStatus.meetingVersion,
        reason: "Refresh risk lifecycle planning context.",
        requestId: "smoke-decision-risk-pause-2"
    }, 1117);
    const resumeAfterRevoke = await callTool(ctx, captain.agent, "convivium_resume_meeting", {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: pauseAfterRevoke.meetingVersion,
        requestId: "smoke-decision-risk-resume-2"
    }, 1118);
    const riskManagerContext = await waitForStoredManagerContext(
        manager.id,
        meetingId,
        laterManagerContext.planningAttemptId,
        resumeAfterRevoke.meetingVersion
    );
    const riskPlan = await callTool(ctx, manager, "convivium_submit_manager_plan", {
        protocolVersion: 1,
        meetingId,
        planningAttemptId: riskManagerContext.planningAttemptId,
        observedMeetingVersion: riskManagerContext.meetingVersion,
        requestId: "smoke-decision-risk-plan-3",
        agendaItemId: revokedStatus.result.activeAgendaItem.id,
        intent: "explore",
        objective: "Submit risk evidence",
        expectedOutputs: [],
        prohibitedTopics: [],
        steps: [{
            participantId: "participant-a",
            instruction: "Submit the risk",
            reason: "manager_selected"
        }]
    }, 1119);
    const riskDelivery = await waitForSpeakerContext(
        ctx,
        participantSessionId,
        riskPlan.result.firstAttemptId
    );
    const riskSubmitted = await callTool(ctx, riskDelivery.agent, "convivium_submit_turn", {
        protocolVersion: 1,
        meetingId,
        turnId: riskDelivery.value.turn.id,
        stepId: riskDelivery.value.step.id,
        attemptId: riskDelivery.value.attempt.attemptId,
        deliveryId: riskDelivery.value.attempt.deliveryId,
        agendaItemId: riskDelivery.value.activeAgendaItem.id,
        kind: "statement",
        content: "The proposal has a high risk.",
        mentions: [],
        taskIds: [],
        agendaRelation: "on_topic",
        changes: {
            proposals: [],
            positions: [],
            decisionProposals: [],
            questions: [],
            issues: [{
                title: "Closure risk",
                description: "The revised proposal has a high implementation risk.",
                affectedOutputIds: [],
                affectedCriterionIds: ["criterion-smoke-order"],
                violatedConstraintIds: [],
                impact: "high",
                urgency: "now",
                safeDefaultAvailable: false,
                riskLevel: "high"
            }],
            agendaCandidates: []
        }
    }, 1120);
    const riskStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 1121);
    const risk = riskStatus.result.risks.find((item) => item.title === "Closure risk");
    assert(risk?.status === "open" && risk.disposition === "blocking" && risk.blocking, "open risk state mismatch");
    assert(riskStatus.result.blockingFacts.some((fact) => fact.id === risk.id), "open risk missing from blocking facts");
    const riskAcceptInput = {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: riskStatus.meetingVersion,
        requestId: "smoke-decision-risk-accept-risk-1",
        issueId: risk.id,
        decision: "accept",
        reason: "Captain accepts the documented risk.",
        evidenceMessageIds: [riskSubmitted.result.messageId]
    };
    const riskAccepted = await callTool(ctx, captain.agent, "convivium_dispose_risk", riskAcceptInput, 1122);
    const acceptedRiskStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 1123);
    const acceptedRisk = acceptedRiskStatus.result.risks.find((item) => item.id === risk.id);
    assert(acceptedRisk?.status === "accepted_risk" && acceptedRisk.disposition === "accepted_risk" && !acceptedRisk.blocking, "accepted risk state mismatch");
    assert(!acceptedRiskStatus.result.blockingFacts.some((fact) => fact.id === risk.id), "accepted risk remains blocking");
    const riskReplay = await callTool(ctx, captain.agent, "convivium_dispose_risk", riskAcceptInput, 1124);
    assert(JSON.stringify(riskReplay.result) === JSON.stringify(riskAccepted.result), "risk replay result mismatch");
    assert(riskReplay.meetingVersion === riskAccepted.meetingVersion, "risk replay changed meeting version");
    const riskRejected = await callTool(ctx, captain.agent, "convivium_dispose_risk", {
        ...riskAcceptInput,
        expectedMeetingVersion: acceptedRiskStatus.meetingVersion,
        requestId: "smoke-decision-risk-reject-risk-1",
        decision: "reject",
        reason: "Captain rejects the risk acceptance.",
        evidenceMessageIds: [riskSubmitted.result.messageId]
    }, 1125);
    const rejectedRiskStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 1126);
    const rejectedRisk = rejectedRiskStatus.result.risks.find((item) => item.id === risk.id);
    assert(rejectedRisk?.status === "open" && rejectedRisk.disposition === "blocking" && rejectedRisk.blocking, "rejected risk state mismatch");
    assert(rejectedRiskStatus.result.blockingFacts.some((fact) => fact.id === risk.id), "rejected risk missing from blocking facts");
    assert(riskAccepted.result.completionFactId !== riskRejected.result.completionFactId, "risk re-disposition did not create a new fact");
    await writeResult({
        ok: true,
        scenario,
        assertions: [
            "candidate-visible-to-captain",
            "candidate-accepted",
            "accepted-candidate-not-pending",
            "decision-history-current-state",
            "decision-pending-by-current-revision",
            "risk-disposition-status",
            "risk-blocking-facts",
            "risk-replay-version-stable",
            "event-order-not-observable-by-command-status"
        ],
        meetingId,
        observed: {
            decisionHistory: rejectedRiskStatus.result.decisionHistory,
            acceptedDecisions: rejectedRiskStatus.result.acceptedDecisions,
            pendingDecisionCandidates: rejectedRiskStatus.result.pendingDecisionCandidates,
            risk: rejectedRisk,
            blockingFacts: rejectedRiskStatus.result.blockingFacts,
            riskCompletionFactIds: [riskAccepted.result.completionFactId, riskRejected.result.completionFactId]
        }
    });
}

async function run(ctx) {
    if (!outputPath) return;
    if (scenario !== "baseline" && scenario !== "timeout" && scenario !== "reassign" && scenario !== "task-handraise" && scenario !== "completion-end" && scenario !== "risk-reopen" && scenario !== "decision-risk-closure" && scenario !== "cold-rebind" && scenario !== "archive-continuation" && scenario !== "mail-race" && scenario !== "cross-meeting") {
        await writeResult({ ok: false, scenario, error: "SCENARIO_NOT_IMPLEMENTED:" + scenario });
        return;
    }
    try {
        const workspace = browserMode
            ? await ctx.workspaceRegistry.create(process.cwd(), "Convivium smoke")
            : undefined;
        if (!(scenario === "cold-rebind" && process.env.CONVIVIUM_SMOKE_COLD_PHASE === "2")) captain = createSmokeAgent(ctx, "convivium-smoke-captain");
        if (scenario === "decision-risk-closure") {
            await runDecisionRiskClosureScenario(ctx);
            return;
        }
        if (scenario === "cold-rebind") {
            const phase = process.env.CONVIVIUM_SMOKE_COLD_PHASE ?? "1";
            if (phase === "2") {
                const checkpointPath = process.env.CONVIVIUM_SMOKE_COLD_CHECKPOINT;
                assert(checkpointPath, "cold checkpoint path missing");
                const checkpointFs = await import("node:fs/promises");
                const checkpoint = validateColdCheckpoint(JSON.parse(await checkpointFs.readFile(checkpointPath, "utf8")));
                const signal = new AbortController().signal;
                const preparation = await ctx.sessionPersistence.prepare(checkpoint.captainSessionId, signal);
                const restoredSession = preparation.session;
                const detach = ctx.sessions.enter(restoredSession);
                try {
                    ctx.sessions.announce(restoredSession);
                } catch (error) {
                    detach();
                    preparation[Symbol.dispose]();
                    throw error;
                }
                preparation[Symbol.dispose]();
                const registered = registerSmokeAgent(ctx, restoredSession);
                captain = { agent: registered.agent, async dispose() { await registered.dispose(); detach(); } };
                const reboundStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: checkpoint.meetingId }, 704);
                assert(reboundStatus.meetingVersion === checkpoint.meetingVersion, "cold rebind version changed");
                assert(checkpoint.transcriptMessageIds.every((id) => reboundStatus.result.messages.some((message) => message.id === id)), "cold transcript prefix missing");
                const children = await ctx.subagents.listChildren(restoredSession.id, signal);
                const checkpointChildren = checkpoint.sessionIds.map((sessionId) => {
                    const child = children.find((candidate) => candidate.id === sessionId);
                    assert(child, "cold durable child missing " + sessionId);
                    assert(child.mode === "continuable", "cold child mode mismatch " + sessionId);
                    assert(child.diagnostic === undefined, "cold child diagnostic " + sessionId);
                    return child;
                });
                assert(ctx.agents.get(checkpoint.managerSessionId) === undefined, "cold Manager unexpectedly resident before followup");
                const manager = await resumeParticipantForProbe(ctx, captain.agent, checkpoint.managerSessionId, "convivium-smoke-cold-manager");
                let managerContext;
                let managerContextMessageId;
                const contextMessages = [
                    ...(manager.inbox.nextTurn ?? []),
                    ...(manager.inbox.nextStep ?? [])
                ];
                for (const message of contextMessages) {
                    for (const text of messageTexts(message)) {
                        const marker = text.indexOf("manager context: ");
                        try {
                            const parsed = JSON.parse(marker >= 0 ? text.slice(marker + "manager context: ".length) : text);
                            if (parsed.meetingId === checkpoint.meetingId && parsed.planningAttemptId === checkpoint.managerPlanningAttemptId && parsed.meetingVersion === checkpoint.managerPlanningMeetingVersion) {
                                managerContext = parsed;
                                managerContextMessageId = message.id;
                            }
                        } catch {}
                    }
                }
                assert(managerContext && managerContextMessageId, "cold persisted Manager inbox context missing");
                const replanned = await callTool(ctx, manager, "convivium_submit_manager_plan", { protocolVersion: 1, meetingId: checkpoint.meetingId, planningAttemptId: managerContext.planningAttemptId, observedMeetingVersion: managerContext.meetingVersion, requestId: "smoke-cold-plan-2", agendaItemId: reboundStatus.result.activeAgendaItem.id, intent: "explore", objective: "Cold restart followup", expectedOutputs: [], prohibitedTopics: [], steps: [{ participantId: "participant-a", instruction: "A", reason: "manager_selected" }] }, 705);
                assert(replanned.result.firstAttemptId, "cold replan missing attempt");
                const phase2Delivery = await waitForSpeakerContext(ctx, checkpoint.participantSessionId, replanned.result.firstAttemptId);
                const submitted = await callTool(ctx, phase2Delivery.agent, "convivium_submit_turn", { protocolVersion: 1, meetingId: checkpoint.meetingId, turnId: phase2Delivery.value.turn.id, stepId: phase2Delivery.value.step.id, attemptId: phase2Delivery.value.attempt.attemptId, deliveryId: phase2Delivery.value.attempt.deliveryId, agendaItemId: phase2Delivery.value.activeAgendaItem.id, kind: "statement", content: "cold-rebind:a:2", mentions: [], taskIds: [], agendaRelation: "on_topic", changes: { questions: [], proposals: [], positions: [], issues: [], decisionProposals: [], agendaCandidates: [] } }, 706);
                const finalStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: checkpoint.meetingId }, 707);
                assert(process.pid !== checkpoint.hostPid, "cold Host PID did not change");
                assert(checkpoint.transcriptMessageIds.every((id) => finalStatus.result.messages.some((message) => message.id === id)), "cold final transcript prefix missing");
                assert(finalStatus.result.messages.some((message) => message.id === submitted.result.messageId), "cold followup transcript missing");
                const finalChildren = await ctx.subagents.listChildren(restoredSession.id, signal);
                assert(checkpoint.sessionIds.every((id) => finalChildren.some((child) => child.id === id)), "cold child identity changed");
                await writeResult({ ok: true, scenario, assertions: ["phase1-checkpoint-durable", "host-pid-changed", "exact-parent-rebound", "transcript-prefix-preserved", "cold-followup-submitted"], observed: { phase1HostPid: checkpoint.hostPid, phase2HostPid: process.pid, captainSessionId: restoredSession.id, managerSessionId: checkpoint.managerSessionId, participantSessionId: checkpoint.participantSessionId, managerPlanningAttemptId: checkpoint.managerPlanningAttemptId, managerContextMessageId, transcriptMessageIds: [...checkpoint.transcriptMessageIds, submitted.result.messageId], reboundVersion: reboundStatus.meetingVersion, finalVersion: finalStatus.meetingVersion, children: checkpointChildren.map((child) => ({ id: child.id, mode: child.mode, activity: child.activity })) } });
                return;
            }
            const input = createInput(); input.agenda[0].requiredParticipantKeys = ["a"];
            const created = await callTool(ctx, captain.agent, "convivium_create_meeting", input, 700);
            const meetingId = created.result.meetingId;
            const status = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 701);
            const manager = await waitForAgent(ctx, meetingId + "-manager-manager");
            const plan = await callTool(ctx, manager, "convivium_submit_manager_plan", { protocolVersion: 1, meetingId, planningAttemptId: meetingId + "-planning-1", observedMeetingVersion: status.meetingVersion, requestId: "smoke-cold-plan-1", agendaItemId: status.result.activeAgendaItem.id, intent: "explore", objective: "Cold restart", expectedOutputs: [], prohibitedTopics: [], steps: [{ participantId: "participant-a", instruction: "A", reason: "manager_selected" }] }, 702);
            const delivery = await waitForSpeakerContext(ctx, meetingId + "-participant-participant-a", plan.result.firstAttemptId);
            let laterManagerAgent = ctx.agents.get(manager.id);
            if (laterManagerAgent === undefined) {
                laterManagerAgent = await resumeParticipantForProbe(ctx, captain.agent, manager.id, "convivium-smoke-cold-manager-barrier");
            }
            await laterManagerAgent.whenIdle();
            let maintenanceStartedResolve;
            const maintenanceStarted = new Promise((resolveStarted) => { maintenanceStartedResolve = resolveStarted; });
            coldMaintenancePromise = laterManagerAgent.runMaintenance(async () => {
                maintenanceStartedResolve();
                await new Promise((resolveMaintenance) => { releaseColdMaintenance = resolveMaintenance; });
            });
            await maintenanceStarted;
            const submitted = await callTool(ctx, delivery.agent, "convivium_submit_turn", { protocolVersion: 1, meetingId, turnId: delivery.value.turn.id, stepId: delivery.value.step.id, attemptId: delivery.value.attempt.attemptId, deliveryId: delivery.value.attempt.deliveryId, agendaItemId: delivery.value.activeAgendaItem.id, kind: "statement", content: "cold-rebind:a:1", mentions: [], taskIds: [], agendaRelation: "on_topic", changes: { questions: [], proposals: [], positions: [], issues: [], decisionProposals: [], agendaCandidates: [] } }, 703);
            const laterManagerDelivery = await waitForInbox(ctx, manager.id, (message) => {
                for (const text of messageTexts(message)) {
                    const marker = text.indexOf("manager context: ");
                    try {
                        const context = JSON.parse(marker >= 0 ? text.slice(marker + "manager context: ".length) : text);
                        if (
                            context.meetingId === meetingId &&
                            context.planningAttemptId !==
                                (plan.result.planningAttemptId ?? meetingId + "-planning-1") &&
                            Number.isInteger(context.meetingVersion)
                        )
                            return context;
                    } catch {}
                }
                return undefined;
            });
            const laterManagerContext = laterManagerDelivery.value;
            assert(laterManagerDelivery.agent === laterManagerAgent, "cold planning context used a different Manager Agent");
            assert(await ctx.sessions.flush(laterManagerDelivery.agent.session) === true, "cold later Manager Session flush failed");
            assert(await ctx.sessions.flush(captain.agent.session) === true, "cold Captain Session flush failed");
            const checkpointStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 701);
            assert(
                checkpointStatus.meetingVersion === laterManagerContext.meetingVersion,
                "cold planning/status version mismatch: status=" +
                    checkpointStatus.meetingVersion +
                    ", context=" +
                    laterManagerContext.meetingVersion
            );
            assert(checkpointStatus.result.currentAttemptId === undefined, "cold phase1 still has running attempt");
            assert(checkpointStatus.result.termination === undefined, "cold phase1 unexpectedly terminal");
            assert(checkpointStatus.result.messages.some((message) => message.id === submitted.result.messageId), "cold phase1 transcript missing");
            const checkpoint = validateColdCheckpoint({ schemaVersion: 1, scenario, phase: 1, hostPid: process.pid, captainSessionId: captain.agent.session.id, meetingId, meetingVersion: checkpointStatus.meetingVersion, managerSessionId: laterManagerDelivery.agent.id, participantSessionId: delivery.agent.id, sessionIds: [laterManagerDelivery.agent.id, delivery.agent.id], transcriptMessageIds: [submitted.result.messageId], managerPlanningAttemptId: laterManagerContext.planningAttemptId, managerPlanningMeetingVersion: laterManagerContext.meetingVersion });
            const fs = await import("node:fs/promises");
            const checkpointPath = process.env.CONVIVIUM_SMOKE_COLD_CHECKPOINT;
            assert(checkpointPath, "cold checkpoint path missing");
            await fs.writeFile(checkpointPath + ".tmp", JSON.stringify(checkpoint), "utf8");
            await fs.rename(checkpointPath + ".tmp", checkpointPath);
            await writeResult({ ok: true, scenario, phase1Complete: true, meetingId, checkpoint });
            return;
        }
        if (scenario === "archive-continuation") {
            const sourceInput = createInput();
            sourceInput.agenda[0].requiredParticipantKeys = ["a"];
            const created = await callTool(ctx, captain.agent, "convivium_create_meeting", sourceInput, 800);
            const sourceMeetingId = created.result.meetingId;
            const status = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: sourceMeetingId }, 801);
            const manager = await waitForAgent(ctx, sourceMeetingId + "-manager-manager");
            const plan = await callTool(ctx, manager, "convivium_submit_manager_plan", { protocolVersion: 1, meetingId: sourceMeetingId, planningAttemptId: sourceMeetingId + "-planning-1", observedMeetingVersion: status.meetingVersion, requestId: "smoke-archive-plan-1", agendaItemId: status.result.activeAgendaItem.id, intent: "explore", objective: "Archive source", expectedOutputs: [], prohibitedTopics: [], steps: [{ participantId: "participant-a", instruction: "A", reason: "manager_selected" }] }, 802);
            const delivery = await waitForSpeakerContext(ctx, sourceMeetingId + "-participant-participant-a", plan.result.firstAttemptId);
            const submitted = await callTool(ctx, delivery.agent, "convivium_submit_turn", { protocolVersion: 1, meetingId: sourceMeetingId, turnId: delivery.value.turn.id, stepId: delivery.value.step.id, attemptId: delivery.value.attempt.attemptId, deliveryId: delivery.value.attempt.deliveryId, agendaItemId: delivery.value.activeAgendaItem.id, kind: "statement", content: "archive-continuation:a:1", mentions: [], taskIds: [], agendaRelation: "on_topic", changes: { questions: [], proposals: [], positions: [], issues: [], decisionProposals: [], agendaCandidates: [] } }, 803);
            const beforeEnd = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: sourceMeetingId }, 805);
            await callTool(ctx, captain.agent, "convivium_end_meeting", { protocolVersion: 1, meetingId: sourceMeetingId, expectedMeetingVersion: beforeEnd.meetingVersion, outcome: "partial", reason: "smoke archive", acceptedDecisionIds: [], deferredAgendaItemIds: [], waivers: [], requestId: "smoke-archive-end-1" }, 804);
            const archiveDeadline = Date.now() + 30000;
            let archived;
            while (Date.now() < archiveDeadline) {
                const candidate = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: sourceMeetingId }, 805);
                if (candidate.result.status === "archived") { archived = candidate; break; }
                await new Promise((resolveWait) => setTimeout(resolveWait, 100));
            }
            assert(archived, "source Meeting did not archive");
            const sourceSessionIds = [manager.id, delivery.agent.id];
            assert(sourceSessionIds.every((id) => ctx.agents.get(id) === undefined), "source Session remained resident after archive");
            const sourceChildren = await ctx.subagents.listChildren(captain.agent.session.id, new AbortController().signal);
            assert(sourceSessionIds.every((id) => sourceChildren.some((child) => child.id === id && child.activity === "inactive")), "source durable child did not drain");
            const targetInput = createInput();
            targetInput.requestId = "smoke-archive-target-1";
            targetInput.topic = "Runtime smoke continuation";
            targetInput.agenda[0].requiredParticipantKeys = ["a"];
            targetInput.continuation = { sourceMeetingId, includeFinalSummary: true, decisionIds: [], unresolvedIssueIds: [], riskIds: [], evidenceIds: [], artifactIds: [] };
            const targetCreated = await callTool(ctx, captain.agent, "convivium_create_meeting", targetInput, 806);
            const targetMeetingId = targetCreated.result.meetingId;
            const targetStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: targetMeetingId }, 807);
            const targetManager = await waitForAgent(ctx, targetMeetingId + "-manager-manager");
            const targetParticipant = await waitForAgent(ctx, targetMeetingId + "-participant-participant-a");
            const targetSessionIds = [targetManager.id, targetParticipant.id];
            assert(sourceMeetingId !== targetMeetingId, "continuation reused source Meeting ID");
            assert(sourceSessionIds.every((id) => !targetSessionIds.includes(id)), "continuation reused source Session ID");
            assert(targetStatus.result.continuationMaterials.length === 1 && targetStatus.result.continuationMaterials[0].sourceKind === "final_summary" && targetStatus.result.continuationMaterials[0].sourceMeetingId === sourceMeetingId, "continuation material is not final-summary-only");
            await writeResult({ ok: true, scenario, assertions: ["source-archived", "source-sessions-drained", "continuation-final-summary-only", "target-identities-new"], observed: { sourceMeetingId, targetMeetingId, sourceMessageId: submitted.result.messageId, sourceStatus: archived.result.status, sourceSessionIds, targetSessionIds, continuationMaterials: targetStatus.result.continuationMaterials, sourceChildren: sourceChildren.filter((child) => sourceSessionIds.includes(child.id)).map((child) => ({ id: child.id, mode: child.mode, activity: child.activity })) } });
            return;
        }
        if (scenario === "mail-race") {
            const mailInput = createInput();
            mailInput.agenda[0].requiredParticipantKeys = ["a", "b"];
            mailInput.limits = { mailHandlingTimeoutMs: 100 };
            const created = await callTool(ctx, captain.agent, "convivium_create_meeting", mailInput, 900);
            const mailMeetingId = created.result.meetingId;
            const status = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: mailMeetingId }, 901);
            const manager = await waitForAgent(ctx, mailMeetingId + "-manager-manager");
            const plan = await callTool(ctx, manager, "convivium_submit_manager_plan", { protocolVersion: 1, meetingId: mailMeetingId, planningAttemptId: mailMeetingId + "-planning-1", observedMeetingVersion: status.meetingVersion, requestId: "smoke-mail-plan-1", agendaItemId: status.result.activeAgendaItem.id, intent: "explore", objective: "Mail race", expectedOutputs: [], prohibitedTopics: [], steps: [{ participantId: "participant-a", instruction: "Send mail", reason: "manager_selected" }, { participantId: "participant-b", instruction: "Receive next speaker followup", reason: "manager_selected" }] }, 902);
            const senderDelivery = await waitForSpeakerContext(ctx, mailMeetingId + "-participant-participant-a", plan.result.firstAttemptId);
            const beforeSend = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: mailMeetingId }, 901);
            const recipientSessionId = mailMeetingId + "-participant-participant-b";
            let mailMaintenanceStartedResolve;
            const mailMaintenanceStarted = new Promise((resolveStarted) => { mailMaintenanceStartedResolve = resolveStarted; });
            const mailDeliveryPromise = waitForInbox(ctx, recipientSessionId, (message, liveRecipient) => {
                for (const text of messageTexts(message)) {
                    try {
                        const envelope = JSON.parse(text);
                        if (envelope.kind === "meeting_mail" && envelope.meetingContext?.meetingId === mailMeetingId) {
                            mailMaintenancePromise = liveRecipient.runMaintenance(async () => {
                                mailMaintenanceStartedResolve();
                                await new Promise((resolveMaintenance) => { releaseMailMaintenance = resolveMaintenance; });
                            });
                            return envelope;
                        }
                    } catch {}
                }
                return undefined;
            });
            const sent = await callTool(ctx, senderDelivery.agent, "convivium_send_message", { protocolVersion: 1, meetingId: mailMeetingId, expectedMeetingVersion: beforeSend.meetingVersion, requestId: "smoke-mail-send-1", recipient: { kind: "meeting_participant", meetingId: mailMeetingId, participantId: "participant-b" }, content: "private-smoke-body", meetingContext: { meetingId: mailMeetingId, agendaItemId: beforeSend.result.activeAgendaItem.id, contextFromSeq: 0, contextThroughSeq: beforeSend.result.messages.at(-1)?.seq ?? 0, relevantMessageIds: [], snapshotSummary: "smoke" } }, 903);
            const mailDelivery = await mailDeliveryPromise.catch((error) => { throw new Error("mail envelope wait failed: " + String(error)); });
            await mailMaintenanceStarted;
            assert(ctx.agents.get(recipientSessionId) === mailDelivery.agent, "mail recipient maintenance barrier lost live Agent");
            assert(mailDelivery.value.mailId === sent.result.mailId, "mail envelope ID mismatch");
            assert(typeof mailDelivery.value.handlingAttemptId === "string" && typeof mailDelivery.value.deliveryId === "string", "mail envelope identifiers missing");
            await new Promise((resolveWait) => setTimeout(resolveWait, mailInput.limits.mailHandlingTimeoutMs - 25));
            let finishResult;
            let finishError;
            try {
                finishResult = await callTool(ctx, mailDelivery.agent, "convivium_finish_meeting_mail", { protocolVersion: 1, meetingId: mailMeetingId, mailId: sent.result.mailId, handlingAttemptId: mailDelivery.value.handlingAttemptId, deliveryId: mailDelivery.value.deliveryId, requestId: mailDelivery.value.deliveryId, status: "processed" }, 904);
            } catch (error) {
                finishError = String(error);
            }
            await new Promise((resolveWait) => setTimeout(resolveWait, 250));
            assert((finishResult?.result.status === "processed") !== (finishError !== undefined), "mail race did not produce one terminal outcome");
            let duplicateFinishError;
            try {
                await callTool(ctx, mailDelivery.agent, "convivium_finish_meeting_mail", { protocolVersion: 1, meetingId: mailMeetingId, mailId: sent.result.mailId, handlingAttemptId: mailDelivery.value.handlingAttemptId, deliveryId: mailDelivery.value.deliveryId, requestId: mailDelivery.value.deliveryId + "-duplicate", status: "processed" }, 9041);
            } catch (error) {
                duplicateFinishError = String(error);
            }
            assert(duplicateFinishError !== undefined, "mail race accepted a second terminal outcome");
            releaseMailMaintenance();
            await mailMaintenancePromise;
            releaseMailMaintenance = undefined;
            mailMaintenancePromise = undefined;
            const senderSessionId = mailMeetingId + "-participant-participant-a";
            const liveSender = ctx.agents.get(senderSessionId) ?? await resumeParticipantForProbe(ctx, captain.agent, senderSessionId, "convivium-smoke-mail-sender-resume");
            assert(ctx.agents.get(senderSessionId) === liveSender, "mail sender did not cold-resume as live Agent");
            const submitted = await callTool(ctx, liveSender, "convivium_submit_turn", { protocolVersion: 1, meetingId: mailMeetingId, turnId: senderDelivery.value.turn.id, stepId: senderDelivery.value.step.id, attemptId: senderDelivery.value.attempt.attemptId, deliveryId: senderDelivery.value.attempt.deliveryId, agendaItemId: senderDelivery.value.activeAgendaItem.id, kind: "statement", content: "mail-race:a:1", mentions: [], taskIds: [], agendaRelation: "on_topic", changes: { questions: [], proposals: [], positions: [], issues: [], decisionProposals: [], agendaCandidates: [] } }, 905);
            const afterSender = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: mailMeetingId }, 906);
            assert(afterSender.result.currentSpeakerId === "participant-b" && typeof afterSender.result.currentAttemptId === "string", "recipient did not become next speaker");
            const recipientSpeaker = await waitForSpeakerContext(ctx, recipientSessionId, afterSender.result.currentAttemptId).catch((error) => { throw new Error("recipient speaker wait failed: " + String(error)); });
            assert(String(recipientSpeaker.agent.id) === recipientSessionId && ctx.agents.get(recipientSessionId) === recipientSpeaker.agent, "recipient queue did not accept a live speaker followup");
            assert(afterSender.result.messages.some((message) => message.id === submitted.result.messageId) && !JSON.stringify(afterSender.result).includes("private-smoke-body"), "mail privacy/status assertion failed");
            await writeResult({ ok: true, scenario, assertions: ["single-mail-terminal", "stable-delivery-ids", "private-body-not-projected", "recipient-queue-reusable"], observed: { meetingId: mailMeetingId, mailId: sent.result.mailId, handlingAttemptId: mailDelivery.value.handlingAttemptId, deliveryId: mailDelivery.value.deliveryId, processingThroughSeq: mailDelivery.value.processingThroughSeq, terminalStatus: finishResult?.result.status ?? "timed_out", finishOutcome: finishResult?.result.status ?? finishError, duplicateFinishError, senderMessageId: submitted.result.messageId, recipientAttemptId: afterSender.result.currentAttemptId, recipientSessionId } });
            return;
        }
        if (scenario === "cross-meeting") {
            const fixtures = [
                { key: "a", teamId: "smoke-team-a", base: 1000 },
                { key: "b", teamId: "smoke-team-a", base: 1010 },
                { key: "c", teamId: "smoke-team-b", base: 1020 }
            ];
            const meetings = [];
            for (const fixture of fixtures) {
                const input = createInput();
                input.requestId = "smoke-cross-create-" + fixture.key;
                input.teamId = fixture.teamId;
                input.topic = "Cross meeting " + fixture.key.toUpperCase();
                input.agenda[0].requiredParticipantKeys = ["a"];
                const created = await callTool(ctx, captain.agent, "convivium_create_meeting", input, fixture.base);
                const isolatedMeetingId = created.result.meetingId;
                const status = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: isolatedMeetingId }, fixture.base + 1);
                const isolatedManager = await waitForAgent(ctx, isolatedMeetingId + "-manager-manager");
                const plan = await callTool(ctx, isolatedManager, "convivium_submit_manager_plan", { protocolVersion: 1, meetingId: isolatedMeetingId, planningAttemptId: isolatedMeetingId + "-planning-1", observedMeetingVersion: status.meetingVersion, requestId: "smoke-cross-plan-" + fixture.key, agendaItemId: status.result.activeAgendaItem.id, intent: "explore", objective: "Isolated " + fixture.key, expectedOutputs: [], prohibitedTopics: [], steps: [{ participantId: "participant-a", instruction: "Submit " + fixture.key, reason: "manager_selected" }] }, fixture.base + 2);
                const isolatedDelivery = await waitForSpeakerContext(ctx, isolatedMeetingId + "-participant-participant-a", plan.result.firstAttemptId);
                const submitted = await callTool(ctx, isolatedDelivery.agent, "convivium_submit_turn", { protocolVersion: 1, meetingId: isolatedMeetingId, turnId: isolatedDelivery.value.turn.id, stepId: isolatedDelivery.value.step.id, attemptId: isolatedDelivery.value.attempt.attemptId, deliveryId: isolatedDelivery.value.attempt.deliveryId, agendaItemId: isolatedDelivery.value.activeAgendaItem.id, kind: "statement", content: "cross-meeting:" + fixture.key + ":1", mentions: [], taskIds: [], agendaRelation: "on_topic", changes: { questions: [], proposals: [], positions: [], issues: [], decisionProposals: [], agendaCandidates: [] } }, fixture.base + 3);
                const afterSubmit = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: isolatedMeetingId }, fixture.base + 1);
                const children = await ctx.subagents.listChildren(captain.agent.session.id, new AbortController().signal);
                const sessionIds = children.map((child) => child.id).filter((id) => id.startsWith(isolatedMeetingId + "-")).sort();
                assert(sessionIds.length === 4, "cross Meeting child ownership invalid " + fixture.key);
                meetings.push({ ...fixture, meetingId: isolatedMeetingId, manager: isolatedManager, participant: isolatedDelivery.agent, messageId: submitted.result.messageId, status: afterSubmit, sessionIds });
            }
            const sessionSets = meetings.map((meeting) => new Set(meeting.sessionIds));
            assert([...sessionSets[0]].every((id) => !sessionSets[1].has(id) && !sessionSets[2].has(id)) && [...sessionSets[1]].every((id) => !sessionSets[2].has(id)), "cross Meeting ownership sets overlap");
            const first = meetings[0];
            await callTool(ctx, captain.agent, "convivium_end_meeting", { protocolVersion: 1, meetingId: first.meetingId, expectedMeetingVersion: first.status.meetingVersion, outcome: "partial", reason: "smoke cross isolation", acceptedDecisionIds: [], deferredAgendaItemIds: [], waivers: [], requestId: "smoke-cross-end-a-1" }, 1004);
            const firstDeadline = Date.now() + 30000;
            let firstFinal;
            while (Date.now() < firstDeadline) {
                const candidate = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: first.meetingId }, 1005);
                if (candidate.result.status === "archived") { firstFinal = candidate; break; }
                await new Promise((resolveWait) => setTimeout(resolveWait, 100));
            }
            assert(firstFinal?.result.status === "archived", "cross Meeting A did not archive");
            const secondFinal = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: meetings[1].meetingId }, 1014);
            const thirdFinal = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId: meetings[2].meetingId }, 1024);
            assert(secondFinal.meetingVersion === meetings[1].status.meetingVersion && thirdFinal.meetingVersion === meetings[2].status.meetingVersion, "cross Meeting cleanup changed another version");
            assert(secondFinal.result.messages.length === 1 && secondFinal.result.messages[0].id === meetings[1].messageId && thirdFinal.result.messages.length === 1 && thirdFinal.result.messages[0].id === meetings[2].messageId, "cross Meeting cleanup changed another transcript");
            for (const meeting of meetings.slice(1)) {
                const children = await ctx.subagents.listChildren(captain.agent.session.id, new AbortController().signal);
                const sessionIds = children.map((child) => child.id).filter((id) => id.startsWith(meeting.meetingId + "-")).sort();
                assert(JSON.stringify(sessionIds) === JSON.stringify(meeting.sessionIds), "cross Meeting cleanup changed another ownership set");
            }
            let crossAccessError;
            try {
                await callTool(ctx, first.participant, "convivium_meeting_status", { protocolVersion: 1, meetingId: meetings[1].meetingId }, 1006);
            } catch (error) {
                crossAccessError = String(error);
            }
            assert(crossAccessError?.includes("not live") || crossAccessError?.includes("UNAUTHORIZED"), "cross Meeting ownership access was not rejected");
            await writeResult({ ok: true, scenario, assertions: ["ownership-sets-disjoint", "meeting-a-cleanup-isolated", "meeting-b-submitted", "team-b-submitted"], observed: { meetings: meetings.map((meeting, index) => ({ key: meeting.key, teamId: meeting.teamId, meetingId: meeting.meetingId, messageId: meeting.messageId, versionBeforeCleanup: meeting.status.meetingVersion, versionAfterCleanup: index === 0 ? firstFinal.meetingVersion : index === 1 ? secondFinal.meetingVersion : thirdFinal.meetingVersion, sessionIds: [...sessionSets[index]] })), crossAccessError } });
            return;
        }
        if (scenario === "risk-reopen") {
            const riskInput = createInput();
            riskInput.agenda[0].requiredParticipantKeys = ["a"];
            riskInput.objectiveContract.riskAcceptanceAuthorityKeys = ["a"];
            riskInput.objectiveContract.acceptableRiskLevel = "high";
            const created = await callTool(ctx, captain.agent, "convivium_create_meeting", riskInput, 600);
            const meetingId = created.result.meetingId;
            const status = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 601);
            const manager = await waitForAgent(ctx, meetingId + "-manager-manager");
            const plan = await callTool(ctx, manager, "convivium_submit_manager_plan", { protocolVersion: 1, meetingId, planningAttemptId: meetingId + "-planning-1", observedMeetingVersion: status.meetingVersion, requestId: "smoke-risk-plan-1", agendaItemId: status.result.activeAgendaItem.id, intent: "explore", objective: "Risk evidence", expectedOutputs: [], prohibitedTopics: [], steps: [{ participantId: "participant-a", instruction: "Report risk", reason: "manager_selected" }] }, 602);
            const delivery = await waitForSpeakerContext(ctx, meetingId + "-participant-participant-a", plan.result.firstAttemptId);
            const submitted = await callTool(ctx, delivery.agent, "convivium_submit_turn", { protocolVersion: 1, meetingId, turnId: delivery.value.turn.id, stepId: delivery.value.step.id, attemptId: delivery.value.attempt.attemptId, deliveryId: delivery.value.attempt.deliveryId, agendaItemId: delivery.value.activeAgendaItem.id, kind: "statement", content: "risk", mentions: [], taskIds: [], agendaRelation: "on_topic", changes: { questions: [], proposals: [], positions: [], issues: [{ title: "smoke risk", description: "smoke risk", affectedOutputIds: [], affectedCriterionIds: ["criterion-smoke-order"], violatedConstraintIds: [], impact: "high", urgency: "now", safeDefaultAvailable: false }], decisionProposals: [], agendaCandidates: [] } }, 603);
            const afterIssue = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 604);
            const issueCandidates = afterIssue.result.blockingFacts ?? [];
            const issueId = issueCandidates.find((fact) => fact.kind === "issue" && fact.summary === "smoke risk")?.id;
            assert(issueId, "risk issue missing");
            const input = { protocolVersion: 1, meetingId, expectedMeetingVersion: afterIssue.meetingVersion, requestId: "smoke-risk-dispose-1", issueId, decision: "accept", reason: "smoke accepted risk", evidenceMessageIds: [submitted.result.messageId] };
            const disposed = await callTool(ctx, captain.agent, "convivium_dispose_risk", input, 605);
            const replay = await callTool(ctx, captain.agent, "convivium_dispose_risk", input, 606);
            assert(JSON.stringify(replay.result) === JSON.stringify(disposed.result), "risk replay mismatch");
            let conflict;
            try { await callTool(ctx, captain.agent, "convivium_dispose_risk", { ...input, reason: "different" }, 607); } catch (error) { conflict = String(error); }
            assert(conflict?.includes("IDEMPOTENCY_CONFLICT"), "risk idempotency conflict missing");
            await writeResult({ ok: true, scenario, assertions: ["risk-disposed", "risk-replay-stable", "risk-idempotency-conflict"], meetingId, observed: { issueId, handRaiseId: disposed.result.completionFactId, receipt: disposed.result } });
            return;
        }
        if (scenario === "completion-end") {
            const completionInput = createInput();
            completionInput.objectiveContract.requiredOutputs = [
                { key: "smoke-output", description: "Smoke output" }
            ];
            completionInput.objectiveContract.acceptanceCriteria = [
                { key: "smoke-criterion", description: "Smoke criterion" }
            ];
            completionInput.agenda[0].completionCriteria = ["smoke-criterion"];
            completionInput.agenda[0].requiredParticipantKeys = ["a"];
            const created = await callTool(
                ctx,
                captain.agent,
                "convivium_create_meeting",
                completionInput,
                500
            );
            const meetingId = created.result.meetingId;
            const initialStatus = await callTool(
                ctx,
                captain.agent,
                "convivium_meeting_status",
                { protocolVersion: 1, meetingId },
                501
            );
            const managerSessionId = meetingId + "-manager-manager";
            const manager = await waitForAgent(ctx, managerSessionId);
            const firstPlan = await callTool(
                ctx,
                manager,
                "convivium_submit_manager_plan",
                {
                    protocolVersion: 1,
                    meetingId,
                    planningAttemptId: meetingId + "-planning-1",
                    observedMeetingVersion: initialStatus.meetingVersion,
                    requestId: "smoke-completion-plan-1",
                    agendaItemId: initialStatus.result.activeAgendaItem.id,
                    intent: "explore",
                    objective: "Produce initial completion evidence",
                    expectedOutputs: [],
                    prohibitedTopics: [],
                    steps: [
                        {
                            participantId: "participant-a",
                            instruction: "Submit initial evidence",
                            reason: "manager_selected"
                        }
                    ]
                },
                502
            );
            const participantSessionId = meetingId + "-participant-participant-a";
            const firstDelivery = await waitForSpeakerContext(
                ctx,
                participantSessionId,
                firstPlan.result.firstAttemptId
            );
            const firstEnvelope = firstDelivery.value;
            const firstSubmit = await callTool(
                ctx,
                firstDelivery.agent,
                "convivium_submit_turn",
                {
                    protocolVersion: 1,
                    meetingId,
                    turnId: firstEnvelope.turn.id,
                    stepId: firstEnvelope.step.id,
                    attemptId: firstEnvelope.attempt.attemptId,
                    deliveryId: firstEnvelope.attempt.deliveryId,
                    agendaItemId: firstEnvelope.activeAgendaItem.id,
                    kind: "evidence",
                    content: "completion-end:a:1",
                    mentions: [],
                    taskIds: [],
                    agendaRelation: "on_topic",
                    changes: {}
                },
                503
            );
            const afterFirst = await callTool(
                ctx,
                captain.agent,
                "convivium_meeting_status",
                { protocolVersion: 1, meetingId },
                504
            );
            const secondManager = await resumeParticipantForProbe(
                ctx,
                captain.agent,
                managerSessionId,
                "convivium-smoke-completion-plan-2"
            );
            const managerContext = await waitForStoredManagerContext(
                managerSessionId,
                meetingId,
                firstPlan.result.planningAttemptId ?? meetingId + "-planning-1"
            );
            const secondPlan = await callTool(
                ctx,
                secondManager,
                "convivium_submit_manager_plan",
                {
                    protocolVersion: 1,
                    meetingId,
                    planningAttemptId: managerContext.planningAttemptId,
                    observedMeetingVersion: managerContext.meetingVersion,
                    requestId: "smoke-completion-plan-2",
                    agendaItemId: afterFirst.result.activeAgendaItem.id,
                    intent: "synthesize",
                    objective: "Submit completion claims",
                    expectedOutputs: [],
                    prohibitedTopics: [],
                    steps: [
                        {
                            participantId: "participant-a",
                            instruction: "Submit completion claims",
                            reason: "manager_selected"
                        }
                    ]
                },
                505
            );
            const secondDelivery = await waitForSpeakerContext(
                ctx,
                participantSessionId,
                secondPlan.result.firstAttemptId
            );
            const sameStatus = await callTool(
                ctx,
                captain.agent,
                "convivium_meeting_status",
                { protocolVersion: 1, meetingId },
                506
            );
            const outputId = secondDelivery.value.objectiveContract.requiredOutputs[0]?.id;
            const criterionId =
                secondDelivery.value.objectiveContract.acceptanceCriteria[0]?.id;
            assert(outputId && criterionId, "completion fixture identifiers are missing");
            const completionInputForRace = {
                protocolVersion: 1,
                meetingId,
                turnId: secondDelivery.value.turn.id,
                stepId: secondDelivery.value.step.id,
                attemptId: secondDelivery.value.attempt.attemptId,
                deliveryId: secondDelivery.value.attempt.deliveryId,
                agendaItemId: secondDelivery.value.activeAgendaItem.id,
                kind: "evidence",
                content: "completion-end:a:2",
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic",
                changes: {},
                completionClaims: {
                    outputClaims: [
                        {
                            subjectId: outputId,
                            evidenceMessageIds: [firstSubmit.result.messageId],
                            taskIds: []
                        }
                    ],
                    criterionClaims: [
                        {
                            subjectId: criterionId,
                            evidenceMessageIds: [firstSubmit.result.messageId],
                            taskIds: []
                        }
                    ]
                }
            };
            const endInput = {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: sameStatus.meetingVersion,
                outcome: "partial",
                reason: "smoke competition",
                acceptedDecisionIds: [],
                deferredAgendaItemIds: [],
                waivers: [],
                requestId: "smoke-completion-end-1"
            };
            const raceParticipant = await resumeParticipantForProbe(
                ctx,
                captain.agent,
                participantSessionId,
                "convivium-smoke-completion-race"
            );
            const executeRaw = (agent, name, input, index) =>
                ctx.tools.execute({
                    callId: "convivium-smoke-" + index,
                    name,
                    arguments: { input },
                    agent,
                    signal: new AbortController().signal
                });
            const raced = await Promise.allSettled([
                executeRaw(
                    raceParticipant,
                    "convivium_submit_turn",
                    completionInputForRace,
                    507
                ),
                executeRaw(captain.agent, "convivium_end_meeting", endInput, 508)
            ]);
            const raceValues = raced.map((entry) =>
                entry.status === "fulfilled" ? entry.value.value : undefined
            );
            const successes = raceValues.filter((value) => value?.ok === true);
            const failures = raceValues.filter((value) => value?.ok === false);
            assert(successes.length === 1 && failures.length === 1, "completion/end race did not produce one winner: " + JSON.stringify(raceValues));
            const failureCode = failures[0].code;
            assert(
                [
                    "VERSION_CONFLICT",
                    "IMMUTABLE_MEETING",
                    "ARCHIVED_MEETING",
                    "STALE_ATTEMPT",
                    "UNAUTHORIZED_CALLER"
                ].includes(failureCode),
                "completion/end race returned an unexpected loser: " + JSON.stringify(failures[0])
            );
            const terminalStatus = await callTool(
                ctx,
                captain.agent,
                "convivium_meeting_status",
                { protocolVersion: 1, meetingId },
                509
            );
            assert(
                ["completed", "partial", "archiving", "archived"].includes(
                    terminalStatus.result.status
                ),
                "completion/end race did not reach a terminal status"
            );
            assert(terminalStatus.result.termination, "completion/end race omitted termination");
            const lateSubmit = await executeRaw(
                raceParticipant,
                "convivium_submit_turn",
                completionInputForRace,
                510
            );
            const lateEnd = await executeRaw(
                captain.agent,
                "convivium_end_meeting",
                {
                    ...endInput,
                    expectedMeetingVersion: terminalStatus.meetingVersion,
                    requestId: "smoke-completion-end-late"
                },
                511
            );
            assert(
                (lateSubmit.value?.ok === false &&
                    [
                        "IMMUTABLE_MEETING",
                        "ARCHIVED_MEETING",
                        "UNAUTHORIZED_CALLER"
                    ].includes(lateSubmit.value.code)) ||
                    (lateSubmit.isError === true &&
                        (String(lateSubmit.error?.message).includes(
                            "caller Session capability has been revoked"
                        ) ||
                            String(lateSubmit.error?.message).includes(
                                "is not live in this store"
                            ))),
                "terminal submit was not rejected: " +
                    JSON.stringify({ value: lateSubmit.value, error: lateSubmit.error?.message })
            );
            assert(
                lateEnd.value?.ok === false &&
                    ["IMMUTABLE_MEETING", "ARCHIVED_MEETING"].includes(lateEnd.value.code),
                "terminal end was not rejected: " + JSON.stringify(lateEnd.value)
            );
            await writeResult({
                ok: true,
                scenario,
                assertions: [
                    "single-winner",
                    "single-termination",
                    "terminal-submit-rejected",
                    "terminal-end-rejected"
                ],
                meetingId,
                observed: {
                    winnerStatus: successes[0].result?.status ?? successes[0].result?.meetingStatus,
                    loserCode: failureCode,
                    termination: terminalStatus.result.termination
                }
            });
            return;
        }
        if (scenario === "task-handraise") {
            const taskInput = createInput();
            taskInput.agenda[0].requiredParticipantKeys = ["a"];
            const created = await callTool(ctx, captain.agent, "convivium_create_meeting", taskInput, 400);
            const meetingId = created.result.meetingId;
            const initialStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 401);
            const manager = await waitForAgent(ctx, meetingId + "-manager-manager");
            const firstPlan = await callTool(ctx, manager, "convivium_submit_manager_plan", {
                protocolVersion: 1,
                meetingId,
                planningAttemptId: meetingId + "-planning-1",
                observedMeetingVersion: initialStatus.meetingVersion,
                requestId: "smoke-task-plan-1",
                agendaItemId: initialStatus.result.activeAgendaItem.id,
                intent: "explore",
                objective: "Create and finish task evidence",
                expectedOutputs: [],
                prohibitedTopics: [],
                steps: [{ participantId: "participant-a", instruction: "Create task evidence", reason: "manager_selected" }]
            }, 402);
            const participantSessionId = meetingId + "-participant-participant-a";
            const firstDelivery = await waitForSpeakerContext(ctx, participantSessionId, firstPlan.result.firstAttemptId);
            const firstEnvelope = firstDelivery.value;
            const firstAgent = firstDelivery.agent;
            const task = await callTool(ctx, firstAgent, "convivium_create_meeting_task", {
                protocolVersion: 1,
                meetingId,
                attemptId: firstEnvelope.attempt.attemptId,
                requestId: "smoke-task-create-1",
                title: "smoke task",
                description: "produce evidence",
                blocking: false
            }, 403);
            const meetingTaskId = task.result.meetingTaskId;
            const firstSubmitted = await callTool(ctx, firstAgent, "convivium_submit_turn", {
                protocolVersion: 1,
                meetingId,
                turnId: firstEnvelope.turn.id,
                stepId: firstEnvelope.step.id,
                attemptId: firstEnvelope.attempt.attemptId,
                deliveryId: firstEnvelope.attempt.deliveryId,
                agendaItemId: firstEnvelope.activeAgendaItem.id,
                kind: "statement",
                content: "task-handraise:a:1",
                mentions: [],
                taskIds: [meetingTaskId],
                agendaRelation: "on_topic",
                changes: {}
            }, 404);
            const taskDelivery = await waitForTaskDelivery(ctx, participantSessionId, meetingTaskId);
            const delivery = taskDelivery.value;
            const taskAgent = taskDelivery.agent;
            const taskStatusPre = await callTool(ctx, taskAgent, "convivium_meeting_task_status", { protocolVersion: 1, meetingId, meetingTaskId }, 405);
            assert(taskStatusPre.result.task.status === "queued", "MeetingTask was not delivered as queued");
            const started = await callTool(ctx, taskAgent, "convivium_start_meeting_task", {
                protocolVersion: 1,
                meetingId,
                meetingTaskId,
                requestId: delivery.deliveryId
            }, 406);
            assert(started.result.status === "running", "MeetingTask did not start");
            const statusAgent = await resumeParticipantForProbe(ctx, captain.agent, participantSessionId, "convivium-smoke-task-status-post");
            const taskStatusPost = await callTool(ctx, statusAgent, "convivium_meeting_task_status", { protocolVersion: 1, meetingId, meetingTaskId }, 407);
            assert(taskStatusPost.result.task.status === "running" && taskStatusPost.result.mayExecute === true, "MeetingTask running projection mismatch");
            const finishAgent = await resumeParticipantForProbe(ctx, captain.agent, participantSessionId, "convivium-smoke-task-finish");
            const finished = await callTool(ctx, finishAgent, "convivium_finish_meeting_task", {
                protocolVersion: 1,
                meetingId,
                meetingTaskId,
                requestId: delivery.deliveryId,
                executionId: delivery.executionId,
                status: "completed",
                resultSummary: "task evidence"
            }, 408);
            const handRaiseId = finished.result.handRaiseId;
            assert(typeof handRaiseId === "string" && handRaiseId.length > 0, "MeetingTask finish omitted HandRaise");
            const handRaiseStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 409);
            assert(handRaiseStatus.result.pendingHandRaises.some((raise) => raise.id === handRaiseId), "finished task HandRaise is not visible");
            const managerSessionId = meetingId + "-manager-manager";
            const secondManager = await resumeParticipantForProbe(ctx, captain.agent, managerSessionId, "convivium-smoke-manager-plan-2");
            const managerContext = await waitForStoredManagerContext(managerSessionId, meetingId, firstPlan.result.planningAttemptId ?? meetingId + "-planning-1");
            const secondPlan = await callTool(ctx, secondManager, "convivium_submit_manager_plan", {
                protocolVersion: 1,
                meetingId,
                planningAttemptId: managerContext.planningAttemptId,
                observedMeetingVersion: managerContext.meetingVersion,
                requestId: "smoke-task-plan-2",
                agendaItemId: handRaiseStatus.result.activeAgendaItem.id,
                intent: "explore",
                objective: "Consume task hand raise",
                expectedOutputs: [],
                prohibitedTopics: [],
                steps: [{ participantId: "participant-a", instruction: "Submit task evidence", reason: "manager_selected" }]
            }, 410);
            const laterDelivery = await waitForSpeakerContext(ctx, participantSessionId, secondPlan.result.firstAttemptId);
            const laterEnvelope = laterDelivery.value;
            const laterAgent = laterDelivery.agent;
            await callTool(ctx, laterAgent, "convivium_submit_turn", {
                protocolVersion: 1,
                meetingId,
                turnId: laterEnvelope.turn.id,
                stepId: laterEnvelope.step.id,
                attemptId: laterEnvelope.attempt.attemptId,
                deliveryId: laterEnvelope.attempt.deliveryId,
                agendaItemId: laterEnvelope.activeAgendaItem.id,
                kind: "evidence",
                content: "task-handraise:a:2",
                mentions: [],
                taskIds: [meetingTaskId],
                agendaRelation: "on_topic",
                changes: {}
            }, 411);
            const finalStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 412);
            assert(finalStatus.result.pendingHandRaises.every((raise) => raise.id !== handRaiseId), "HandRaise remained pending after later plan");
            assert(finalStatus.result.messages.at(-1)?.content === "task-handraise:a:2", "later task evidence was not submitted");
            await writeResult({ ok: true, scenario, assertions: ["task-delivered", "task-started", "finish-created-handraise", "handraise-visible-then-consumed", "later-turn-submitted"], meetingId, observed: { meetingTaskId, delivery, handRaiseId, firstMessageId: finalStatus.result.messages[0]?.id, laterMessageId: finalStatus.result.messages.at(-1)?.id } });
            return;
        }
        if (scenario === "reassign") {
            const reassignInput = createInput();
            reassignInput.agenda[0].requiredParticipantKeys = ["a"];
            const created = await callTool(ctx, captain.agent, "convivium_create_meeting", reassignInput, 300);
            const meetingId = created.result.meetingId;
            const manager = await waitForAgent(ctx, meetingId + "-manager-manager");
            await waitForObservedParticipant(ctx, meetingId, "a");
            const planned = await callTool(ctx, manager, "convivium_submit_manager_plan", {
                protocolVersion: 1,
                meetingId,
                planningAttemptId: meetingId + "-planning-1",
                observedMeetingVersion: created.meetingVersion,
                requestId: "smoke-reassign-plan-1",
                agendaItemId: "agenda-agenda-1",
                intent: "explore",
                objective: "Reassign A to B",
                expectedOutputs: [],
                prohibitedTopics: [],
                steps: [{ participantId: "participant-a", instruction: "A", reason: "manager_selected" }]
            }, 301);
            const before = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 302);
            const oldAttemptId = before.result.currentTurn?.steps?.[0]?.attemptId ?? before.result.currentAttemptId;
            const oldAgent = await waitForObservedParticipant(ctx, meetingId, "a");
            const oldChildId = oldAgent.id;
            const replacementParticipantId = created.result.participants.find((p) => p.participantKey === "b")?.participantId;
            assert(oldAttemptId && replacementParticipantId, "reassign identifiers missing");
            const reassigned = await callTool(ctx, captain.agent, "convivium_reassign_turn", {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: before.meetingVersion,
                currentAttemptId: oldAttemptId,
                action: "reassign",
                replacementParticipantId,
                reason: "smoke reassign",
                requestId: "smoke-reassign-1"
            }, 303);
            assert(reassigned.result.revokedAttemptId === oldAttemptId, "reassign revoked attempt mismatch");
            assert(typeof reassigned.result.replacementAttemptId === "string" && reassigned.result.replacementAttemptId !== oldAttemptId, "replacement attempt invalid: " + JSON.stringify(reassigned.result));
            const drainDeadline = Date.now() + 30000;
            while (ctx.agents.get(oldChildId) !== undefined && Date.now() < drainDeadline) await new Promise((resolveWait) => setTimeout(resolveWait, 100));
            assert(ctx.agents.get(oldChildId) === undefined, "reassigned old activation still resident");
            const after = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 304);
            assert(after.result.currentSpeakerId === "participant-b", "replacement speaker is not participant-b");
            assert(after.result.currentAttemptId === reassigned.result.replacementAttemptId, "replacement attempt is not current");
            const replacement = await waitForObservedParticipant(ctx, meetingId, "b");
            assert(ctx.agents.get(replacement.id) === replacement, "replacement Agent is not live in store");
            const envelopeDeadline = Date.now() + 30000;
            let envelope;
            while (Date.now() < envelopeDeadline && envelope === undefined) {
                for (const message of [...(replacement.inbox.nextTurn ?? []), ...(replacement.inbox.nextStep ?? []), ...(observedInboxMessages.get(String(replacement.id)) ?? [])]) {
                    const text = Array.isArray(message.content) ? message.content.find((part) => part.type === "text")?.text : message.content;
                    const marker = typeof text === "string" ? text.indexOf("speaker context: ") : -1;
                    if (marker >= 0) {
                        try { envelope = JSON.parse(text.slice(marker + "speaker context: ".length)); } catch {}
                    }
                }
                if (envelope === undefined) await new Promise((resolveWait) => setTimeout(resolveWait, 100));
            }
            assert(envelope?.meetingId === meetingId && envelope.step?.participantId === replacementParticipantId && envelope.attempt?.attemptId === reassigned.result.replacementAttemptId, "replacement speaker context missing or mismatched: " + JSON.stringify({ meetingId: envelope?.meetingId, turn: envelope?.turn?.id, step: envelope?.step?.id, participantId: envelope?.step?.participantId, attemptId: envelope?.attempt?.attemptId, deliveryId: envelope?.attempt?.deliveryId, agendaItemId: envelope?.activeAgendaItem?.id }));
            assert(typeof envelope.turn?.id === "string" && typeof envelope.step?.id === "string" && typeof envelope.attempt?.attemptId === "string" && typeof envelope.attempt?.deliveryId === "string" && typeof envelope.activeAgendaItem?.id === "string", "replacement speaker context fields incomplete");
            const submittedAt = Date.now();
            const submitted = await callTool(ctx, replacement, "convivium_submit_turn", {
                protocolVersion: 1,
                meetingId,
                turnId: envelope.turn.id,
                stepId: envelope.step.id,
                attemptId: envelope.attempt.attemptId,
                deliveryId: envelope.attempt.deliveryId,
                agendaItemId: envelope.activeAgendaItem.id,
                kind: "statement",
                content: "reassign:b:1",
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic",
                changes: {}
            }, 305);
            const finalStatus = await callTool(ctx, captain.agent, "convivium_meeting_status", { protocolVersion: 1, meetingId }, 306);
            assert(finalStatus.result.messages.length === 1 && finalStatus.result.messages[0].content === "reassign:b:1", "reassign transcript mismatch");
            await writeResult({ ok: true, scenario, assertions: ["old-attempt-revoked", "old-activation-drained", "replacement-attempt-submitted", "transcript-preserved"], meetingId, observed: { oldAttemptId, revokedAttemptId: reassigned.result.revokedAttemptId, replacementAttemptId: reassigned.result.replacementAttemptId, oldChildId, oldAgentResidentAfterReassign: ctx.agents.get(oldChildId) !== undefined, currentSpeakerId: after.result.currentSpeakerId, currentAttemptId: after.result.currentAttemptId, submittedMessageId: submitted.result.messageId, submittedAt, transcript: finalStatus.result.messages } });
            return;
        }
        if (browserMode) {
            captain.agent.session.append("user/message", {
                id: "convivium-smoke-browser-message",
                role: "user",
                content: [{ type: "text", text: "Browser smoke session" }],
                source: { kind: "user" }
            }, { surfaceOp: "append" });
            await ctx.sessions.flush(captain.agent.session);
            await workspace.attachSession(captain.agent.session.id);
        }
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
        const timeoutProbe = scenario === "timeout";
        const timeoutSpeaker = timeoutProbe
            ? await waitForObservedParticipant(ctx, meetingId, "a")
            : undefined;
        const timeoutSessionId = timeoutSpeaker?.id;
        const timeoutStartedAt = timeoutProbe ? Date.now() : undefined;
        let timeoutOracle;
        let nextSpeakerSubmittedAt;
        const messages = [];
        for (let index = 0; index < participants.length; index += 1) {
            const participantId = participants[index];
            const stepDeadline = Date.now() + 30000;
            while (Date.now() < stepDeadline) {
                const beforeSubmit = await callTool(ctx, captain.agent, "convivium_meeting_status", {
                    protocolVersion: 1,
                    meetingId
                }, nextCall++);
                if (timeoutProbe && index === 1) {
                    const advanced = beforeSubmit.result.currentSpeakerId !== "participant-a";
                    if (!advanced) {
                        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
                        continue;
                    }
                    if (timeoutSessionId === undefined) throw new Error("timeout owned session missing");
                    if (ctx.agents.get(timeoutSessionId) !== undefined) {
                        throw new Error("timed-out participant Agent is still resident");
                    }
                    const listSignal = new AbortController();
                    const children = await ctx.subagents.listChildren(captain.agent.session.id, listSignal.signal);
                    const durableChild = children.find((child) => child.id === timeoutSessionId);
                    if (durableChild === undefined || durableChild.mode !== "continuable" || durableChild.activity !== "inactive" || durableChild.diagnostic !== undefined) {
                        throw new Error("timed-out participant durable child observation invalid");
                    }
                    const drainedAt = Date.now();
                    timeoutOracle = {
                        oldAttemptId: managerPlan.result.firstAttemptId,
                        drainedAt,
                        durableSessionId: timeoutSessionId,
                        durableChild
                    };
                }
                const requiredMessages = scenario === "timeout" ? index : index + 1;
                if (beforeSubmit.result.messages.length >= requiredMessages) {
                    if (timeoutProbe && index > 0) nextSpeakerSubmittedAt = Date.now();
                    break;
                }
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
        const expectedTranscript = scenario === "timeout" ? "CB" : "ACB";
        assert(
            transcript.map((message) => message.content).join("") === expectedTranscript,
            "transcript order is not " + expectedTranscript
        );
        if (timeoutProbe) {
            assert(transcript.every((message) => message.speaker !== "participant-a"), "timed-out speaker wrote a message");
            assert(transcript.length === 2, "timeout transcript has an unexpected message count");
            assert(status.result.currentAttemptId === undefined || status.result.currentAttemptId !== managerPlan.result.firstAttemptId, "old attempt remains current");
            assert(timeoutOracle !== undefined && nextSpeakerSubmittedAt !== undefined, "timeout timestamps missing");
            assert(timeoutOracle.drainedAt < nextSpeakerSubmittedAt, "next speaker submitted before drain");
        }
        assert(status.result.status === "running", "next planning did not keep meeting running");
        assert(status.result.currentTurn === undefined, "next planning unexpectedly exposed a current turn");
        const baseUrl = "http://127.0.0.1:" + ctx.webServer.port;
        const meetingsUrl = baseUrl + "/api/convivium/meetings";
        const selectedUrl = meetingsUrl + "/" + encodeURIComponent(meetingId);
        const list = await callHttp(meetingsUrl);
        assert(
            list.result.meetings.some((meeting) => meeting.meetingId === meetingId),
            "HTTP list did not include the smoke Meeting"
        );
        const webStatus = await callHttp(selectedUrl);
        const paused = await callHttp(selectedUrl + "/pause", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: webStatus.meetingVersion,
                requestId: "smoke-http-pause-1",
                reason: "Verify local host control"
            })
        });
        assert(paused.result.status === "paused", "HTTP pause did not return paused");
        const pausedStatus = await callHttp(selectedUrl);
        assert(pausedStatus.result.status === "paused", "HTTP status did not project paused");
        assert(
            pausedStatus.result.pauseControl.pausedBy.kind === "local_host" &&
                pausedStatus.result.pauseControl.pausedBy.actorId === "loopback-web",
            "HTTP pause actor was not local_host/loopback-web"
        );
        const resumed = await callHttp(selectedUrl + "/resume", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: pausedStatus.meetingVersion,
                requestId: "smoke-http-resume-1"
            })
        });
        assert(resumed.result.status === "running", "HTTP resume did not return running");
        const resumedStatus = await callHttp(selectedUrl);
        assert(resumedStatus.result.status === "running", "HTTP status did not return to running");
        await writeResult({
            ok: true,
            scenario,
            assertions: scenario === "timeout" ? [] : ["baseline-transcript-acb", "baseline-http-pause-resume"],
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
            timeoutOracle,
            timeoutStartedAt,
            nextSpeakerSubmittedAt,
            nextPlanObserved: status.result.currentTurn === undefined,
            httpRouteUsed: true,
            captainSessionId: "convivium-smoke-captain",
            webUrl: baseUrl
        });
    } catch (error) {
        await writeResult({
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        });
    } finally {
        if (!browserMode) await captain?.dispose();
    }
}

export function apply(ctx) {
    ctx.on("agent/created", ({ agent }) => {
        observedAgents.set(String(agent.id), agent);
        if (String(agent.id).includes("-participant-")) {
            agent.ctx.on("agent/status", () => scheduleParticipant(ctx, agent));
            agent.ctx.on("agent/inbox/inserted", ({ message }) => { recordInbox(agent, message); scheduleParticipant(ctx, agent); });
            scheduleParticipant(ctx, agent);
        }
    });
    ctx.on("agent/status", ({ agent }) => {
        if (String(agent.id).includes("-participant-")) scheduleParticipant(ctx, agent);
    });
    ctx.on("agent/inbox/inserted", ({ agent, message }) => {
        if (message) recordInbox(agent, message);
        if (String(agent.id).includes("-participant-")) scheduleParticipant(ctx, agent);
    });
    ctx.effect(() => {
        void run(ctx);
        return async () => {
            releaseColdMaintenance?.();
            await coldMaintenancePromise;
            releaseMailMaintenance?.();
            await mailMaintenancePromise;
        };
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
    let bootLogs = await bootHost(env, patchPath, workspaceDir, logsDir, port);
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
        env.CONVIVIUM_SMOKE_COLD_PHASE = "2";
        env.CONVIVIUM_SMOKE_COLD_CHECKPOINT = coldCheckpointPath;
        bootLogs = await bootHost(env, patchPath, workspaceDir, logsDir, port);
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
