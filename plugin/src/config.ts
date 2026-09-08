import Schema from "@deepseek-ai/schemastery";

import { parseAgentDefinitions } from "./role-composition/model.js";
import type { MeetingAgentDefinitionV1 } from "./role-composition/model.js";

export interface Config {
    provider: string;
    agentDefinitions?: readonly MeetingAgentDefinitionV1[];
    developerMarkdownWorkspaceId?: string;
    maxParticipants: number;
    speakerTimeoutMs: number;
    outboxPollMs: number;
}

const runtimeConfig: Schema<Config> = Schema.object({
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
        const config = runtimeConfig(value);
        return value?.agentDefinitions === undefined
            ? config
            : { ...config, agentDefinitions: definitions };
    },
    true
);
