import { foldSubagentDescriptor } from "@deepseek-ai/dsh-subagent";
import { roleSmokeDefinitions } from "../role-definitions.js";

export async function prepareRoleSmoke(ctx, phase) {
    roleSmokeDefinitions(phase);
    const presets = ctx.get("agentPresets");
    const skills = ctx.get("skills");
    if (!presets || !skills || !(await presets.resolve("minimal")))
        throw new Error("Role smoke requires minimal preset and skills.");
    let calls = 0;
    ctx.effect(() => {
        ctx.tools.register({
            name: "convivium_role_probe",
            description: "FR14 fixture tool",
            parameters: { type: "object", properties: {}, additionalProperties: false },
            output: {
                schema: {
                    type: "object",
                    properties: { ok: { type: "boolean" } },
                    required: ["ok"],
                    additionalProperties: false
                },
                render: () => [{ type: "text", text: "FR14 probe passed" }]
            },
            async execute() {
                calls++;
                return { ok: true };
            }
        });
        return skills.register({
            name: "fr14-fixture",
            description: "FR14 fixture",
            content: "FR14 fixture",
            source: "runtime",
            invocation: { modelInvocable: true, userInvocable: true }
        });
    });
    return {
        phase,
        get calls() {
            return calls;
        }
    };
}

export async function assertRoleSmoke(runtime, manager, participant) {
    const { assert, ctx, roleSmoke } = runtime;
    const managerDescriptor = foldSubagentDescriptor(manager.session.events);
    const participantDescriptor = foldSubagentDescriptor(participant.session.events);
    assert(managerDescriptor?.persona === "FR14_MANAGER_V1", "Manager descriptor persona changed");
    assert(
        participantDescriptor?.persona === "FR14_PARTICIPANT_V1",
        "Participant descriptor persona changed"
    );
    assert(managerDescriptor.toolFilter === undefined, "Manager filter changed");
    assert(
        JSON.stringify(participantDescriptor.toolFilter) ===
            JSON.stringify({ deny: ["convivium_role_probe"] }),
        "Participant descriptor filter changed"
    );
    for (const [agent, own, other] of [
        [manager, "FR14_MANAGER_V1", "FR14_PARTICIPANT_V1"],
        [participant, "FR14_PARTICIPANT_V1", "FR14_MANAGER_V1"]
    ]) {
        const assembly = await agent.ctx.systemPrompt.assemble({ scope: agent });
        const text = assembly.sections.map((section) => section.text).join("\n");
        assert(
            text.includes(own) &&
                !text.includes(other) &&
                !text.includes("FR14_MANAGER_V2") &&
                !text.includes("FR14_PARTICIPANT_V2"),
            "Role assembly is not isolated"
        );
    }
    const parent = runtime.captain.agent;
    const assembly = await parent.ctx.systemPrompt.assemble({ scope: parent });
    assert(
        !assembly.sections.some((s) => /FR14_(MANAGER|PARTICIPANT)_V[12]/.test(s.text)),
        "Parent persona was modified"
    );
    for (const [agent, allowed, identity] of [
        [participant, false, "participant"],
        [manager, true, "manager"],
        [parent, true, "captain"]
    ]) {
        assert(
            ctx.tools.schemas(agent).some((s) => s.name === "convivium_role_probe") === allowed,
            "Role tool visibility mismatch"
        );
        const before = roleSmoke.calls;
        const result = await ctx.tools.execute({
            callId: `fr14-${roleSmoke.phase}-${identity}`,
            name: "convivium_role_probe",
            arguments: {},
            agent,
            signal: new AbortController().signal
        });
        assert(result.isError === !allowed, "Role tool execution mismatch");
        assert(roleSmoke.calls === before + (allowed ? 1 : 0), "Denied tool body was reached");
    }
    return {
        managerPersona: managerDescriptor.persona,
        participantPersona: participantDescriptor.persona,
        deniedTool: "convivium_role_probe",
        deniedBodyCalls: 0
    };
}
