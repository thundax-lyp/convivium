import { describe, expect, it } from "vitest";
import { resolveEffectiveAgentOptions } from "@/role-composition/model-options.ts";

describe("effective meeting model binding", () => {
    it("snapshots the complete Host selection only when Definition selection is omitted", () => {
        const host = { provider: "host", model: "original", reasoningEffort: "high" };
        const result = resolveEffectiveAgentOptions(host);
        host.model = "changed";
        expect(result).toEqual({ provider: "host", model: "original", reasoningEffort: "high" });
        expect(Object.isFrozen(result)).toBe(true);
    });
    it("uses the complete Definition selection without inheriting Host reasoning", () => {
        const explicit = { provider: "acp-codex", model: "codex" };
        const result = resolveEffectiveAgentOptions(
            { provider: "host", model: "host-model", reasoningEffort: "high" },
            explicit
        );
        explicit.model = "changed";
        expect(result).toEqual({ provider: "acp-codex", model: "codex" });
        expect(Object.isFrozen(result)).toBe(true);
    });
    it.each([{}, { provider: "host" }, { model: "model" }, { provider: " ", model: "model" }])(
        "rejects incomplete selection instead of merging it: %j",
        (invalid) => {
            expect(() =>
                resolveEffectiveAgentOptions(
                    { provider: "host", model: "model", reasoningEffort: "high" },
                    invalid
                )
            ).toThrow("Meeting model selection is unavailable.");
        }
    );
});
