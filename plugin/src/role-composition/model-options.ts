import { z } from "zod";
import type { EffectiveAgentOptions } from "./model.ts";

const text = z.string().trim().min(1);
export const resolveEffectiveAgentOptions = (
    selection: Partial<EffectiveAgentOptions>,
    explicit?: Partial<EffectiveAgentOptions>
): EffectiveAgentOptions => {
    try {
        return Object.freeze(
            z
                .strictObject({ provider: text, model: text, reasoningEffort: text.optional() })
                .parse(explicit ?? selection)
        );
    } catch {
        throw new TypeError("Meeting model selection is unavailable.");
    }
};
