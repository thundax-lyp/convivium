import { createProbeSupport } from "./support.js";
import { runParallelContributionScenario } from "./scenarios/parallel-contribution.js";
import { runParallelContributionModelScenario } from "./scenarios/parallel-contribution-model.js";
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
    "workspaceRegistry"
];

const outputPath = process.env.CONVIVIUM_SMOKE_RESULT;
const browserMode = process.env.CONVIVIUM_SMOKE_BROWSER_MODE === "1";
const scenario = process.env.CONVIVIUM_SMOKE_SCENARIO || "parallel-contribution";
const {
    assert,
    callTool,
    callTargetTool,
    createInput,
    writeResult,
    observedMessages,
    messageTexts
} =
    createProbeSupport(outputPath);
let captain;
let nextCall = 1000;
const observedAgents = new Map();
const observedInboxMessages = new Map();
const inboxWaiters = new Set();

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

function waitForContributionContext(ctx, agentId, contributionId, purpose) {
    const prefix =
        purpose === "manager" ? "contribution manager context: " : "contribution context: ";
    return waitForInbox(ctx, agentId, (message) => {
        for (const text of messageTexts(message)) {
            if (!text.startsWith(prefix)) continue;
            try {
                const context = JSON.parse(text.slice(prefix.length));
                if (
                    context.purpose === purpose &&
                    (purpose === "manager"
                        ? contributionId === undefined ||
                          context.work?.pending?.some((task) => task.id === contributionId)
                        : context.work?.task?.id === contributionId ||
                          context.work?.submission?.task?.id === contributionId)
                )
                    return context;
            } catch {
                // Ignore non-context text blocks.
            }
        }
        return undefined;
    });
}

async function resumeParticipantForProbe(ctx, parent, childId, marker) {
    const delivery = waitForInbox(ctx, childId, (message) =>
        messageTexts(message).some((text) => text.includes(marker)) ? marker : undefined
    );
    await ctx.subagents.sendMessage(parent, childId, [{ type: "text", text: marker }], {
        signal: new AbortController().signal
    });
    return (await delivery).agent;
}

function createSmokeAgent(ctx, sessionId) {
    const session = ctx.sessions.create(sessionId, {
        meta: { cwd: process.cwd() }
    });
    const agent = {
        id: session.id,
        options: {},
        session,
        inbox: { nextTurn: [], nextStep: [] },
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

async function run(ctx) {
    if (!outputPath) return;
    if (
        ![
            "parallel-contribution",
            "parallel-contribution-model",
            "identity-admission",
            "meeting-business-loop"
        ].includes(
            scenario
        )
    ) {
        await writeResult({ ok: false, scenario, error: "SCENARIO_NOT_IMPLEMENTED:" + scenario });
        return;
    }
    try {
        const workspace = browserMode
            ? await ctx.workspaceRegistry.create(process.cwd(), "Convivium smoke")
            : undefined;
        captain =
            scenario === "parallel-contribution-model" || scenario === "identity-admission" || scenario === "meeting-business-loop"
                ? await ctx.agents.create({
                      sessionId:
                          scenario === "identity-admission"
                              ? "convivium-identity-manager"
                              : "convivium-smoke-captain",
                      agentOptions: {
                          provider:
                              scenario === "identity-admission" ? "spawn" : "deepseek-official",
                          ...(scenario === "identity-admission"
                              ? {}
                              : { model: "deepseek-v4-flash" })
                      },
                      meta: { cwd: process.cwd(), agentPreset: "convivium" },
                      setup: async (agentCtx) => {
                          await ctx.get("agentPresets").mount(agentCtx, "convivium");
                      }
                  })
                : createSmokeAgent(ctx, "convivium-smoke-captain");
        const runtime = {
            ctx,
            scenario,
            browserMode,
            workspace,
            get captain() {
                return captain;
            },
            nextCall() {
                return nextCall++;
            },
            assert,
            callTool,
            callTargetTool,
            createInput,
            writeResult,
            waitForAgent,
            waitForObservedParticipant,
            waitForInbox,
            waitForContributionContext,
            messageTexts,
            observedMessages: (agent) => observedMessages(agent, observedInboxMessages),
            observedAgents: () => [...observedAgents.values()],
            resumeParticipantForProbe
        };
        if (scenario === "parallel-contribution") {
            await runParallelContributionScenario(runtime);
        } else if (scenario === "parallel-contribution-model") {
            await runParallelContributionModelScenario(runtime);
        } else if (scenario === "identity-admission") {
            await runIdentityAdmissionScenario(runtime);
        } else {
            await runMeetingBusinessLoopScenario(runtime);
        }
    } catch (error) {
        await writeResult({
            ok: false,
            error: error instanceof Error ? (error.stack ?? error.message) : String(error)
        });
    } finally {
        if (!browserMode) await captain?.dispose();
    }
}

export function apply(ctx) {
    ctx.on("agent/created", ({ agent }) => {
        observedAgents.set(String(agent.id), agent);
        if (String(agent.id).includes("-participant-")) {
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
