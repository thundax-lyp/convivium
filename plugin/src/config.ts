import { accessSync, constants, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import Schema from "@deepseek-ai/schemastery";

import { contributorRoleDefinitionIds, parseAgentDefinitions } from "./role-composition/index.ts";
import type {
    ContributorRoleDefinitionId,
    MeetingAgentDefinition
} from "./role-composition/index.ts";

export interface Config {
    provider: string;
    acpCodex?: Readonly<{ command: string; args: readonly string[] }>;
    agentDefinitions?: readonly MeetingAgentDefinition[];
    initialContributorRoleIds: readonly ContributorRoleDefinitionId[];
    developerMarkdownWorkspaceId?: string;
    maxParticipants: number;
    speakerTimeoutMs: number;
    outboxPollMs: number;
}

const runtimeConfig: Schema<Config> = Schema.object({
    acpCodex: Schema.any<Config["acpCodex"]>(),
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
        ) {
            throw new TypeError("Invalid initial Meeting contributor roles.");
        }
        const definitions = parseAgentDefinitions(value?.agentDefinitions);
        if (Object.keys(value).some((key) => !Object.hasOwn(runtimeConfig.dict!, key))) {
            throw new TypeError("Unknown Convivium configuration field.");
        }
        let acpCodex: Config["acpCodex"];
        if (value.acpCodex !== undefined) {
            try {
                const parsed = z
                    .strictObject({
                        command: z.string().refine(isAbsolute),
                        args: z.array(z.string())
                    })
                    .parse(value.acpCodex);
                accessSync(parsed.command, constants.X_OK);
                if (!statSync(parsed.command).isFile()) {
                    throw new TypeError();
                }
                acpCodex = Object.freeze({ ...parsed, args: Object.freeze(parsed.args) });
            } catch {
                throw new TypeError("Invalid ACP Codex configuration.");
            }
        }
        const config = runtimeConfig(value);
        return Object.freeze({
            ...config,
            initialContributorRoleIds: Object.freeze([...roleIds]),
            ...(value?.agentDefinitions === undefined ? {} : { agentDefinitions: definitions }),
            ...(acpCodex === undefined ? {} : { acpCodex })
        });
    },
    true
);
