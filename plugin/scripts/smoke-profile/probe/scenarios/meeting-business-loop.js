import { createHash } from "node:crypto";

export const MEETING_BUSINESS_LOOP_TOPIC = {
    objective:
        "评估在 vLLM 推理链路中引入 FP8／INT8 KV Cache 量化，是否能在不显著损害长上下文生成质量的前提下，降低显存占用并提高可服务并发；应优先采用哪种量化粒度与校准策略。",
    title: "vLLM KV Cache 量化的收益与实现路径",
    question:
        "在 vLLM 的推理链路中，引入 KV Cache 量化（FP8／INT8）是否能在不显著损害长上下文生成质量的前提下，降低显存占用并提高可服务并发？应优先采用哪种量化粒度与校准策略？"
};

function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, canonical(v)])
        );
    return value;
}

function stableId(kind, meetingId, key) {
    const bytes = Buffer.from(JSON.stringify(canonical([meetingId, kind, key])));
    return `${kind}-${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}`;
}

function reviewerToolSummary(agent) {
    const calls = new Map();
    const records = [];
    for (const event of agent.session.ownEvents()) {
        if (event.type === "tool/call") {
            let args;
            try {
                args = JSON.parse(event.data.arguments);
            } catch {
                args = undefined;
            }
            calls.set(String(event.data.callId), { name: event.data.name, args });
            continue;
        }
        if (event.type !== "tool/result") continue;
        const block = event.data.message.content[0];
        const call = calls.get(String(block?.toolCallId));
        if (call === undefined) continue;
        const text = block.content?.find((part) => part.type === "text")?.text;
        let outcome;
        let errorCode;
        try {
            const value = JSON.parse(text);
            outcome = value?.kind ?? null;
            errorCode = value?.error?.code ?? null;
        } catch {
            outcome = null;
            errorCode = null;
        }
        records.push({
            name: call.name,
            isError: block.isError === true || event.data.error !== undefined,
            outcome,
            errorCode,
            ...(call.name === "convivium_submit_review_batch"
                ? {
                      input: {
                          inputType: Array.isArray(call.args?.input)
                              ? "array"
                              : typeof call.args?.input,
                          shape: {
                              root: Object.keys(call.args ?? {}),
                              input:
                                  call.args?.input && typeof call.args.input === "object"
                                      ? Object.keys(call.args.input)
                                      : [],
                              nestedInput:
                                  call.args?.input?.input &&
                                  typeof call.args.input.input === "object"
                                      ? Object.keys(call.args.input.input)
                                      : [],
                              action:
                                  call.args?.input?.action &&
                                  typeof call.args.input.action === "object"
                                      ? Object.keys(call.args.input.action)
                                      : []
                          },
                          expectedMeetingVersion: call.args?.input?.expectedMeetingVersion,
                          reviews: call.args?.input?.action?.reviews?.map((review) => ({
                              versionId: review.versionId,
                              dimensionKeys: Object.keys(review.dimensions ?? {})
                          }))
                      }
                  }
                : {})
        });
    }
    return records;
}

