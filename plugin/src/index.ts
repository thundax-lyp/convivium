import type { Context } from "@deepseek-ai/cordis";
// Load the Cordis augmentation for ctx.webServer without a runtime import.
import type {} from "@deepseek-ai/dsh-host-webserver";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { WorkspaceId } from "@deepseek-ai/dsh-workspace";
import { Config, type Config as ConfigType } from "./config.js";
import { requireContinuableProvider, resolveMeetingCallerV1 } from "./dsh/index.js";
import { ConviviumRemoteService } from "./remote/index.js";
import {
    activateTargetMeetingApplicationV1,
    getLocalMeetingWebRuntimeV1,
    getMeetingCommandApplicationV1,
    ensureTargetMeetingDeliveryV1
} from "./runtime/index.js";
import { registerMeetingToolsV1 } from "./tools/index.js";

export { Config };
export { ConviviumRemoteService };
export type { Config as ConfigType } from "./config.js";

export const name = "convivium";

const meetingServices = [
    "agents",
    "sessions",
    "subagents",
    "systemPrompt",
    "tools",
    "webServer"
] as const;

export const inject = [] as const;

export function assertContinuableProvider(
    ctx: Pick<Context, "subagents">,
    providerName: string
): SubagentProvider {
    return requireContinuableProvider(ctx.subagents, providerName);
}

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
            assertContinuableProvider(ctx, config.provider);
            const disposeTarget = await activateTargetMeetingApplicationV1(ctx, config);
            ctx.effect(() => disposeTarget, "convivium:target-runtime");
            const runtime = getLocalMeetingWebRuntimeV1(ctx);
            const application = getMeetingCommandApplicationV1(ctx);
            (ctx as Context & { provide?: (name: string, value: unknown) => void }).provide?.(
                "conviviumMeetingRuntime",
                runtime
            );
            if (!new Set(["127.0.0.1", "localhost"]).has(ctx.webServer?.host ?? "")) return;
            registerMeetingToolsV1({
                registry: ctx.tools,
                application,
                callers: {
                    async resolve(agent, signal) {
                        const resolved = await resolveMeetingCallerV1(agent, runtime, signal);
                        if (resolved) return resolved;
                        return {
                            protocolVersion: 1,
                            ok: false,
                            code: "UNAUTHORIZED_CALLER",
                            message: "The caller is not an active meeting identity.",
                            retryable: false
                        };
                    }
                },
                onMeetingCreated(meetingId, parent) {
                    ensureTargetMeetingDeliveryV1(ctx, meetingId, parent);
                }
            });
            ctx.plugin(ConviviumRemoteService, runtime);
        }
    }
};

export async function apply(ctx: Context, config: ConfigType): Promise<void> {
    await ctx.plugin(meetingConsumerPlugin, config);
}
