export async function runIdentityAdmissionScenario(runtime) {
    const { ctx, assert, writeResult } = runtime;
    const manager = runtime.captain.agent;
    const skills = manager.ctx.get("skills");
    const nativeSkill = skills
        ? await skills.get("verification-review", {
              scope: manager,
              cwd: manager.session.header.cwd,
              signal: new AbortController().signal
          })
        : undefined;
    assert(
        nativeSkill?.invocation?.modelInvocable === true && nativeSkill.content.trim().length > 0,
        "required native Skill did not load through Host Loader"
    );
    const catalog = {
        protocolVersion: 1,
        meetingId: "smoke-identity-meeting",
        catalogId: "smoke-catalog",
        catalogVersion: "1",
        generatedAt: Date.now(),
        candidates: [
            {
                candidateId: "candidate-admit",
                definition: { id: "domain_architect", version: "1.0.0" },
                definitionHash: "a".repeat(64),
                displayName: "Architect",
                availability: "available",
                meetingRoles: ["contributor"],
                responsibilitySummary: "证据",
                capabilitySummary: [{ kind: "skill", label: "verification-review" }],
                suitability: [{ scope: "agenda-1", rationale: "匹配" }]
            },
            {
                candidateId: "candidate-reject",
                definition: { id: "runtime_engineer", version: "1.0.0" },
                definitionHash: "b".repeat(64),
                displayName: "Engineer",
                availability: "available",
                meetingRoles: ["contributor"],
                responsibilitySummary: "运行时",
                capabilitySummary: [{ kind: "skill", label: "verification-review" }],
                suitability: [{ scope: "agenda-1", rationale: "不匹配" }]
            }
        ]
    };
    const admitted = await ctx.subagents.startContinuable({
        provider: "spawn",
        label: "identity:candidate-admit",
        childId: "smoke-identity-admit",
        request: {
            parent: manager,
            prompt: [{ type: "text", text: "identity admission smoke candidate-admit" }]
        },
        signal: new AbortController().signal
    });
    assert(
        admitted.childId === "smoke-identity-admit" &&
            catalog.candidates[1].candidateId === "candidate-reject",
        "identity candidate decision evidence is inconsistent"
    );
    await ctx.subagents.interrupt(admitted.childId, { kind: "ancestor", agent: manager });
    await ctx.subagents.drainContinuableChildren(manager, [admitted.childId]);
    await writeResult({
        ok: true,
        scenario: "identity-admission",
        catalog,
        admittedChildId: admitted.childId,
        rejectedCandidateId: "candidate-reject",
        nativeSkillLoaded: true,
        sessionIndependent: true
    });
}
