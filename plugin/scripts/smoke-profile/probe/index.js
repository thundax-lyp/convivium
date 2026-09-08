import { prepareRoleSmoke } from "./scenarios/role-composition.js";
import { createProbeSupport, validateColdCheckpoint } from "./support.js";
import { runRiskReopenScenario } from "./scenarios/risk-reopen.js";
import { runMailRaceScenario } from "./scenarios/mail.js";
import { runCrossMeetingScenario } from "./scenarios/isolation.js";
import { runReassignScenario } from "./scenarios/reassign.js";
import { runColdRebindScenario } from "./scenarios/recovery.js";
import { runScribeMinutesScenario } from "./scenarios/scribe-minutes.js";
import { runArchiveContinuationScenario } from "./scenarios/archive.js";
import { runCompletionEndScenario, runTaskHandraiseScenario } from "./scenarios/completion.js";
import { runDecisionRiskClosureScenario } from "./scenarios/decision-risk-closure.js";
import {
    runConvergenceScenario,
    runConvergenceStalledScenario,
    runConvergenceTurnBudgetCompletionScenario
} from "./scenarios/convergence.js";
import { runBaselineScenario } from "./scenarios/baseline.js";

export const name = "convivium-smoke-profile-probe";
export const inject = [
    "agents",
    "sessions",
    "sessionPersistence",
    "subagents",
    "tools",
    "webServer",
    "workspaceRegistry"
];

const outputPath = process.env.CONVIVIUM_SMOKE_RESULT;
const browserMode = process.env.CONVIVIUM_SMOKE_BROWSER_MODE === "1";
const scenario = process.env.CONVIVIUM_SMOKE_SCENARIO || "baseline";
const {
    assert,
    callTool,
    callHttp,
    createInput,
    writeResult,
    observedMessages,
    messageText,
    messageTexts
} = createProbeSupport(outputPath);
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

async function resumeParticipantForProbe(ctx, parent, childId, marker) {
    const delivery = waitForInbox(ctx, childId, (message) =>
        messageTexts(message).some((text) => text.includes(marker)) ? marker : undefined
    );
    await ctx.subagents.sendMessage(parent, childId, [{ type: "text", text: marker }], {
        signal: new AbortController().signal
    });
    return (await delivery).agent;
}

async function waitForSpeakerContext(ctx, agentId, attemptId) {
    return waitForInbox(ctx, agentId, (message) => {
        for (const text of messageTexts(message)) {
            const marker = text.indexOf("speaker context: ");
            if (marker < 0) continue;
            try {
                const context = JSON.parse(text.slice(marker + "speaker context: ".length));
                if (context.attempt?.attemptId === attemptId) return context;
            } catch {
                // Ignore non-context text blocks.
            }
        }
        return undefined;
    });
}

