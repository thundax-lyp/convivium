import { request as httpRequest } from "node:http";
import { runPeerMeetingAgentsScenario } from "./scenarios/peer-meeting-agents.js";
import { collectAgentPromptEvidence, createProbeSupport } from "./support.js";
import { runIdentityAdmissionScenario } from "./scenarios/identity-admission.js";
import { runMeetingBusinessLoopScenario } from "./scenarios/meeting-business-loop.js";

export const name = "convivium-smoke-profile-probe";
export const inject = [
    "agents",
    "sessions",
    "sessionPersistence",
    "subagents",
    "tools",
    "webServer",
    "connection",
    "workspaceRegistry",
    "typertGateway",
    "agentPresets",
    "skills"
];

const outputPath = process.env.CONVIVIUM_SMOKE_RESULT;
const agentPromptsPath = process.env.CONVIVIUM_SMOKE_AGENT_PROMPTS_PATH;
const scenario = process.env.CONVIVIUM_SMOKE_SCENARIO || "identity-admission";
const {
    assert,
    callTool,
    callTargetTool,
    callTargetToolResult,
    createInput,
    writeResult,
    observedMessages,
    messageTexts
} = createProbeSupport(outputPath);
let inputSession;
let nextCall = 1000;
const observedAgents = new Map();
const observedInboxMessages = new Map();
const inboxWaiters = new Set();

async function waitForAgent(ctx, id) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const agent = ctx.agents.get(id);
        if (agent) return agent;
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error(
        "Timed out waiting for real participant Agent " +
            id +
            "; observed=" +
            JSON.stringify([...observedAgents.keys()].sort())
    );
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
            for (const message of observedMessages(live, observedInboxMessages))
                onInbox(live, message);
        }
    });
}

