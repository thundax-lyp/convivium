import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import { resolveMeetingRoles, RoleCompositionError } from "@/role-composition/resolve.js";

const skillInstruction =
    "\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：fixture。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。";

const manager = {
    agentDefinitionId: "manager",
    definitionVersion: "1",
    roleDefinitionId: "meeting_manager",
    displayName: "Manager",
    summary: "Manage",
    roleDescription: "Manager persona",
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
    it("snapshots Host model overrides without changing role provenance", async () => {
        const options = { model: "model-a", provider: "provider-a", reasoningEffort: "high" };
        const resolve = async (agentOptions: {
            provider?: string;
            model?: string;
            reasoningEffort?: string;
        }) =>
            resolveMeetingRoles(
                {
                    definitions: definitions(),
                    agentModelOverrides: { manager: agentOptions },
                    managerAgentDefinitionId: "manager",
                    participants: []
                },
                async () => {}
            );
        const original = await resolve(options);
        const reordered = await resolve(Object.fromEntries(Object.entries(options).reverse()));
        expect(original.manager?.agentOptions).toEqual(options);
        expect(Object.isFrozen(original.manager?.agentOptions)).toBe(true);
        expect(reordered.manager?.agentDefinition).toEqual(original.manager?.agentDefinition);
        options.model = "model-b";
        const changed = await resolve(options);
        expect(original.manager?.agentOptions?.model).toBe("model-a");
        expect(changed.manager?.agentDefinition.definitionHash).toBe(
            original.manager?.agentDefinition.definitionHash
        );
    });
    it("rejects legacy Definition agentOptions without leaking configuration", () => {
        expect(() =>
            parseAgentDefinitions([{ ...manager, agentOptions: { model: "legacy" } }])
        ).toThrow("Invalid meeting agent definitions.");
    });
    it("derives persona, leaves defaults to DSH and hashes role text changes", async () => {
        const resolve = (roleDescription: string) =>
            resolveMeetingRoles(
                {
                    definitions: parseAgentDefinitions([{ ...manager, roleDescription }]),
                    managerAgentDefinitionId: "manager",
                    participants: []
                },
                async () => {}
            );
        const original = await resolve(manager.roleDescription);
        const changed = await resolve("Changed responsibility");
        expect(original.manager?.persona).toBe(manager.roleDescription + skillInstruction);
        expect(original.manager).not.toHaveProperty("agentOptions");
        expect(changed.manager?.agentDefinition.definitionHash).not.toBe(
            original.manager?.agentDefinition.definitionHash
        );
        expect(() => parseAgentDefinitions([{ ...manager, persona: "legacy" }])).toThrow(
            "Invalid meeting agent definitions."
        );
    });
    it("rejects invalid direct-call overrides before capability checks even without selections", async () => {
        for (const agentModelOverrides of [
            { unknown: { model: "private" } },
            { manager: { model: " " } }
        ]) {
            const validate = vi.fn();
            await expect(
                resolveMeetingRoles(
                    { definitions: definitions(), agentModelOverrides, participants: [] },
                    validate
                )
            ).rejects.toThrow("Meeting role composition is unavailable.");
            expect(validate).not.toHaveBeenCalled();
        }
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
            [{ ...manager, roleDescription: "{{secret}}" }],
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
        const base = { ...manager, roleDescription: "" };
        const remaining = 16384 - Buffer.byteLength(JSON.stringify(base));
        const boundary = { ...base, roleDescription: "x".repeat(remaining) };
        expect(parseAgentDefinitions([boundary])).toHaveLength(1);
        expect(() =>
            parseAgentDefinitions([
                { ...boundary, roleDescription: boundary.roleDescription + "中" }
            ])
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
                mutable[0].roleDescription = "changed";
            }
        );
        const result = await pending;
        expect(result.participants.a.persona).toBe(participant.roleDescription + skillInstruction);
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
