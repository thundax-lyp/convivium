import { parseAgentDefinitions } from "./role-composition/model.js";
import { resolve } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { WorkspaceId } from "@deepseek-ai/dsh-workspace";
import { Config, type Config as ConfigType } from "./config.js";
import { requireContinuableProvider, resolveMeetingCaller } from "./dsh/index.js";
import { registerLocalMeetingHttpRoutes } from "./http/index.js";
import { createCreateStatusRuntime, AGENT_CATALOG_SERVICE_KEY } from "./runtime/index.js";
import { jsonlStoragePlugin } from "./storage/index.js";
import { registerCreateAndStatusTools, registerSubmitAndControlTools } from "./tools/index.js";

export { Config };
export type { Config as ConfigType } from "./config.js";

export const name = "convivium";

const meetingServices = ["agents", "sessions", "subagents", "systemPrompt", "tools"] as const;

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
        const agentCatalog = ctx.get(AGENT_CATALOG_SERVICE_KEY);
        let workspace: { path: string } | undefined;
        if (config.developerMarkdownWorkspaceId !== undefined) {
            const workspaceRegistry = ctx.get("workspaceRegistry");
            if (workspaceRegistry === undefined)
                throw new Error("Developer Markdown workspace service is unavailable");
            workspace = workspaceRegistry.get(config.developerMarkdownWorkspaceId as WorkspaceId);
            if (workspace === undefined)
                throw new Error(
                    `Developer Markdown workspace is not registered: ${config.developerMarkdownWorkspaceId}`
                );
        }
        const activeMeetings = new Map<string, number>();
        const waitingMeetings = new Set<string>();
        const runtime = createCreateStatusRuntime({
            agentDefinitions: parseAgentDefinitions(config.agentDefinitions),
            storageDomain: ctx.storageDomain,
            provider: config.provider,
            onDiagnostic: (record) => {
                if (record.metrics.activeMeeting === 0) activeMeetings.delete(record.meetingId);
                else if (record.metrics.activeMeeting !== undefined)
                    activeMeetings.set(record.meetingId, record.metrics.activeMeeting);
                if (record.metrics.waitingMeeting === 0) waitingMeetings.delete(record.meetingId);
                else if (record.metrics.waitingMeeting === 1) waitingMeetings.add(record.meetingId);
                ctx.logger("convivium:meeting").info("Meeting diagnostic %o", {
                    ...record,
                    metrics: {
                        ...record.metrics,
                        waitingMeetings: waitingMeetings.size,
                        activeMeetings: [...activeMeetings.values()].reduce(
                            (sum, value) => sum + value,
                            0
                        )
                    }
                });
            },
            continuable: ctx.subagents,
            getCaptainParent: (sessionId) => ctx.agents.get(sessionId as never),
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
        ctx.inject(["webServer"], (webContext) => {
            if (webContext.webServer.host !== "127.0.0.1") return;
            webContext.effect(
                () => registerLocalMeetingHttpRoutes(webContext.webServer, runtime),
                "convivium:local-routes"
            );
        });
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
        registerCreateAndStatusTools({ registry: ctx.tools, runtime, callers });
        registerSubmitAndControlTools({ registry: ctx.tools, runtime, callers });
    }
};

export async function apply(ctx: Context, config: ConfigType): Promise<void> {
    await ctx.plugin(jsonlStoragePlugin, {
        root: resolve(process.cwd(), config.dataRoot ?? ".convivium", "storage")
    });
    await ctx.plugin(meetingConsumerPlugin, config);
}