async function run(ctx) {
    if (!outputPath) return;
    if (
        !["identity-admission", "meeting-business-loop", "peer-meeting-agents"].includes(scenario)
    ) {
        await writeResult({ ok: false, scenario, error: "SCENARIO_NOT_IMPLEMENTED:" + scenario });
        return;
    }
    try {
        if (
            scenario === "meeting-business-loop" &&
            process.env.CONVIVIUM_SMOKE_PHASE === "cold-reopen"
        ) {
            const meetingId = process.env.CONVIVIUM_SMOKE_MEETING_ID;
            assert(meetingId, "cold reopen requires the original meeting id");
            const runtimeApi = ctx.get("conviviumMeetingRuntime");
            assert(runtimeApi, "cold reopen Meeting runtime is unavailable");
            const reopened = await runtimeApi.read(
                { protocolVersion: 1, meetingId },
                new AbortController().signal
            );
            assert(reopened.lifecycle.status === "archived", "cold reopen lost archived state");
            assert(reopened.archive?.status === "complete", "cold reopen lost archive package");
            await writeResult({
                ok: true,
                scenario: "meeting-business-loop-cold-reopen",
                meetingId,
                status: reopened.lifecycle.status,
                archiveStatus: reopened.archive.status
            });
            return;
        }
        if (process.env.CONVIVIUM_SMOKE_PHASE !== "cold-reopen") {
            inputSession = await ctx.agents.create({
                sessionId: "convivium-smoke-input",
                meta: { cwd: process.cwd() }
            });
            await ctx.sessionPersistence.ensureMaterialized(inputSession.agent.session);
            await ctx.sessions.flush(inputSession.agent.session);
        }
        let userCookie;
        // Each call establishes and closes its own real loopback user connection.
        const remote = (method, args) =>
            new Promise((resolve, reject) => {
                const endpoint = `conviviumMeetings/${method}`;
                const rpcId = `probe-${nextCall++}`;
                const request = httpRequest(
                    {
                        hostname: "127.0.0.1",
                        port: Number(process.env.CONVIVIUM_SMOKE_REMOTE_PORT),
                        path: `/api/${endpoint}`,
                        method: "POST",
                        agent: false,
                        headers: {
                            "content-type": "application/json",
                            connection: "close",
                            ...(userCookie ? { cookie: userCookie } : {})
                        }
                    },
                    (response) => {
                        let body = "";
                        response.setEncoding("utf8");
                        response.on("data", (chunk) => {
                            body += chunk;
                        });
                        response.on("error", reject);
                        response.on("end", () => {
                            try {
                                assert(
                                    response.statusCode === 200,
                                    `Remote HTTP ${response.statusCode}: ${body}`
                                );
                                const result = JSON.parse(body);
                                assert(
                                    result.type === "server-response" && result.rpcId === rpcId,
                                    "Remote envelope mismatch"
                                );
                                assert(
                                    result.result.ok,
                                    "Remote rejected: " + JSON.stringify(result.result.error)
                                );
                                resolve(result.result.value);
                            } catch (error) {
                                reject(error);
                            }
                        });
                    }
                );
                request.on("error", reject);
                request.setTimeout(120000, () =>
                    request.destroy(new Error("Remote request timeout"))
                );
                request.end(
                    JSON.stringify({
                        type: "client-request",
                        rpcId,
                        method: endpoint,
                        payload: { args }
                    })
                );
            });
        // Registration and the HTTP listener may settle after this plugin's effect starts.
        const deadline = Date.now() + 30000;
        for (;;) {
            try {
                const auth = await fetch(
                    ctx.connection.authenticatedUrl(
                        `http://127.0.0.1:${process.env.CONVIVIUM_SMOKE_REMOTE_PORT}/`
                    ),
                    { redirect: "manual" }
                );
                userCookie = auth.headers
                    .getSetCookie()
                    .map((cookie) => cookie.split(";", 1)[0])
                    .join("; ");
                assert(userCookie, "Host user authentication did not issue a cookie");
                await remote("list", {});
                break;
            } catch (error) {
                if (Date.now() >= deadline) throw error;
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }
        const runtime = {
            ctx,
            scenario,
            inputSession,
            remote,
            nextCall() {
                return nextCall++;
            },
            assert,
            callTool,
            callTargetTool,
            callTargetToolResult,
            createInput,
            writeResult,
            waitForAgent,
            waitForInbox,
            messageTexts,
            observedMessages: (agent) => observedMessages(agent, observedInboxMessages),
            observedAgents: () => [...observedAgents.values()]
        };
        if (scenario === "identity-admission") {
            await runIdentityAdmissionScenario(runtime);
        } else if (scenario === "peer-meeting-agents") {
            await runPeerMeetingAgentsScenario(runtime);
        } else {
            await runMeetingBusinessLoopScenario(runtime);
        }
    } catch (error) {
        await writeResult({
            ok: false,
            error: error instanceof Error ? (error.stack ?? error.message) : String(error)
        });
    } finally {
        if (agentPromptsPath && process.env.CONVIVIUM_SMOKE_PHASE !== "cold-reopen") {
            const fs = await import("node:fs/promises");
            const promptEvidence = collectAgentPromptEvidence(
                observedAgents,
                observedInboxMessages
            );
            await fs.writeFile(
                agentPromptsPath + ".tmp",
                JSON.stringify(promptEvidence, null, 2),
                "utf8"
            );
            await fs.rename(agentPromptsPath + ".tmp", agentPromptsPath);
        }
        await inputSession?.dispose();
    }
}

export function apply(ctx) {
    ctx.on("agent/created", ({ agent }) => {
        observedAgents.set(String(agent.id), agent);
        {
            agent.ctx.on("agent/inbox/inserted", ({ message }) => recordInbox(agent, message));
        }
    });
    ctx.on("agent/inbox/inserted", ({ agent, message }) => {
        if (message) recordInbox(agent, message);
    });
    ctx.effect(() => {
        void run(ctx);
        return () => {};
    }, "convivium-smoke-profile-probe");
}
