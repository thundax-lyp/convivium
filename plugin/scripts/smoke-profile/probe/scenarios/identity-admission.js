import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { peerCreateCommand, peerSessionId, waitUntil } from "../support.js";
const canonical = (value) =>
    Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
          ? Object.fromEntries(
                Object.entries(value)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, item]) => [key, canonical(item)])
            )
          : value;
export const runIdentityAdmissionScenario = async (runtime) => {
    const { ctx, assert, remote, writeResult } = runtime;
    const definitions = JSON.parse(
        await readFile(join(process.env.CONVIVIUM_MEETING_ROLES_ROOT, "definitions.json"), "utf8")
    ).definitions;
    const candidates = ["domain_architect", "runtime_engineer"].map((role, i) => {
        const definition = definitions.find((d) => d.roleDefinitionId === role);
        return {
            candidateId: i === 0 ? "candidate-admit" : "candidate-reject",
            definition: { id: definition.agentDefinitionId, version: definition.definitionVersion },
            definitionHash: createHash("sha256")
                .update(
                    JSON.stringify(
                        canonical({
                            ...definition,
                            requiredSkillNames: [...definition.requiredSkillNames].sort(),
                            toolFilter: Object.fromEntries(
                                Object.entries(definition.toolFilter).map(([key, value]) => [
                                    key,
                                    [...value].sort()
                                ])
                            )
                        })
                    )
                )
                .digest("hex"),
            displayName: definition.displayName,
            availability: "available",
            meetingRoles: ["contributor"],
            responsibilitySummary: "fixture admission evidence",
            capabilitySummary: [{ kind: "skill", label: "repository-analysis" }],
            suitability: [{ scope: "agenda", rationale: "bounded admission test" }]
        };
    });
    let catalog;
    ctx.provide("convivium.agentCatalog", {
        readSnapshot: async (request) => {
            catalog = {
                protocolVersion: 1,
                meetingId: request.meetingId,
                catalogId: "smoke-catalog",
                catalogVersion: "1",
                generatedAt: Date.now(),
                candidates
            };
            return { kind: "available", snapshot: catalog };
        }
    });
    const created = await remote("control", {
        command: await peerCreateCommand(
            "identity-create",
            "准入验收：所有角色读取开始通知后等待；不要自动开轮或推荐。测试驱动将验证 Manager 的准入与拒绝，所有正式交流只经 Runtime。"
        )
    });
    assert(
        created.kind === "accepted",
        "identity meeting creation failed: " + JSON.stringify(created)
    );
    const meetingId = created.meetingId;
    const read = () => remote("read", { request: { protocolVersion: 1, meetingId } });
    const initial = await read();
    const managerId = initial.identities.find((i) => i.displayName === "meeting_manager").id;
    const manager = await runtime.waitForAgent(ctx, peerSessionId(meetingId, managerId));
    await manager.whenIdle();
    let admitted;
    for (const [i, candidate] of candidates.entries()) {
        const current = await read();
        const action = {
            kind: "recommend_identity",
            candidateId: candidate.candidateId,
            definitionId: candidate.definition.id,
            definitionVersion: candidate.definition.version,
            catalogId: "smoke-catalog",
            catalogVersion: "1",
            agendaId: "agenda",
            decision: i === 0 ? "admit" : "reject",
            rationale: "fixture decision",
            expectedContribution: "bounded repository evidence",
            evidenceGap: "fixture gap"
        };
        const command = {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: current.version,
            requestId: `identity-${action.decision}`,
            action
        };
        const result = await runtime.callTargetTool(
            ctx,
            manager,
            "convivium_recommend_identity",
            command,
            runtime.nextCall()
        );
        assert(result.kind === "accepted", "identity recommendation rejected");
        if (i === 0) {
            admitted = await waitUntil(
                async () =>
                    (await read()).identityRecommendations.find(
                        (item) =>
                            item.candidateId === candidate.candidateId && item.status === "active"
                    ),
                "admission did not activate"
            );
            const replay = await runtime.callTargetTool(
                ctx,
                manager,
                "convivium_recommend_identity",
                command,
                runtime.nextCall()
            );
            assert(
                isDeepStrictEqual(replay, result),
                "admission replay changed identity: " + JSON.stringify({ result, replay })
            );
        }
    }
    const view = await read();
    assert(
        view.identities.length === 8 &&
            view.identityRecommendations.some(
                (i) => i.candidateId === "candidate-reject" && i.status === "rejected"
            ),
        "admit/reject boundary changed"
    );
    // Dynamic intents use their persisted Session identifier, resolved by actual observed ownership.
    let owner;
    for (const agent of runtime.observedAgents()) {
        const found = await ctx
            .get("conviviumMeetingRuntime")
            .findBySessionId(String(agent.id), new AbortController().signal);
        if (found?.ownership.identityId === admitted.identityId) owner = found.ownership;
    }
    assert(
        owner?.lifecycleStatus === "active" && owner.capabilityStatus === "active",
        "dynamic peer ownership missing"
    );
    const agent = await runtime.waitForAgent(ctx, owner.sessionId);
    assert(
        agent.session.header.parentSession === undefined && agent.id !== manager.id,
        "admitted peer is not independent"
    );
    const loaded = await ctx.skills.get("repository-analysis", {
        scope: agent,
        cwd: agent.session.header.cwd,
        signal: new AbortController().signal
    });
    assert(
        loaded?.invocation?.modelInvocable === true && loaded.content.trim().length > 0,
        "admitted native Skill unavailable"
    );
    await writeResult({
        ok: true,
        scenario: "identity-admission",
        catalog,
        admittedIdentityId: admitted.identityId,
        admittedSessionId: owner.sessionId,
        ownershipId: owner.id,
        rejectedCandidateId: "candidate-reject",
        nativeSkillLoaded: true,
        sessionIndependent: true
    });
};
