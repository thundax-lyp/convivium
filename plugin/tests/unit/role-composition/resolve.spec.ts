import { describe, expect, it, vi } from "vitest";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import {
    resolveMeetingRoles,
    resolveDynamicMeetingDefinition
} from "@/role-composition/resolve.js";

const manager = {
    agentDefinitionId: "manager",
    definitionVersion: "2.0.0",
    roleDefinitionId: "meeting_manager",
    displayName: "Manager",
    summary: "Manage",
    agentInstructions: {
        roleDefinitionId: "meeting_manager",
        version: "2.0.0",
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
                { id: "participant", version: "2.0.0" },
                first.participants.__proto__.agentDefinition.definitionHash
            )
        ).toEqual({ kind: "rejected", code: "DEFINITION_VERSION_MISMATCH" });
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
                resolveDynamicMeetingDefinition(
                    definitions,
                    { id: "manager", version: "2.0.0" },
                    "a".repeat(64)
                )
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
        await expect(
            resolveMeetingRoles(
                {
                    definitions,
                    agentModelOverrides: { unknown: { model: "secret" } },
                    participants: []
                },
                validate
            )
        ).rejects.toThrow();
    });
    it("rejects duplicates and excessive configuration and freezes snapshots", () => {
        expect(() => parseAgentDefinitions([manager, manager])).toThrow();
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
