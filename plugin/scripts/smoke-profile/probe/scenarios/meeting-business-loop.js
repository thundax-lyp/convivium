import { createHash } from "node:crypto";

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
    return value;
}

function stableId(kind, meetingId, key) {
    const bytes = Buffer.from(JSON.stringify(canonical([meetingId, kind, key])));
    return `${kind}-${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}`;
}

const evidence = (suffix) => ({
    observation: `observation-${suffix}`,
    interpretation: `interpretation-${suffix}`,
    method: "deterministic smoke method",
    falsifiers: [{ value: "different result" }],
    uncertainties: [{ value: "none known" }],
    limitations: [{ value: "smoke fixture" }],
    claims: [
        {
            id: `claim-${suffix}`,
            statement: `claim-${suffix}`,
            materialIds: [`material-${suffix}`],
            qualification: "fixture"
        }
    ],
    materials: [
        {
            id: `material-${suffix}`,
            kind: "document",
            originator: "smoke",
            originalSource: "smoke",
            sourcePublishedAt: "2026-01-01",
            acquiredAt: "2026-01-01",
            version: "1",
            locator: `smoke://${suffix}`,
            location: "local",
            verificationConditions: "deterministic",
            limitations: "fixture",
            sharedDependencies: []
        }
    ]
});

const dimensions = (versionId) => {
    const dimension = {
        score: 3,
        scope: "smoke",
        reason: `verified-${versionId}`,
        baselineEvidenceIds: []
    };
    return { versionId, dimensions: { source: dimension, credibility: dimension, completeness: dimension, support: dimension }, scope: "smoke" };
};

