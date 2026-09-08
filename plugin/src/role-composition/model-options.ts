import type { AgentOptions } from "@deepseek-ai/dsh-agent";
import { z } from "zod";
import type { MeetingAgentDefinitionV1 } from "./model.js";

export type MeetingAgentModelOverrides = Readonly<
    Record<string, Readonly<Pick<AgentOptions, "provider" | "model" | "reasoningEffort">>>
>;

const text = z.string().refine((value) => value.trim().length > 0);
const options = z
    .strictObject({
        provider: text.optional(),
        model: text.optional(),
        reasoningEffort: z
            .custom<NonNullable<AgentOptions["reasoningEffort"]>>(
                (value) => typeof value === "string" && value.trim().length > 0
            )
            .optional()
    })
    .refine((value) => Object.values(value).some((item) => item !== undefined));

/** Snapshot Host-owned overrides without exposing private configuration in errors. */
export function parseAgentModelOverrides(
    value: unknown,
    definitions: readonly MeetingAgentDefinitionV1[]
): MeetingAgentModelOverrides {
    try {
        const input = value === undefined ? {} : value;
        if (input === null || typeof input !== "object" || Array.isArray(input))
            throw new TypeError();
        const entries = Object.entries(input);
        const ids = new Set(definitions.map((definition) => definition.agentDefinitionId));
        if (entries.length > 64 || entries.some(([id]) => !ids.has(id))) throw new TypeError();
        const result: Record<
            string,
            Readonly<Pick<AgentOptions, "provider" | "model" | "reasoningEffort">>
        > = Object.create(null);
        for (const [id, entry] of entries) result[id] = Object.freeze(options.parse(entry));
        return Object.freeze(result);
    } catch {
        throw new TypeError("Invalid meeting agent model overrides.");
    }
}
