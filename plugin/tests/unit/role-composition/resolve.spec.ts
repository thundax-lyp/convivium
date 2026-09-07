import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseAgentDefinitions } from "../../../src/role-composition/model.js";
import {
    resolveMeetingRoles,
    RoleCompositionError
} from "../../../src/role-composition/resolve.js";

const manager = {
    agentDefinitionId: "manager",
    definitionVersion: "1",
    roleDefinitionId: "meeting_manager",
    displayName: "Manager",
    summary: "Manage",
    persona: "Manager persona",
    dshPresetId: "minimal",
    requiredSkillNames: ["fixture"],
    expertiseTags: ["fixture"],
    evidenceScopes: []
};
const participant = {
    ...manager,
    agentDefinitionId: "participant",
    roleDefinitionId: "domain_architect",
    toolFilter: { allow: ["a"], deny: ["b"] }
};
const definitions = () => parseAgentDefinitions([manager, participant]);

describe("role composition configuration and resolution", () => {
    it("resolves two roles in one preflight with stable canonical hashes and frozen data", async () => {
        const validate = vi.fn(async () => {});
        const result = await resolveMeetingRoles(
            {
                definitions: definitions(),
                managerAgentDefinitionId: "manager",
                participants: [{ participantKey: "__proto__", agentDefinitionId: "participant" }]
            },
            validate
        );
        expect(validate).toHaveBeenCalledTimes(1);
        expect(validate.mock.calls[0]).toEqual([definitions()]);
        expect(result.manager?.agentDefinition.definitionHash).toBe(
            createHash("sha256").update(JSON.stringify(manager)).digest("hex")
        );
        expect(Object.getPrototypeOf(result.participants)).toBeNull();
        expect(result.participants.__proto__.toolFilter).toEqual(participant.toolFilter);
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.participants.__proto__.toolFilter?.allow)).toBe(true);
        expect(Object.isFrozen(result.manager?.agentDefinition)).toBe(true);
    });
    it("does not validate capabilities without selections", async () => {
        const validate = vi.fn();
        expect(
            await resolveMeetingRoles(
                { definitions: [], participants: [{ participantKey: "a" }] },
                validate
            )
        ).toEqual({ participants: {} });
        expect(validate).not.toHaveBeenCalled();
        expect(Object.isFrozen(parseAgentDefinitions(undefined))).toBe(true);
    });
    it("rejects all invalid selections before calling capability validation", async () => {
        for (const id of ["", "   ", "missing", "participant"]) {
            const validate = vi.fn();
            await expect(
                resolveMeetingRoles(
                    { definitions: definitions(), managerAgentDefinitionId: id, participants: [] },
                    validate
                )
            ).rejects.toThrow(RoleCompositionError);
            expect(validate).not.toHaveBeenCalled();
        }
        for (const id of ["", " ", "missing", "manager"]) {
            const validate = vi.fn();
            await expect(
                resolveMeetingRoles(
                    {
                        definitions: definitions(),
                        managerAgentDefinitionId: "manager",
                        participants: [{ participantKey: "a", agentDefinitionId: id }]
                    },
                    validate
                )
            ).rejects.toThrow("Meeting role composition is unavailable.");
            expect(validate).not.toHaveBeenCalled();
        }
    });
    it("strictly rejects invalid configuration without including the persona in errors", () => {
        for (const value of [
            null,
            {},
            [null],
            [manager, manager],
            [{ ...manager, extra: true }],
            [{ ...manager, persona: "{{secret}}" }],
            [{ ...manager, summary: " " }],
            [{ ...manager, requiredSkillNames: [] }],
            [{ ...manager, requiredSkillNames: ["x", "x"] }],
            [{ ...manager, expertiseTags: [] }],
            [{ ...manager, evidenceScopes: ["web", "web"] }],
            [{ ...manager, evidenceScopes: ["other"] }],
            [{ ...manager, toolFilter: {} }],
            [{ ...manager, toolFilter: null }],
            [{ ...manager, toolFilter: { allow: [""] } }],
            [{ ...manager, toolFilter: { allow: ["a", "a"] } }],
            [{ ...manager, toolFilter: { other: [] } }]
        ]) {
            expect(() => parseAgentDefinitions(value)).toThrow(
                "Invalid meeting agent definitions."
            );
        }
    });
    it("enforces exact 64 item and 16 KiB UTF-8 boundaries", () => {
        const items = Array.from({ length: 64 }, (_, i) => ({
            ...manager,
            agentDefinitionId: String(i)
        }));
        expect(parseAgentDefinitions(items)).toHaveLength(64);
        expect(() =>
            parseAgentDefinitions([...items, { ...manager, agentDefinitionId: "64" }])
        ).toThrow();
        const base = { ...manager, persona: "" };
        const remaining = 16384 - Buffer.byteLength(JSON.stringify(base));
        const boundary = { ...base, persona: "x".repeat(remaining) };
        expect(parseAgentDefinitions([boundary])).toHaveLength(1);
        expect(() =>
            parseAgentDefinitions([{ ...boundary, persona: boundary.persona + "中" }])
        ).toThrow();
    });
    it("snapshots before asynchronous validation and hashes independent of input key order", async () => {
        const input = [structuredClone(participant)];
        const parsed = parseAgentDefinitions(input);
        input[0].toolFilter.deny.push("changed");
        expect(parsed[0].toolFilter?.deny).toEqual(["b"]);
        const mutable = structuredClone([...parsed]);
        const pending = resolveMeetingRoles(
            {
                definitions: mutable,
                participants: [{ participantKey: "a", agentDefinitionId: "participant" }]
            },
            async () => {
                mutable[0].persona = "changed";
            }
        );
        const result = await pending;
        expect(result.participants.a.persona).toBe(participant.persona);
        const reversed = parseAgentDefinitions([
            Object.fromEntries(Object.entries(participant).reverse())
        ]);
        const other = await resolveMeetingRoles(
            {
                definitions: reversed,
                participants: [{ participantKey: "a", agentDefinitionId: "participant" }]
            },
            async () => {}
        );
        expect(other.participants.a.agentDefinition).toEqual(result.participants.a.agentDefinition);
    });
});
