import { parseAgentDefinitions } from "./role-composition/model.js";
import type { Context } from "@deepseek-ai/cordis";
// Load the Cordis augmentation for ctx.webServer without a runtime import.
import type {} from "@deepseek-ai/dsh-host-webserver";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { WorkspaceId } from "@deepseek-ai/dsh-workspace";
import { randomUUID } from "node:crypto";
import dshAgentPackage from "@deepseek-ai/dsh-agent/package.json" with { type: "json" };
import { Config, type Config as ConfigType } from "./config.js";
import { requireContinuableProvider, resolveMeetingCaller } from "./dsh/index.js";
import { decodeMeetingStateV1, encodeMeetingStateV1 } from "./protocol/index.js";
import type { MeetingState } from "./domain/index.js";
import { DomainRepositoryRegistry } from "./repository/domain/domain-repository-registry.js";
import { ConviviumRemoteService } from "./remote/index.js";
import {
    createCreateStatusRuntime,
    createMeetingCommandApplicationV1,
    createMeetingCreationCoordinatorV1,
    AGENT_CATALOG_SERVICE_KEY,
    type MeetingCommandApplicationV1
} from "./runtime/index.js";
import { registerCreateAndStatusTools, registerSubmitAndControlTools } from "./tools/index.js";

export { Config };
export { ConviviumRemoteService };
export type { Config as ConfigType } from "./config.js";

export const name = "convivium";

const meetingServices = ["agents", "sessions", "subagents", "systemPrompt", "tools"] as const;
const targetApplications = new WeakMap<object, MeetingCommandApplicationV1>();

export const inject = [] as const;

export function assertContinuableProvider(
    ctx: Pick<Context, "subagents">,
    providerName: string
): SubagentProvider {
    return requireContinuableProvider(ctx.subagents, providerName);
}

function assertTargetLifecycle(config: ConfigType, ctx: Pick<Context, "subagents">): void {
    if (dshAgentPackage.version !== "0.1.2-rc.1")
        throw new Error("Convivium requires DSH version 0.1.2-rc.1.");
    const continuable = requireContinuableProvider(ctx.subagents, config.provider);
    const spawn = ctx.subagents.getProvider("spawn");
    if (!spawn || spawn.name !== "spawn" || spawn.capabilities.outputSchema !== true)
        throw new Error('Convivium requires one-shot provider "spawn" with outputSchema.');
    if (!continuable) throw new Error("Convivium continuable provider is unavailable.");
    const definitions = parseAgentDefinitions(config.agentDefinitions);
    const expected = new Set([
        "meeting_manager",
        "domain_architect",
        "runtime_engineer",
        "protocol_ui_engineer",
        "verification_reviewer",
        "github_research_analyst",
        "arxiv_research_analyst",
        "web_research_analyst"
    ]);
    if (
        definitions.length !== 8 ||
        new Set(definitions.map((item) => item.roleDefinitionId)).size !== 8 ||
        definitions.some((item) => !expected.has(item.roleDefinitionId))
    )
        throw new Error("Convivium requires the exact eight Meeting role definitions.");
}

export function getMeetingCommandApplicationV1(owner: object): MeetingCommandApplicationV1 {
    const application = targetApplications.get(owner);
    if (!application) throw new Error("Target Meeting application is not active.");
    return application;
}

export async function activateTargetMeetingApplicationV1(
    ctx: Context,
    config: ConfigType
): Promise<() => Promise<void>> {
    assertTargetLifecycle(config, ctx);
    let sequence = 0;
    const registry = await DomainRepositoryRegistry.open<MeetingState>({
        storageDomain: ctx.storageDomain,
        codec: { encode: encodeMeetingStateV1, decode: decodeMeetingStateV1 },
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        }
    });
    const ids = { nextId: (kind: string) => `${kind}-${++sequence}-${randomUUID()}` };
    const application = createMeetingCommandApplicationV1({
        registry,
        ids,
        clock: { now: Date.now },
        resolveCallerScope: async () => undefined,
        creation: createMeetingCreationCoordinatorV1({
            registry,
            definitions: parseAgentDefinitions(config.agentDefinitions),
            agentModelOverrides: config.agentModelOverrides,
            continuable: ctx.subagents,
            provider: config.provider,
            ids
        })
    });
    targetApplications.set(ctx, application);
    return async () => {
        targetApplications.delete(ctx);
        await registry.close();
    };
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
            const agentCatalog = ctx.get(AGENT_CATALOG_SERVICE_KEY);
            let workspace: { path: string } | undefined;
            if (config.developerMarkdownWorkspaceId !== undefined) {
                const workspaceRegistry = ctx.get("workspaceRegistry");
                if (workspaceRegistry === undefined)
                    throw new Error("Developer Markdown workspace service is unavailable");
                workspace = workspaceRegistry.get(
                    config.developerMarkdownWorkspaceId as WorkspaceId
                );
                if (workspace === undefined)
                    throw new Error(
                        `Developer Markdown workspace is not registered: ${config.developerMarkdownWorkspaceId}`
                    );
            }
            const activeMeetings = new Map<string, number>();
            const waitingMeetings = new Set<string>();
            const runtime = createCreateStatusRuntime({
                agentDefinitions: parseAgentDefinitions(config.agentDefinitions),
                agentModelOverrides: config.agentModelOverrides,
                storageDomain: ctx.storageDomain,
                provider: config.provider,
                onDiagnostic: (record) => {
                    if (record.metrics.activeMeeting === 0) activeMeetings.delete(record.meetingId);
                    else if (record.metrics.activeMeeting !== undefined)
                        activeMeetings.set(record.meetingId, record.metrics.activeMeeting);
                    if (record.metrics.waitingMeeting === 0)
                        waitingMeetings.delete(record.meetingId);
                    else if (record.metrics.waitingMeeting === 1)
                        waitingMeetings.add(record.meetingId);
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
            ctx.inject(["webServer", "typertGateway", "typert"], (webContext) => {
                if (webContext.webServer.host !== "127.0.0.1") return;
                webContext.plugin(ConviviumRemoteService, runtime);
            });
            const callers = {
                async resolve(
                    agent: Parameters<typeof resolveMeetingCaller>[0],
                    signal: AbortSignal
                ) {
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
    }
};

export async function apply(ctx: Context, config: ConfigType): Promise<void> {
    await ctx.plugin(meetingConsumerPlugin, config);
}
