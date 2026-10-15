import { readFileSync } from "node:fs";
import { packagedDefinitionHashes } from "../../fixtures/role-composition.ts";
import { describe, expect, it, vi } from "vitest";
import { parseAgentDefinitions } from "@/role-composition/model.ts";
import {
    definitionHash,
    resolveMeetingRoles,
    resolveDynamicMeetingDefinition
} from "@/role-composition/resolve.ts";

const manager = {
    agentDefinitionId: "manager",

    roleDefinitionId: "meeting_manager",
    displayName: "Manager",
    summary: "Manage",
    agentInstructions: {
        roleDefinitionId: "meeting_manager",
        sha256: "a".repeat(64)
    },
    dshPresetId: "convivium-manager",
    requiredSkillNames: ["meeting-facilitation"],
    expertiseTags: ["meeting"],
    evidenceScopes: []
};
const participant = {
    ...manager,
    agentDefinitionId: "participant",
    roleDefinitionId: "domain_architect",
    displayName: "Participant",
    agentInstructions: { ...manager.agentInstructions, roleDefinitionId: "domain_architect" },
    requiredSkillNames: ["repository-analysis"],
    toolFilter: { deny: ["b", "a"] }
};
const resolve = (value: unknown) =>
    resolveMeetingRoles(
        {
            definitions: parseAgentDefinitions(value),
            participants: [{ participantKey: "__proto__", agentDefinitionId: "participant" }]
        },
        async () => {}
    );

