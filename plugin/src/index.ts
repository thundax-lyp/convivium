import { resolve } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { WorkspaceId } from "@deepseek-ai/dsh-workspace";
import { Config, type Config as ConfigType } from "./config.js";
import { requireContinuableProvider, resolveMeetingCaller } from "./dsh/index.js";
import { registerLocalMeetingHttpRoutes } from "./http/index.js";
import { createCreateStatusRuntime } from "./runtime/index.js";
import { AGENT_CATALOG_SERVICE_KEY } from "./runtime/services/agent-catalog.js";
import { jsonlStoragePlugin } from "./storage/index.js";
import { registerCreateAndStatusTools, registerSubmitAndControlTools } from "./tools/index.js";

export { Config };
export type { Config as ConfigType } from "./config.js";

export const name = "convivium";

const meetingServices = [
    "agents",
    "sessions",
    "subagents",
    "systemPrompt",
    "tools",
    "workspaceRegistry",
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
    apply(ctx: Context, config: ConfigType): void {
        assertContinuableProvider(ctx, config.provider);
        if (
            typeof ctx.tools?.register !== "function" ||
            typeof ctx.subagents?.startContinuable !== "function" ||
            typeof ctx.subagents?.listChildren !== "function" ||
            typeof ctx.subagents?.interrupt !== "function" ||
            typeof ctx.subagents?.drainContinuableChildren !== "function"
        ) {
            return;
        }
        const agentCatalog = ctx.get(AGENT_CATALOG_SERVICE_KEY);
        const workspace =
            config.developerMarkdownWorkspaceId === undefined
                ? undefined
                : ctx.workspaceRegistry.get(config.developerMarkdownWorkspaceId as WorkspaceId);
        if (config.developerMarkdownWorkspaceId !== undefined && workspace === undefined)
            throw new Error(
                `Developer Markdown workspace is not registered: ${config.developerMarkdownWorkspaceId}`
            );
        const runtime = createCreateStatusRuntime({
            storageDomain: ctx.storageDomain,
            provider: config.provider,
            continuable: ctx.subagents,
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            maxParticipants: config.maxParticipants,
            outboxPollMs: config.outboxPollMs,
            speakerAttemptTimeoutMs: config.speakerTimeoutMs,
            agentCatalog,
            ...(workspace === undefined
                ? {}
                : {
                      developerMarkdown: {
                          workspaceRoot: workspace.path,
                          warn: (warning) =>
                              ctx
                                  .logger("convivium:developer-markdown")
                                  .warn("Developer Markdown projection failed %o", warning)
                      }
                  })
        });
        ctx.effect(() => () => runtime.dispose(), "convivium:runtime");
        if (ctx.webServer.host === "127.0.0.1") {
            ctx.effect(
                () => registerLocalMeetingHttpRoutes(ctx.webServer, runtime),
                "convivium:local-routes"
            );
        }
        const callers = {
            async resolve(agent: Parameters<typeof resolveMeetingCaller>[0], signal: AbortSignal) {
                const meetingCaller = await resolveMeetingCaller(agent, runtime, signal);
                if (!("ok" in meetingCaller)) return { ...meetingCaller, agent };
                // DSH's Agent registry is the host-verified boundary for a top-level
                // caller. An ownership lookup failure must never grant Captain access.
                if (
                    ctx.agents.get(String(agent.id) as never) === agent &&
                    agent.session.header.parentSession === undefined
                ) {
                    return { kind: "captain" as const, sessionId: String(agent.id), agent };
                }
                return meetingCaller;
            }
        };
        for (const dispose of [
            ...registerCreateAndStatusTools({ registry: ctx.tools, runtime, callers }),
            ...registerSubmitAndControlTools({ registry: ctx.tools, runtime, callers })
        ]) {
            ctx.effect(() => dispose, "convivium:tool");
        }
    }
};

export async function apply(ctx: Context, config: ConfigType): Promise<void> {
    await ctx.plugin(jsonlStoragePlugin, {
        root: resolve(process.cwd(), config.dataRoot ?? ".convivium", "storage")
    });
    await ctx.plugin(meetingConsumerPlugin, config);
}