export async function runMeetingBusinessLoopScenario(runtime) {
    const { ctx, captain, callTargetTool, nextCall, assert, writeResult, messageTexts } = runtime;
    const keys = ["manager", "reviewer", "contributor-a", "contributor-b", "contributor-c", "contributor-d", "contributor-e", "contributor-f"];
    const definitions = [
        ["manager", "convivium.meeting_manager", "1.2.0", "manager"],
        ["reviewer", "convivium.verification_reviewer", "1.1.0", "evidence_reviewer"],
        ["contributor-a", "convivium.domain_architect", "1.0.0", "contributor"],
        ["contributor-b", "convivium.runtime_engineer", "1.0.0", "contributor"],
        ["contributor-c", "convivium.protocol_ui_engineer", "1.0.0", "contributor"],
        ["contributor-d", "convivium.github_research_analyst", "1.0.0", "contributor"],
        ["contributor-e", "convivium.arxiv_research_analyst", "1.0.0", "contributor"],
        ["contributor-f", "convivium.web_research_analyst", "1.0.0", "contributor"]
    ];
    const input = {
        protocolVersion: 1,
        meetingId: "new",
        expectedMeetingVersion: 0,
        requestId: "meeting-business-loop-create",
        action: {
            kind: "create_meeting",
            objective: { statement: "Verify target business loop", requiredOutputs: [], acceptanceCriteria: [], hardConstraints: [], acceptableRiskLevel: "low" },
            identities: definitions.map(([identityKey, definitionId, definitionVersion, role]) => ({
                identityKey, definitionId, definitionVersion, displayName: identityKey,
                roles: [role], agendaResponsibilityIds: ["agenda-1"], riskAuthority: false, required: true
            })),
            managerIdentityKey: "manager",
            evidenceReviewerIdentityKey: "reviewer",
            initialAgenda: [{ id: "agenda-1", title: "Target loop", question: "Can the target loop complete?", requiredOutputIds: [], ownerIdentityKey: "manager" }],
            initialActiveAgendaId: "agenda-1",
            limits: { maxFormalMessages: 20, maxDurationMs: 120000, taskDeadlineMs: 30000, reviewDeadlineMs: 30000 }
        }
    };
    const created = await callTargetTool(ctx, captain.agent, "convivium_create_meeting", input, nextCall());
    const meetingId = created.meetingId;
    const runtimeApi = ctx.get("conviviumMeetingRuntime");
    const read = () => runtimeApi.read({ protocolVersion: 1, meetingId }, new AbortController().signal);
    const view = await read();
    const identities = Object.fromEntries(view.identities.map((identity) => [identity.displayName, identity.id]));
    const agents = Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await runtime.waitForAgent(ctx, stableId("child_session", meetingId, key))])));
    let version = view.version;
    const manager = agents.manager;
    const reviewer = agents.reviewer;
    const open = await callTargetTool(ctx, manager, "convivium_open_round", { protocolVersion: 1, meetingId, expectedMeetingVersion: version, requestId: "loop-open-round", action: { kind: "open_round", agendaId: "agenda-1" } }, nextCall());
    const roundId = open.relatedIds?.[0];
    assert(roundId, "open_round did not return its related round id");
    version = open.committedVersion;
    const raised = [];
    for (const key of ["contributor-a", "contributor-b"]) {
        const result = await callTargetTool(ctx, agents[key], "convivium_raise_hand", { protocolVersion: 1, meetingId, expectedMeetingVersion: version, requestId: `loop-raise-${key}`, action: { kind: "raise_hand", roundId, purpose: "submit smoke evidence" } }, nextCall());
        raised.push(key);
        version = result.committedVersion;
    }
    const contributions = [];
    for (const key of raised) {
        const result = await callTargetTool(ctx, manager, "convivium_dispose_hand_raise", { protocolVersion: 1, meetingId, expectedMeetingVersion: version, requestId: `loop-dispose-${key}`, action: { kind: "dispose_hand_raise", roundId, contributorId: identities[key], disposition: "accepted", reason: "needed for smoke" } }, nextCall());
        contributions.push(result.relatedIds?.[1]);
        version = result.committedVersion;
    }
    for (const [index, key] of raised.entries()) {
        const beforeEvidence = await read();
        version = beforeEvidence.version;
        let result;
        try {
            result = await callTargetTool(ctx, agents[key], "convivium_submit_evidence", { protocolVersion: 1, meetingId, expectedMeetingVersion: version, requestId: `loop-evidence-${key}`, action: { kind: "submit_evidence", contributionId: contributions[index], evidence: evidence(key) } }, nextCall());
        } catch (error) {
            throw new Error(`submit evidence failed for ${key} contribution=${contributions[index]} version=${beforeEvidence.version} rounds=${JSON.stringify(beforeEvidence.rounds)}: ${error.message}`);
        }
        version = result.committedVersion;
    }
    const afterEvidence = await read();
    const versionIds = afterEvidence.evidencePackages.map((item) => item.currentVersion.id);
    assert(versionIds.length === 2, "expected two visible evidence versions");
    const reviewed = await callTargetTool(ctx, reviewer, "convivium_submit_review_batch", { protocolVersion: 1, meetingId, expectedMeetingVersion: afterEvidence.version, requestId: "loop-review-batch", action: { kind: "submit_review_batch", reviews: versionIds.map(dimensions) } }, nextCall());
    let reviewDelivered;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        reviewDelivered = await read();
        if (reviewDelivered.reviewDeliveries?.length === versionIds.length && reviewDelivered.reviewDeliveries.every((delivery) => delivery.status === "sent")) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert(reviewDelivered?.reviewDeliveries?.every((delivery) => delivery.status === "sent"), "evidence reviews were not delivered");
    const liveManager = await runtime.waitForAgent(ctx, manager.id);
    let published;
    try {
        published = await callTargetTool(ctx, liveManager, "convivium_publish_round", { protocolVersion: 1, meetingId, expectedMeetingVersion: reviewDelivered.version, requestId: "loop-publish", action: { kind: "publish_round", roundId } }, nextCall());
    } catch (error) {
        throw new Error(`publish failed: ${error.message}; state=${JSON.stringify({ version: reviewDelivered.version, round: reviewDelivered.rounds.find((round) => round.id === roundId), contributions: reviewDelivered.contributions, reviews: reviewDelivered.reviews, reviewDeliveries: reviewDelivered.reviewDeliveries })}`);
    }
    const ended = await runtimeApi.control({ protocolVersion: 1, meetingId, expectedMeetingVersion: published.committedVersion, requestId: "loop-end", action: { kind: "end_meeting", outcome: "partial", reason: "smoke complete", decisionIds: [], completionFactIds: [], unresolvedQuestionIds: [], unresolvedIssueIds: [] } }, new AbortController().signal);
    assert(ended.kind === "accepted", "local end_meeting was rejected");
    let archived;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        archived = await read();
        if (archived.lifecycle.status === "archived") break;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert(archived?.lifecycle.status === "archived", "meeting did not reach archived state");
    const startedNotices = runtime.observedAgents().flatMap((agent) => runtime.messageTexts ? runtime.observedMessages?.(agent) ?? [] : []).flatMap(messageTexts).filter((text) => text.includes("meeting_started"));
    await writeResult({ ok: true, scenario: "meeting-business-loop", meetingId, assertions: ["target-create", "meeting-started", "two-evidence", "review-batch", "published", "archived"], observed: { status: archived.lifecycle.status, evidenceVersionIds: versionIds, startedNotices: startedNotices.length } });
}