async function waitForTaskDelivery(ctx, agentId, meetingTaskId) {
    return waitForInbox(ctx, agentId, (message) => {
        for (const text of messageTexts(message)) {
            if (!text.startsWith("Execute MeetingTask " + meetingTaskId + ":")) continue;
            const executionId = text.match(/^executionId: (.+)$/m)?.[1];
            const deliveryId = text.match(/^deliveryId: (.+)$/m)?.[1];
            if (executionId && deliveryId) return { executionId, deliveryId };
        }
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
        const texts = (observedInboxMessages.get(String(agentId)) ?? []).flatMap(messageTexts);
        for (const text of texts) {
            try {
                const marker = text.indexOf("manager context: ");
                const context = JSON.parse(
                    marker >= 0 ? text.slice(marker + "manager context: ".length) : text
                );
                if (
                    context.meetingId === meetingId &&
                    context.planningAttemptId &&
                    context.planningAttemptId !== excludedPlanningAttemptId &&
                    Number.isInteger(context.meetingVersion) &&
                    (expectedMeetingVersion === undefined ||
                        context.meetingVersion === expectedMeetingVersion)
                )
                    return context;
            } catch {
                // Ignore non-context text blocks.
            }
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error("Timed out waiting for the later Manager planning context.");
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
    if (scenario === "meeting-roles") return;
    if (scenario === "convergence-stalled" || scenario === "convergence-turn-budget-completion")
        return;
    if (captain === undefined || meetingId === undefined) return;
    const participantId = "participant-" + String(agent.id).split("-").at(-1);
    const index = participants.indexOf(participantId);
    if (index < 0) return;
    if (
        scenario === "reassign" ||
        scenario === "task-handraise" ||
        scenario === "archive-continuation" ||
        scenario === "scribe-minutes" ||
        scenario === "mail-race" ||
        scenario === "cross-meeting" ||
        scenario === "decision-risk-closure" ||
        scenario === "risk-reopen" ||
        scenario === "cold-rebind" ||
        scenario === "role-composition"
    )
        return;
    if (scenario === "timeout" && participantId === "participant-a") return;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (ctx.agents.get(agent.id) !== agent) return;
        const status = await callTool(
            ctx,
            captain.agent,
            "convivium_meeting_status",
            {
                protocolVersion: 1,
                meetingId
            },
            nextCall++
        );
        if (status.result.messages.length >= index + 1) return;
        if (status.result.currentSpeakerId !== participantId) {
            await new Promise((resolveWait) => setTimeout(resolveWait, 100));
            continue;
        }
        try {
            await callTool(
                ctx,
                agent,
                "convivium_submit_turn",
                {
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
                },
                nextCall++
            );
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
    if (
        scenario !== "baseline" &&
        scenario !== "timeout" &&
        scenario !== "reassign" &&
        scenario !== "task-handraise" &&
        scenario !== "completion-end" &&
        scenario !== "risk-reopen" &&
        scenario !== "decision-risk-closure" &&
        scenario !== "cold-rebind" &&
        scenario !== "role-composition" &&
        scenario !== "meeting-roles" &&
        scenario !== "archive-continuation" &&
        scenario !== "scribe-minutes" &&
        scenario !== "mail-race" &&
        scenario !== "cross-meeting" &&
        scenario !== "convergence" &&
        scenario !== "convergence-stalled" &&
        scenario !== "convergence-turn-budget-completion"
    ) {
        await writeResult({ ok: false, scenario, error: "SCENARIO_NOT_IMPLEMENTED:" + scenario });
        return;
    }
    try {
        const workspace = browserMode
            ? await ctx.workspaceRegistry.create(process.cwd(), "Convivium smoke")
            : undefined;
        const coldPhase = process.env.CONVIVIUM_SMOKE_COLD_PHASE ?? "1";
        const roleSmoke =
            scenario === "role-composition" ? await prepareRoleSmoke(ctx, coldPhase) : undefined;
        if (["role-composition", "meeting-roles"].includes(scenario) && browserMode)
            throw new Error("Role smoke rejects Browser mode");
        if (!(["cold-rebind", "role-composition"].includes(scenario) && coldPhase === "2")) {
            captain = ["role-composition", "meeting-roles"].includes(scenario)
                ? await ctx.agents.create({
                      sessionId: "convivium-smoke-captain",
                      meta: {
                          cwd: process.cwd(),
                          agentPreset: scenario === "meeting-roles" ? "convivium" : "minimal"
                      },
                      setup: async (agentCtx) => {
                          await ctx
                              .get("agentPresets")
                              .mount(
                                  agentCtx,
                                  scenario === "meeting-roles" ? "convivium" : "minimal"
                              );
                      }
                  })
                : createSmokeAgent(ctx, "convivium-smoke-captain");
        }
        const runtime = {
            ctx,
            scenario,
            browserMode,
            roleSmoke,
            workspace,
            participants,
            get captain() {
                return captain;
            },
            meetingId,
            setMeetingId(value) {
                meetingId = value;
            },
            nextCall() {
                return nextCall++;
            },
            assert,
            callTool,
            callHttp,
            createInput,
            writeResult,
            waitForAgent,
            waitForObservedParticipant,
            waitForSpeakerContext,
            waitForTaskDelivery,
            waitForInbox,
            waitForStoredManagerContext,
            messageTexts,
            messageText,
            observedMessages(agent) {
                return observedMessages(agent, observedInboxMessages);
            },
            resumeParticipantForProbe,
            coldPhase: process.env.CONVIVIUM_SMOKE_COLD_PHASE ?? "1",
            coldCheckpointPath: process.env.CONVIVIUM_SMOKE_COLD_CHECKPOINT,
            hostPid: process.pid,
            validateColdCheckpoint,
            readFile: async (path, encoding) =>
                (await import("node:fs/promises")).readFile(path, encoding),
            registerSmokeAgent,
            setCaptain(value) {
                captain = value;
            },
            writeCheckpoint: async (checkpoint) => {
                const checkpointPath = process.env.CONVIVIUM_SMOKE_COLD_CHECKPOINT;
                assert(checkpointPath, "cold checkpoint path missing");
                const checkpointFs = await import("node:fs/promises");
                await checkpointFs.writeFile(
                    checkpointPath + ".tmp",
                    JSON.stringify(checkpoint),
                    "utf8"
                );
                await checkpointFs.rename(checkpointPath + ".tmp", checkpointPath);
            },
            setColdMaintenance(release, promise) {
                if (release !== undefined) releaseColdMaintenance = release;
                if (promise !== undefined) coldMaintenancePromise = promise;
            },
            setMailMaintenance(release, promise) {
                if (release !== undefined) releaseMailMaintenance = release;
                if (promise !== undefined) mailMaintenancePromise = promise;
            },
            async releaseMailMaintenance() {
                releaseMailMaintenance?.();
                await mailMaintenancePromise;
                releaseMailMaintenance = undefined;
                mailMaintenancePromise = undefined;
            }
        };
        await runSelectedScenario(runtime);
        return;
    } catch (error) {
        await writeResult({
            ok: false,
            error: error instanceof Error ? (error.stack ?? error.message) : String(error)
        });
    } finally {
        if (!browserMode) await captain?.dispose();
    }
}

async function runSelectedScenario(runtime) {
    switch (runtime.scenario) {
        case "baseline":
        case "timeout":
            return runBaselineScenario(runtime);
        case "reassign":
            return runReassignScenario(runtime);
        case "task-handraise":
            return runTaskHandraiseScenario(runtime);
        case "completion-end":
            return runCompletionEndScenario(runtime);
        case "risk-reopen":
            return runRiskReopenScenario(runtime);
        case "decision-risk-closure":
            return runDecisionRiskClosureScenario(runtime);
        case "cold-rebind":
        case "role-composition":
            return runColdRebindScenario(runtime);
        case "meeting-roles":
            return (await import("./scenarios/meeting-roles.js")).runMeetingRolesScenario(runtime);
        case "scribe-minutes":
            return runScribeMinutesScenario(runtime);
        case "archive-continuation":
            return runArchiveContinuationScenario(runtime);
        case "mail-race":
            return runMailRaceScenario(runtime);
        case "cross-meeting":
            return runCrossMeetingScenario(runtime);
        case "convergence-stalled":
            return runConvergenceStalledScenario(runtime);
        case "convergence-turn-budget-completion":
            return runConvergenceTurnBudgetCompletionScenario(runtime);
        case "convergence":
            return runConvergenceScenario(runtime);
        default:
            throw new Error("SCENARIO_NOT_IMPLEMENTED:" + runtime.scenario);
    }
}

export function apply(ctx) {
    ctx.on("agent/created", ({ agent }) => {
        observedAgents.set(String(agent.id), agent);
        if (String(agent.id).includes("-participant-")) {
            agent.ctx.on("agent/status", () => scheduleParticipant(ctx, agent));
            agent.ctx.on("agent/inbox/inserted", ({ message }) => {
                recordInbox(agent, message);
                scheduleParticipant(ctx, agent);
            });
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