describe("meeting role definitions", () => {
    it("keeps all packaged identity hashes when execution defaults change", () => {
        const input = JSON.parse(
            readFileSync(new URL("../../../config/definitions.json", import.meta.url), "utf8")
        ).definitions.filter((d: Record<string, string>) =>
            Object.hasOwn(packagedDefinitionHashes, d.agentDefinitionId)
        );
        const original = parseAgentDefinitions(input);
        expect(original).toHaveLength(7);
        for (const d of original) {
            expect(definitionHash(d)).toBe(packagedDefinitionHashes[d.agentDefinitionId]);
        }
        const selected = parseAgentDefinitions(
            input.map((d: Record<string, unknown>) => ({
                ...d,
                agentOptions: {
                    provider: "acp-codex",
                    model: "codex-model",
                    reasoningEffort: "high"
                }
            }))
        );
        for (const d of selected) {
            expect(definitionHash(d)).toBe(packagedDefinitionHashes[d.agentDefinitionId]);
        }
    });
    it("snapshots a trimmed complete execution selection without inheriting fields", () => {
        const input = {
            provider: " acp-codex ",
            model: " codex-model ",
            reasoningEffort: " high "
        };
        const [d] = parseAgentDefinitions([{ ...participant, agentOptions: input }]);
        input.model = "changed";
        expect(d.agentOptions).toEqual({
            provider: "acp-codex",
            model: "codex-model",
            reasoningEffort: "high"
        });
        expect(Object.isFrozen(d.agentOptions)).toBe(true);
        const [withoutReasoning] = parseAgentDefinitions([
            { ...participant, agentOptions: { provider: "host", model: "model" } }
        ]);
        expect(withoutReasoning.agentOptions).not.toHaveProperty("reasoningEffort");
    });
    it.each([
        {},
        { provider: "host" },
        { model: "model" },
        { provider: " ", model: "model" },
        { provider: "host", model: " " },
        { provider: "host", model: "model", reasoningEffort: " " },
        { provider: "host", model: "model", env: {} },
        { provider: "host", model: "model", maxTokens: 1 }
    ])("rejects incomplete or unsupported execution selection: %j", (agentOptions) => {
        expect(() => parseAgentDefinitions([{ ...participant, agentOptions }])).toThrow(
            "Invalid meeting agent definitions."
        );
    });
    it("accepts explicit identity references and snapshots the role without inline persona", async () => {
        const input = structuredClone(participant);
        const result = await resolve([input]);
        input.agentInstructions.sha256 = "b".repeat(64);
        expect(result.participants.__proto__.agentInstructions).toEqual(
            participant.agentInstructions
        );
        expect(result.participants.__proto__).not.toHaveProperty("persona");
        expect(Object.getPrototypeOf(result.participants)).toBeNull();
        expect(Object.isFrozen(result.participants.__proto__.agentInstructions)).toBe(true);
    });
    it("hashes canonical field and capability ordering while detecting resource changes", async () => {
        const first = await resolve([participant]);
        const second = await resolve([
            Object.fromEntries(
                Object.entries({ ...participant, toolFilter: { deny: ["a", "b"] } }).reverse()
            )
        ]);
        expect(second.participants.__proto__.agentDefinition).toEqual(
            first.participants.__proto__.agentDefinition
        );
        const changed = await resolve([
            {
                ...participant,
                agentInstructions: { ...participant.agentInstructions, sha256: "b".repeat(64) }
            }
        ]);
        expect(changed.participants.__proto__.agentDefinition.definitionHash).not.toBe(
            first.participants.__proto__.agentDefinition.definitionHash
        );
        const definitions = parseAgentDefinitions([
            {
                ...participant,
                agentInstructions: { ...participant.agentInstructions, sha256: "b".repeat(64) }
            }
        ]);
        expect(
            resolveDynamicMeetingDefinition(
                definitions,
                { id: "participant" },
                first.participants.__proto__.agentDefinition.definitionHash
            )
        ).toEqual({ kind: "rejected", code: "DEFINITION_HASH_MISMATCH" });
        expect(resolveDynamicMeetingDefinition(definitions, { id: "participant" }, "")).toEqual({
            kind: "rejected",
            code: "DEFINITION_HASH_MISMATCH"
        });
        expect(resolveDynamicMeetingDefinition(definitions, { id: "missing" }, "")).toEqual({
            kind: "rejected",
            code: "DEFINITION_NOT_FOUND"
        });
    });
    it.each([
        { roleDescription: "legacy" },
        { persona: "legacy" },
        { agentOptions: { model: "caller" } },
        { roleDefinitionId: "meeting_scribe" },
        { requiredSkillNames: ["unknown"] },
        { requiredSkillNames: ["github", "github"] },
        { toolFilter: {} },
        {
            agentInstructions: {
                ...participant.agentInstructions,
                roleDefinitionId: "meeting_manager"
            }
        },
        { agentInstructions: { ...participant.agentInstructions, sha256: "invalid" } },
        { agentInstructions: { ...participant.agentInstructions, version: "../escape" } }
    ])("rejects invalid identity and capability configuration: %j", (patch) => {
        expect(() => parseAgentDefinitions([{ ...participant, ...patch }])).toThrow(
            "Invalid meeting agent definitions."
        );
    });
    it("rejects both creation-only roles during dynamic admission", async () => {
        for (const role of ["meeting_manager", "verification_reviewer"]) {
            const d = {
                ...manager,
                roleDefinitionId: role,
                agentInstructions: { ...manager.agentInstructions, roleDefinitionId: role }
            };
            const definitions = parseAgentDefinitions([d]);
            expect(
                resolveDynamicMeetingDefinition(definitions, { id: "manager" }, "a".repeat(64))
            ).toEqual({ kind: "rejected", code: "ROLE_NOT_ALLOWED" });
        }
    });
    it("validates all selections before performing one preflight", async () => {
        const validate = vi.fn(async () => {});
        const definitions = parseAgentDefinitions([manager, participant]);
        await resolveMeetingRoles(
            {
                definitions,
                managerAgentDefinitionId: "manager",
                participants: [{ participantKey: "p", agentDefinitionId: "participant" }]
            },
            validate
        );
        expect(validate).toHaveBeenCalledTimes(1);
        validate.mockClear();
        await expect(
            resolveMeetingRoles(
                { definitions, managerAgentDefinitionId: "participant", participants: [] },
                validate
            )
        ).rejects.toThrow();
        expect(validate).not.toHaveBeenCalled();
    });
    it("resolves the Definition complete execution selection", async () => {
        const input = { provider: "acp-codex", model: "codex" };
        const result = await resolve([{ ...participant, agentOptions: input }]);
        expect(result.participants.__proto__.agentOptions).toEqual(input);
        expect(Object.isFrozen(result.participants.__proto__.agentOptions)).toBe(true);
    });
    it("rejects duplicates and excessive configuration and freezes snapshots", () => {
        expect(() => parseAgentDefinitions([manager, manager])).toThrow();
        expect(() =>
            parseAgentDefinitions([manager, { ...participant, displayName: manager.displayName }])
        ).toThrow("Invalid meeting agent definitions.");
        expect(() => parseAgentDefinitions([{ ...manager, summary: "x".repeat(16384) }])).toThrow();
        expect(() =>
            parseAgentDefinitions(
                Array.from({ length: 65 }, (_, i) => ({ ...manager, agentDefinitionId: String(i) }))
            )
        ).toThrow();
        expect(Object.isFrozen(parseAgentDefinitions(undefined))).toBe(true);
        const [d] = parseAgentDefinitions([participant]);
        expect(Object.isFrozen(d.toolFilter?.deny)).toBe(true);
    });
});
