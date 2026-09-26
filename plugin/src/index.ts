import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
// Load the Cordis augmentation for ctx.webServer without a runtime import.
import type {} from "@deepseek-ai/dsh-host-webserver";
import { Config, type Config as ConfigType } from "./config.js";
import { resolveMeetingCaller } from "./dsh/index.js";
import { ConviviumRemoteService } from "./remote/index.js";
import {
    activateTargetMeetingApplication,
    getLocalMeetingWebRuntime,
    getMeetingIdentityReader,
    getMeetingCommandApplication
} from "./runtime/index.js";
import { MeetingStartGate, registerMeetingStartTool, registerMeetingTools } from "./tools/index.js";

export { Config };
export { ConviviumRemoteService };
export type { Config as ConfigType } from "./config.js";

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
            if (provider.name !== config.provider) return;
            stopListening();
            void activate().catch((error: unknown) => {
                ctx.logger("convivium:meeting").error("Meeting activation failed %o", error);
            });
        });
        async function activate(): Promise<void> {
            const disposeTarget = await activateTargetMeetingApplication(ctx, config, {
                rolePackageRoot: fileURLToPath(new URL("../", import.meta.url))
            });
            ctx.effect(() => disposeTarget, "convivium:target-runtime");
            const runtime = getLocalMeetingWebRuntime(ctx);
            const reader = getMeetingIdentityReader(ctx);
            const application = getMeetingCommandApplication(ctx);
            (ctx as Context & { provide?: (name: string, value: unknown) => void }).provide?.(
                "conviviumMeetingRuntime",
                runtime
            );
            registerMeetingTools({
                registry: ctx.tools,
                application,
                reviewWorkers: ctx.subagents,
                reader,
                callers: {
                    async resolve(agent, signal) {
                        const resolved = await resolveMeetingCaller(agent, runtime, signal);
                        return resolved;
                    }
                }
            });
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
                    if (skill?.invocation.userInvocable)
                        startGate.observe(agent.id, turn, messages);
                    else startGate.clear(agent.id, turn);
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
                isMeetingAgent: async (agent, signal) =>
                    (await resolveMeetingCaller(agent, runtime, signal)) !== undefined
            });
            ctx.inject(["webServer", "typertGateway", "typert"], (remoteContext) => {
                if (remoteContext.webServer.host === "127.0.0.1")
                    remoteContext.plugin(ConviviumRemoteService, runtime);
            });
        }
    }
};

export async function apply(ctx: Context, config: ConfigType): Promise<void> {
    await ctx.plugin(meetingConsumerPlugin, config);
}
