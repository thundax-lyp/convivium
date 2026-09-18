import dshAgentPackage from "@deepseek-ai/dsh-agent/package.json" with { type: "json" };
import type { Context } from "@deepseek-ai/cordis";
import { randomUUID } from "node:crypto";
import type { Config } from "@/config.js";
import type { MeetingState } from "@/domain/index.js";
import {
    decodeMeetingStateV1,
    encodeMeetingStateV1
} from "@/repository/domain/meeting-state-codec-v1.js";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import {
    createMeetingCommandApplicationV1,
    type MeetingCommandApplicationV1
} from "./application-service/meeting-command-v1.js";
import { createMeetingCreationCoordinatorV1 } from "./meeting-runtime.js";
import { requireContinuableProvider } from "@/dsh/index.js";

const applications = new WeakMap<object, MeetingCommandApplicationV1>();

function assertTargetLifecycle(config: Config, ctx: Pick<Context, "subagents">): void {
    if (dshAgentPackage.version !== "0.1.2-rc.1")
        throw new Error("Convivium requires DSH version 0.1.2-rc.1.");
    requireContinuableProvider(ctx.subagents, config.provider);
    const spawn = ctx.subagents.getProvider("spawn");
    if (!spawn || spawn.name !== "spawn" || spawn.capabilities.outputSchema !== true)
        throw new Error('Convivium requires one-shot provider "spawn" with outputSchema.');
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
    const application = applications.get(owner);
    if (!application) throw new Error("Target Meeting application is not active.");
    return application;
}

export async function activateTargetMeetingApplicationV1(
    ctx: Context,
    config: Config
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
    applications.set(ctx, application);
    return async () => {
        applications.delete(ctx);
        await registry.close();
    };
}
