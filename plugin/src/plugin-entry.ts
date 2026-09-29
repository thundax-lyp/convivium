import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
// Load the Cordis augmentation for ctx.webServer without a runtime import.
import type {} from "@deepseek-ai/dsh-host-webserver";
import type { Config as ConfigType } from "./config.ts";
import { resolveMeetingCaller } from "./dsh/index.ts";
import { ConviviumRemoteService } from "./remote/index.ts";
import { activateTargetMeetingApplication, getLocalMeetingWebRuntime } from "./runtime/index.ts";
import {
    MeetingStartGate,
    registerMeetingStartTool,
    registerMeetingCancelTool,
    registerMeetingTools
} from "./tools/index.ts";

export const name = "convivium";

const meetingServices = [
    "agents",
    "sessions",
    "sessionPersistence",
    "agentPresets",
    "agentDefaultModel",
    "skills",
    "llm",
    "subagents",
    "systemPrompt",
    "tools"
] as const;

export const inject = [] as const;

const meetingConsumerPlugin = {
    name: "convivium-meeting-consumer",
    inject: [...meetingServices, "storageDomain"] as const,
    async apply(ctx: Context, config: ConfigType): Promise<void> {
        if (ctx.subagents.getProvider(config.provider) !== undefined) {
            await activate();
            return;
        }
        const stopListening = ctx.on("subagent/provider-added", (provider) => {
            if (provider.name !== config.provider) {
                return;
            }
            stopListening();
            void activate().catch((error: unknown) => {
                ctx.logger("convivium:meeting").error("Meeting activation failed %o", error);
            });
        });
        async function activate(): Promise<void> {
            const disposeTarget = await activateTargetMeetingApplication(ctx, config, {
                rolePackageRoot: fileURLToPath(new URL("../", import.meta.url)),
                onBeforeRecovery: ({ runtime, reader, application }) => {
                    registerMeetingTools({
                        registry: ctx.tools,
                        application,
                        reviewWorkers: ctx.subagents,
                        reader,
                        callers: {
                            async resolve(agent, signal) {
                                return resolveMeetingCaller(agent, runtime, signal);
                            }
                        }
                    });
                }
            });
            ctx.effect(() => disposeTarget, "convivium:target-runtime");
            const runtime = getLocalMeetingWebRuntime(ctx);
            (ctx as Context & { provide?: (name: string, value: unknown) => void }).provide?.(
                "conviviumMeetingRuntime",
                runtime
            );
            const startGate = new MeetingStartGate();
            ctx.on("agent/pre-step", async ({ agent, messages, turn, signal }, next) => {
                const decision = await next();
                if (
                    decision.kind !== "reject" &&
                    messages.some((message) => message.source.kind === "user")
                ) {
                    const skill = await ctx.skills
                        .get("convivium", {
                            scope: agent,
                            cwd: agent.session.header.cwd,
                            signal
                        })
                        .catch(() => undefined);
                    if (skill?.invocation.userInvocable) {
                        startGate.observe(agent.id, turn, messages);
                    } else {
                        startGate.clear(agent.id, turn);
                    }
                }
                return decision;
            });
            ctx.on("agent/turn-stopping", ({ agent, turn }) => {
                startGate.clear(agent.id, turn);
            });
            registerMeetingStartTool({
                registry: ctx.tools,
                gate: startGate,
                create: (command, signal) => runtime.startFromSkill(command, signal),
                initialContributorRoleIds: config.initialContributorRoleIds,
                isMeetingAgent: async (agent, signal) =>
                    (await resolveMeetingCaller(agent, runtime, signal)) !== undefined
            });
            registerMeetingCancelTool({
                registry: ctx.tools,
                gate: startGate,
                read: (meetingId, signal) =>
                    runtime.read({ protocolVersion: 1, meetingId }, signal),
                cancel: (command, signal) => runtime.cancelFromSkill(command, signal),
                isMeetingAgent: async (agent, signal) =>
                    (await resolveMeetingCaller(agent, runtime, signal)) !== undefined
            });
            ctx.inject(["webServer", "typertGateway", "typert"], (remoteContext) => {
                if (remoteContext.webServer.host === "127.0.0.1") {
                    remoteContext.plugin(ConviviumRemoteService, runtime);
                }
            });
        }
    }
};

export async function apply(ctx: Context, config: ConfigType): Promise<void> {
    await ctx.plugin(meetingConsumerPlugin, config);
}
