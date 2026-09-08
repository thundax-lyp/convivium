import { parseAgentModelOverrides } from "./role-composition/model-options.js";
import type { MeetingAgentModelOverrides } from "./role-composition/model-options.js";
import Schema from "@deepseek-ai/schemastery";

import { parseAgentDefinitions } from "./role-composition/model.js";
import type { MeetingAgentDefinitionV1 } from "./role-composition/model.js";

export interface Config {
    provider: string;
    agentModelOverrides?: MeetingAgentModelOverrides;
    agentDefinitions?: readonly MeetingAgentDefinitionV1[];
    developerMarkdownWorkspaceId?: string;
    maxParticipants: number;
    speakerTimeoutMs: number;
    outboxPollMs: number;
}

const runtimeConfig: Schema<Config> = Schema.object({
    agentModelOverrides: Schema.any<MeetingAgentModelOverrides>(),
    agentDefinitions: Schema.any<readonly MeetingAgentDefinitionV1[]>(),
    provider: Schema.string().pattern(/\S/).required(),
    developerMarkdownWorkspaceId: Schema.string().pattern(/\S/),
    maxParticipants: Schema.natural().min(3).max(32).default(3),
    speakerTimeoutMs: Schema.natural().min(1).max(300_000).default(60_000),
    outboxPollMs: Schema.natural().min(1).max(60_000).default(1_000)
});

export const Config: Schema<Config> = Schema.transform(
    Schema.any<Config>(),
    (value) => {
        const definitions = parseAgentDefinitions(value?.agentDefinitions);
        const overrides = parseAgentModelOverrides(value?.agentModelOverrides, definitions);
        const config = runtimeConfig(value);
        return Object.freeze({
            ...config,
            ...(value?.agentDefinitions === undefined ? {} : { agentDefinitions: definitions }),
            ...(value?.agentModelOverrides === undefined ? {} : { agentModelOverrides: overrides })
        });
    },
    true
);
