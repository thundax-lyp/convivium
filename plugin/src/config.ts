import { parseAgentModelOverrides } from "./role-composition/model-options.js";
import type { MeetingAgentModelOverrides } from "./role-composition/model-options.js";
import Schema from "@deepseek-ai/schemastery";

import { contributorRoleDefinitionIds, parseAgentDefinitions } from "./role-composition/model.js";
import type {
    ContributorRoleDefinitionId,
    MeetingAgentDefinition
} from "./role-composition/model.js";

export interface Config {
    provider: string;
    agentModelOverrides?: MeetingAgentModelOverrides;
    agentDefinitions?: readonly MeetingAgentDefinition[];
    initialContributorRoleIds: readonly ContributorRoleDefinitionId[];
    developerMarkdownWorkspaceId?: string;
    maxParticipants: number;
    speakerTimeoutMs: number;
    outboxPollMs: number;
}

const runtimeConfig: Schema<Config> = Schema.object({
    agentModelOverrides: Schema.any<MeetingAgentModelOverrides>(),
    agentDefinitions: Schema.any<readonly MeetingAgentDefinition[]>(),
    initialContributorRoleIds: Schema.any<readonly ContributorRoleDefinitionId[]>().required(),
    provider: Schema.string().pattern(/\S/).required(),
    developerMarkdownWorkspaceId: Schema.string().pattern(/\S/),
    maxParticipants: Schema.natural().min(3).max(32).default(3),
    speakerTimeoutMs: Schema.natural()
        .min(1)
        .max(60 * 60_000)
        .default(10 * 60_000),
    outboxPollMs: Schema.natural().min(1).max(60_000).default(1_000)
});

export const Config: Schema<Config> = Schema.transform(
    Schema.any<Config>(),
    (value) => {
        const roleIds = value?.initialContributorRoleIds;
        if (
            !Array.isArray(roleIds) ||
            roleIds.length === 0 ||
            roleIds.length > contributorRoleDefinitionIds.length ||
            new Set(roleIds).size !== roleIds.length ||
            roleIds.some((id) => !contributorRoleDefinitionIds.includes(id))
        )
            throw new TypeError("Invalid initial Meeting contributor roles.");
        const definitions = parseAgentDefinitions(value?.agentDefinitions);
        const overrides = parseAgentModelOverrides(value?.agentModelOverrides, definitions);
        const config = runtimeConfig(value);
        return Object.freeze({
            ...config,
            initialContributorRoleIds: Object.freeze([...roleIds]),
            ...(value?.agentDefinitions === undefined ? {} : { agentDefinitions: definitions }),
            ...(value?.agentModelOverrides === undefined ? {} : { agentModelOverrides: overrides })
        });
    },
    true
);