function reviewerTurnSummary(agent) {
    const events = [...agent.session.ownEvents()];
    return {
        starts: events.filter((event) => event.type === "turn/start").length,
        ends: events.filter((event) => event.type === "turn/end").length,
        endReasons: events
            .filter((event) => event.type === "turn/end")
            .map((event) => ({
                kind: event.data.reason?.kind ?? "unknown",
                message:
                    event.data.reason?.error?.message ??
                    event.data.reason?.message ??
                    event.data.reason?.diagnostic ??
                    null
            }))
    };
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

export async function runMeetingBusinessLoopScenario(runtime) {
    const {
        ctx,
        captain,
        callTargetTool,
        callTargetToolResult,
        nextCall,
        assert,
        writeResult,
        messageTexts
    } = runtime;
    const keys = [
        "manager",
        "reviewer",
        "contributor-a",
        "contributor-b",
        "contributor-c",
        "contributor-d",
        "contributor-e"
    ];
    const definitions = [
        ["manager", "convivium.meeting_manager", "1.2.0", "manager"],
        ["reviewer", "convivium.verification_reviewer", "1.2.2", "evidence_reviewer"],
        ["contributor-a", "convivium.domain_architect", "1.0.0", "contributor"],
        ["contributor-b", "convivium.runtime_engineer", "1.0.0", "contributor"],
        ["contributor-c", "convivium.protocol_ui_engineer", "1.0.0", "contributor"],
        ["contributor-d", "convivium.github_research_analyst", "1.0.0", "contributor"],
        ["contributor-e", "convivium.arxiv_research_analyst", "1.0.0", "contributor"]
    ];
    const input = {
        protocolVersion: 1,
        meetingId: "new",
        expectedMeetingVersion: 0,
        requestId: "meeting-business-loop-create",
        action: {
            kind: "create_meeting",
            objective: {
                statement: MEETING_BUSINESS_LOOP_TOPIC.objective,
                requiredOutputs: [],
                acceptanceCriteria: [],
                hardConstraints: [],
                acceptableRiskLevel: "low"
            },
            identities: definitions.map(([identityKey, definitionId, definitionVersion, role]) => ({
                identityKey,
                definitionId,
                definitionVersion,
                displayName: identityKey,
                roles: [role],
                agendaResponsibilityIds: ["agenda-1"],
                riskAuthority: false,
                required: true
            })),
            managerIdentityKey: "manager",
            evidenceReviewerIdentityKey: "reviewer",
            initialAgenda: [
                {
                    id: "agenda-1",
                    title: MEETING_BUSINESS_LOOP_TOPIC.title,
                    question: MEETING_BUSINESS_LOOP_TOPIC.question,
                    requiredOutputIds: [],
                    ownerIdentityKey: "manager"
                }
            ],
            initialActiveAgendaId: "agenda-1",
            limits: {
                maxFormalMessages: 20,
                maxDurationMs: 120000,
                taskDeadlineMs: 30000,
                reviewDeadlineMs: 30000
            }
        }
    };
    const created = await callTargetTool(
        ctx,
        captain.agent,
        "convivium_create_meeting",
        input,
        nextCall()
    );
    const meetingId = created.meetingId;
    const runtimeApi = ctx.get("conviviumMeetingRuntime");
    const read = () =>
        runtimeApi.read({ protocolVersion: 1, meetingId }, new AbortController().signal);
    const view = await read();
    const identities = Object.fromEntries(
        view.identities.map((identity) => [identity.displayName, identity.id])
    );
    const agents = Object.fromEntries(
        await Promise.all(
            keys.map(async (key) => [
                key,
                await runtime.waitForAgent(ctx, stableId("child_session", meetingId, key))
            ])
        )
    );
    const currentAgent = (key) =>
        runtime.observedAgents().find((agent) => String(agent.id) === String(agents[key].id)) ??
        agents[key];
    const currentReviewer = () => currentAgent("reviewer");
    const contributorKeys = [
        "contributor-a",
        "contributor-b",
        "contributor-c",
        "contributor-d",
        "contributor-e"
    ];
    const interruptedTurnCount = new Map();
    for (let attempt = 0; attempt < 240; attempt += 1) {
        for (const key of contributorKeys) {
            const turns = reviewerTurnSummary(currentAgent(key));
            if (turns.starts > turns.ends && interruptedTurnCount.get(key) !== turns.starts) {
                ctx.subagents.interrupt(agents[key].id, {
                    kind: "ancestor",
                    agent: captain.agent
                });
                interruptedTurnCount.set(key, turns.starts);
            }
        }
        const coordinatorRolesIdle = ["manager", "reviewer"].every((key) => {
            const turns = reviewerTurnSummary(currentAgent(key));
            return turns.starts > 0 && turns.starts === turns.ends;
        });
        const noticesDelivered = contributorKeys.every(
            (key) =>
                new Set(
                    runtime
                        .observedMessages(currentAgent(key))
                        .flatMap(messageTexts)
                        .filter((text) => text.includes("meeting_started"))
                ).size === 1
        );
        if (coordinatorRolesIdle && noticesDelivered) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const roleTurns = Object.fromEntries(
        keys.map((key) => [key, reviewerTurnSummary(currentAgent(key))])
    );
    assert(
        ["manager", "reviewer"].every(
            (key) => roleTurns[key].starts > 0 && roleTurns[key].starts === roleTurns[key].ends
        ),
        `initial Meeting coordinator turns did not settle: ${JSON.stringify(roleTurns)}`
    );
    const initialNoticeCounts = Object.fromEntries(
        contributorKeys.map((key) => [
            key,
            new Set(
                runtime
                    .observedMessages(currentAgent(key))
                    .flatMap(messageTexts)
                    .filter((text) => text.includes("meeting_started"))
            ).size
        ])
    );
    assert(
        Object.values(initialNoticeCounts).every((count) => count === 1),
        `initial meeting_started notice counts are invalid: ${JSON.stringify(initialNoticeCounts)}`
    );
    const reviewerProvisioning = reviewerTurnSummary(currentReviewer());
    assert(
        reviewerProvisioning.endReasons.at(-1)?.kind === "completed",
        `reviewer provisioning turn failed: ${JSON.stringify(reviewerProvisioning)}`
    );
    let version = view.version;
    let manager = await runtime.waitForAgent(ctx, agents.manager.id);
    const knownSessionIds = new Set([
        String(captain.agent.id),
        ...Object.values(agents).map((agent) => String(agent.id))
    ]);
    const open = await callTargetTool(
        ctx,
        manager,
        "convivium_open_round",
        {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: version,
            requestId: "loop-open-round",
            action: { kind: "open_round", agendaId: "agenda-1" }
        },
        nextCall()
    );
    const roundId = open.relatedIds?.[0];
    assert(roundId, "open_round did not return its related round id");
    version = open.committedVersion;
    const raised = [];
    for (const key of ["contributor-a", "contributor-b"]) {
        const contributor = await runtime.waitForAgent(ctx, agents[key].id);
        const result = await callTargetTool(
            ctx,
            contributor,
            "convivium_raise_hand",
            {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: version,
                requestId: `loop-raise-${key}`,
                action: { kind: "raise_hand", roundId, purpose: "submit smoke evidence" }
            },
            nextCall()
        );
        raised.push(key);
        version = result.committedVersion;
    }
    const contributions = [];
    for (const key of raised) {
        manager = await runtime.waitForAgent(ctx, manager.id);
        const result = await callTargetTool(
            ctx,
            manager,
            "convivium_dispose_hand_raise",
            {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: version,
                requestId: `loop-dispose-${key}`,
                action: {
                    kind: "dispose_hand_raise",
                    roundId,
                    contributorId: identities[key],
                    disposition: "accepted",
                    reason: "needed for smoke"
                }
            },
            nextCall()
        );
        contributions.push(result.relatedIds?.[1]);
        version = result.committedVersion;
    }
    for (const [index, key] of raised.entries()) {
        const beforeEvidence = await read();
        try {
            const contributor = await runtime.waitForAgent(ctx, agents[key].id);
            await callTargetTool(
                ctx,
                contributor,
                "convivium_submit_evidence",
                {
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: beforeEvidence.version,
                    requestId: `loop-evidence-${key}`,
                    action: {
                        kind: "submit_evidence",
                        contributionId: contributions[index],
                        evidence: evidence(key)
                    }
                },
                nextCall()
            );
        } catch (error) {
            throw new Error(
                `submit evidence failed for ${key} contribution=${contributions[index]} version=${beforeEvidence.version} rounds=${JSON.stringify(beforeEvidence.rounds)}: ${error.message}`,
                { cause: error }
            );
        }
    }
    const afterEvidence = await read();
    const versionIds = afterEvidence.evidencePackages.map((item) => item.currentVersion.id);
    assert(versionIds.length === 2, "expected two visible evidence versions");
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (
            runtime
                .observedMessages(currentReviewer())
                .flatMap(messageTexts)
                .some((text) => text.includes('"pending"'))
        )
            break;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert(
        runtime
            .observedMessages(currentReviewer())
            .flatMap(messageTexts)
            .some((text) => text.includes('"pending"')),
        "review request was not delivered to the coordinator"
    );
    let workers = [];
    for (let attempt = 0; attempt < 300; attempt += 1) {
        workers = runtime
            .observedAgents()
            .filter(
                (agent) =>
                    !knownSessionIds.has(String(agent.id)) && ctx.agents.get(agent.id) === agent
            );
        if (workers.length >= 2) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert(
        workers.length >= 2,
        `reviewer did not create two live one-shot workers; observed=${JSON.stringify(runtime.observedAgents().map((agent) => String(agent.id)))}; turns=${JSON.stringify(reviewerTurnSummary(currentReviewer()))}; tools=${JSON.stringify(reviewerToolSummary(currentReviewer()))}`
    );
    const authorityVersion = (await read()).version;
    for (const [index, worker] of workers.slice(0, 2).entries()) {
        const unauthorized = await callTargetToolResult(
            ctx,
            worker,
            "convivium_raise_hand",
            {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: authorityVersion,
                requestId: `loop-worker-authority-${index}`,
                action: { kind: "raise_hand", roundId, purpose: "must be rejected" }
            },
            nextCall(),
            { retryUnknown: false }
        );
        const toolUnavailable =
            unauthorized.isError && String(unauthorized.error?.message).includes("unknown tool");
        const commandRejected =
            !unauthorized.isError &&
            unauthorized.value?.kind === "rejected" &&
            unauthorized.value.error?.code === "UNAUTHORIZED";
        assert(
            toolUnavailable || commandRejected,
            "review worker gained Meeting command authority"
        );
    }
    let reviewedView;
    for (let attempt = 0; attempt < 900; attempt += 1) {
        reviewedView = await read();
        const reviewedVersionIds =
            reviewedView.evidenceReviews?.map((review) => review.versionId) ?? [];
        if (versionIds.every((versionId) => reviewedVersionIds.includes(versionId))) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert(
        versionIds.every((versionId) =>
            reviewedView?.evidenceReviews?.some((review) => review.versionId === versionId)
        ),
        `reviewer did not atomically submit the worker review batch; currentVersion=${reviewedView?.version}; reviewed=${JSON.stringify(reviewedView?.evidenceReviews?.map((review) => review.versionId) ?? [])}; turns=${JSON.stringify(reviewerTurnSummary(currentReviewer()))}; tools=${JSON.stringify(reviewerToolSummary(currentReviewer()))}`
    );
    let reviewDelivered;
    for (let attempt = 0; attempt < 900; attempt += 1) {
        for (const key of raised) {
            const turns = reviewerTurnSummary(currentAgent(key));
            if (turns.starts > turns.ends && interruptedTurnCount.get(key) !== turns.starts) {
                ctx.subagents.interrupt(agents[key].id, {
                    kind: "ancestor",
                    agent: captain.agent
                });
                interruptedTurnCount.set(key, turns.starts);
            }
        }
        reviewDelivered = await read();
        const sentReviewIds = new Set(
            reviewDelivered.reviewDeliveries
                ?.filter((delivery) => delivery.status === "sent")
                .map((delivery) => delivery.reviewId) ?? []
        );
        if (
            reviewDelivered.evidenceReviews
                ?.filter((review) => versionIds.includes(review.versionId))
                .every((review) => sentReviewIds.has(review.id))
        )
            break;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert(
        reviewDelivered?.evidenceReviews
            ?.filter((review) => versionIds.includes(review.versionId))
            .every((review) =>
                reviewDelivered.reviewDeliveries?.some(
                    (delivery) => delivery.reviewId === review.id && delivery.status === "sent"
                )
            ),
        `evidence reviews were not delivered: ${JSON.stringify({ version: reviewDelivered?.version, reviews: reviewDelivered?.evidenceReviews?.map((review) => review.versionId), deliveries: reviewDelivered?.reviewDeliveries })}`
    );
    const liveManager = await runtime.waitForAgent(ctx, manager.id);
    let published;
    try {
        published = await callTargetTool(
            ctx,
            liveManager,
            "convivium_publish_round",
            {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: reviewDelivered.version,
                requestId: "loop-publish",
                action: { kind: "publish_round", roundId }
            },
            nextCall()
        );
    } catch (error) {
        throw new Error(
            `publish failed: ${error.message}; state=${JSON.stringify({ version: reviewDelivered.version, round: reviewDelivered.rounds.find((round) => round.id === roundId), contributions: reviewDelivered.contributions, reviews: reviewDelivered.reviews, reviewDeliveries: reviewDelivered.reviewDeliveries })}`,
            { cause: error }
        );
    }
    const ended = await runtimeApi.control(
        {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: published.committedVersion,
            requestId: "loop-end",
            action: {
                kind: "end_meeting",
                outcome: "partial",
                reason: "smoke complete",
                decisionIds: [],
                completionFactIds: [],
                unresolvedQuestionIds: [],
                unresolvedIssueIds: []
            }
        },
        new AbortController().signal
    );
    assert(ended.kind === "accepted", "local end_meeting was rejected");
    let archived;
    for (let attempt = 0; attempt < 900; attempt += 1) {
        archived = await read();
        if (archived.lifecycle.status === "archived") break;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert(
        archived?.lifecycle.status === "archived",
        `meeting did not reach archived state: ${JSON.stringify({ version: archived?.version, lifecycle: archived?.lifecycle, archive: archived?.archive, agents: Object.fromEntries(keys.map((key) => [key, { status: currentAgent(key).status, turns: reviewerTurnSummary(currentAgent(key)) }])) })}`
    );
    const startedNoticeCounts = Object.fromEntries(
        contributorKeys.map((key) => [
            key,
            new Set(
                runtime
                    .observedMessages(currentAgent(key))
                    .flatMap(messageTexts)
                    .filter((text) => text.includes("meeting_started"))
            ).size
        ])
    );
    assert(
        Object.values(startedNoticeCounts).every((count) => count === 1),
        `meeting_started notice counts are invalid: ${JSON.stringify(startedNoticeCounts)}`
    );
    await writeResult({
        ok: true,
        scenario: "meeting-business-loop",
        meetingId,
        assertions: [
            "target-create",
            "meeting-started",
            "two-evidence",
            "review-batch",
            "worker-authority",
            "published",
            "archived"
        ],
        observed: {
            status: archived.lifecycle.status,
            evidenceVersionIds: versionIds,
            startedNoticeCounts,
            workerSessionIds: workers.slice(0, 2).map((worker) => String(worker.id))
        }
    });
}
