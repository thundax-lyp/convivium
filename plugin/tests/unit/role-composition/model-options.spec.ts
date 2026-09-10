import { describe, expect, it } from "vitest";
import { parseAgentModelOverrides } from "@/role-composition/model-options.js";
import { roleCompositionDefinitions } from "../../fixtures/role-composition.js";

describe("meeting role Host model overrides", () => {
    it("accepts omitted and empty maps as immutable maps with no inherited entries", () => {
        for (const value of [undefined, {}]) {
            const result = parseAgentModelOverrides(value, roleCompositionDefinitions);
            expect(Object.keys(result)).toEqual([]);
            expect(Object.getPrototypeOf(result)).toBeNull();
            expect(Object.isFrozen(result)).toBe(true);
        }
    });
    it("preserves prototype-named role IDs and snapshots caller-owned entries", () => {
        const definitions = ["__proto__", "constructor", "toString"].map((agentDefinitionId) => ({
            ...roleCompositionDefinitions[0],
            agentDefinitionId
        }));
        const input = Object.fromEntries(
            definitions.map((d) => [d.agentDefinitionId, { model: "original" }])
        );
        const result = parseAgentModelOverrides(input, definitions);
        expect(Object.keys(result)).toEqual(definitions.map((d) => d.agentDefinitionId));
        input.__proto__.model = "changed";
        expect(result.__proto__.model).toBe("original");
        expect(Object.isFrozen(result.__proto__)).toBe(true);
        expect(Object.isFrozen(result)).toBe(true);
    });
    it.each([
        null,
        [],
        "private",
        { unknown: { model: "private" } },
        { "fr14-manager": null },
        { "fr14-manager": {} },
        { "fr14-manager": { maxTokens: 1 } },
        { "fr14-manager": { model: " " } },
        { "fr14-manager": { provider: "" } },
        { "fr14-manager": { reasoningEffort: " " } },
        { "fr14-manager": { model: "private", apiKey: "secret" } }
    ])("rejects invalid or unbound overrides with a fixed error", (value) => {
        expect(() => parseAgentModelOverrides(value, roleCompositionDefinitions)).toThrow(
            expect.objectContaining({ message: "Invalid meeting agent model overrides." })
        );
    });
});
