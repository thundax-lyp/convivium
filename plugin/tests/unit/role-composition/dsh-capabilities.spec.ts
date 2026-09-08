import { describe, expect, it, vi } from "vitest";
import { validateSharedRoleCapabilities } from "@/role-composition/dsh-capabilities.js";
import { parseAgentDefinitions } from "@/role-composition/model.js";

const definitions = parseAgentDefinitions([
    {
        agentDefinitionId: "a",
        definitionVersion: "1",
        roleDefinitionId: "meeting_manager",
        displayName: "A",
        summary: "A",
        roleDescription: "A",
        dshPresetId: "minimal",
        requiredSkillNames: ["fixture"],
        expertiseTags: ["fixture"],
        evidenceScopes: []
    }
]);
const skill = {
    name: "fixture",
    content: "body",
    invocation: { modelInvocable: true, userInvocable: true }
};
function fixture() {
    const presets = { composedPreset: vi.fn(() => "minimal") };
    const skills = { get: vi.fn(async () => skill) };
    const parent = {
        ctx: { get: vi.fn((key: string) => (key === "agentPresets" ? presets : skills)) },
        session: { header: { cwd: "/fixture" } }
    };
    return { parent, presets, skills, signal: new AbortController().signal };
}
describe("shared role capabilities", () => {
    it("checks the exact parent scope and cwd with deduplicated skill names", async () => {
        const f = fixture();
        await validateSharedRoleCapabilities(f.parent, [...definitions, ...definitions], f.signal);
        expect(f.presets.composedPreset).toHaveBeenNthCalledWith(1, f.parent.ctx);
        expect(f.presets.composedPreset).toHaveBeenCalledTimes(2);
        expect(f.skills.get).toHaveBeenCalledExactlyOnceWith("fixture", {
            scope: f.parent,
            cwd: "/fixture",
            signal: f.signal
        });
    });
    it("skips all services for empty selection", async () => {
        const f = fixture();
        await validateSharedRoleCapabilities(f.parent, [], f.signal);
        expect(f.parent.ctx.get).not.toHaveBeenCalled();
    });
    it("rejects absent services and mismatched or absent presets", async () => {
        for (const key of ["agentPresets", "skills"]) {
            const f = fixture();
            f.parent.ctx.get.mockImplementation((name) =>
                name === key ? undefined : name === "agentPresets" ? f.presets : f.skills
            );
            await expect(
                validateSharedRoleCapabilities(f.parent, definitions, f.signal)
            ).rejects.toMatchObject({
                code: "UNSUPPORTED_CAPABILITY",
                message: "Meeting role composition is unavailable."
            });
        }
        for (const preset of ["", "other"]) {
            const f = fixture();
            f.presets.composedPreset.mockReturnValue(preset);
            await expect(
                validateSharedRoleCapabilities(f.parent, definitions, f.signal)
            ).rejects.toThrow();
            expect(f.skills.get).not.toHaveBeenCalled();
        }
    });
    it("rejects unavailable, non-model, empty, throwing or changed capabilities safely", async () => {
        for (const result of [
            undefined,
            { ...skill, content: " " },
            { ...skill, invocation: { modelInvocable: false, userInvocable: true } }
        ]) {
            const f = fixture();
            f.skills.get.mockResolvedValue(result);
            await expect(
                validateSharedRoleCapabilities(f.parent, definitions, f.signal)
            ).rejects.toThrow("Meeting role composition is unavailable.");
        }
        const f = fixture();
        f.skills.get.mockRejectedValue(new Error("secret"));
        await expect(
            validateSharedRoleCapabilities(f.parent, definitions, f.signal)
        ).rejects.toThrow("Meeting role composition is unavailable.");
        const changed = fixture();
        changed.presets.composedPreset.mockReturnValueOnce("minimal").mockReturnValue("other");
        await expect(
            validateSharedRoleCapabilities(changed.parent, definitions, changed.signal)
        ).rejects.toThrow();
    });
    it("preserves cancellation before and during lookup", async () => {
        for (const before of [true, false]) {
            const f = fixture();
            const controller = new AbortController();
            const reason = new Error("cancelled");
            if (before) controller.abort(reason);
            else
                f.skills.get.mockImplementation(async () => {
                    controller.abort(reason);
                    return skill;
                });
            await expect(
                validateSharedRoleCapabilities(f.parent, definitions, controller.signal)
            ).rejects.toBe(reason);
            if (before) expect(f.skills.get).not.toHaveBeenCalled();
        }
    });
});
