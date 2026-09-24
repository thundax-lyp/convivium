import { createHash } from "node:crypto";

export const MEETING_BUSINESS_LOOP_TOPIC = {
    objective:
        "Agent 执行长任务时，如何在保证一定发散性的前提下保证任务目标不漂移，实现可控的发散？请给出目标锚定机制、允许的探索边界、漂移检测与纠偏策略、验收指标，以及明确的继续／停止条件。",
    title: "Agent 长任务中的可控发散",
    question:
        "Agent 执行长任务时，如何在保证一定发散性的前提下保证任务目标不漂移，实现可控的发散？请给出目标锚定机制、允许的探索边界、漂移检测与纠偏策略、验收指标，以及明确的继续／停止条件。"
};

export const MEETING_BUSINESS_LOOP_LIMITS = Object.freeze({
    maxFormalMessages: 20,
    maxDurationMs: 600000,
    taskDeadlineMs: 30000,
    reviewDeadlineMs: 90000
});

export const MEETING_BUSINESS_LOOP_DEFINITIONS = [
    ["manager", "convivium.meeting_manager", "1.3.2", "manager"],
    ["reviewer", "convivium.verification_reviewer", "1.2.6", "evidence_reviewer"],
    ["contributor-a", "convivium.domain_architect", "1.0.3", "contributor"],
    ["contributor-b", "convivium.runtime_engineer", "1.0.3", "contributor"],
    ["contributor-c", "convivium.protocol_ui_engineer", "1.0.3", "contributor"],
    ["contributor-d", "convivium.github_research_analyst", "1.0.3", "contributor"],
    ["contributor-e", "convivium.arxiv_research_analyst", "1.0.3", "contributor"]
];

export const MEETING_BUSINESS_LOOP_ROUNDS = [
    {
        id: "literature",
        sourceScope: "agent-research-fixture",
        question: "Agent 长任务中的目标漂移与探索发散分别由什么机制触发，有哪些可观察信号？"
    },
    {
        id: "source",
        sourceScope: "agent-runtime-fixture",
        question: "Agent runtime 中目标、计划、checkpoint 与上下文压缩的控制边界在哪里？"
    },
    {
        id: "implementation",
        sourceScope: "control-design-fixture",
        question: "实现目标锚定、漂移检测与纠偏闭环的最小机制是什么？"
    },
    {
        id: "decision",
        sourceScope: "evaluation-fixture",
        question: "哪些指标和阈值能同时衡量发散价值与目标一致性，并决定继续或停止？"
    }
];

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
            ...(call.name === "convivium_submit_evidence_review"
                ? {
                      arguments: {
                          rootType: Array.isArray(call.args) ? "array" : typeof call.args,
                          shape: {
                              root: Object.keys(call.args ?? {}),
                              action:
                                  call.args?.action && typeof call.args.action === "object"
                                      ? Object.keys(call.args.action)
                                      : []
                          },
                          expectedMeetingVersion: call.args?.expectedMeetingVersion,
                          review: {
                              versionId: call.args?.action?.versionId,
                              dimensionKeys: Object.keys(call.args?.action?.dimensions ?? {})
                          }
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

const evidence = (round, suffix) => ({
    observation: `fixture observation for ${round.id} from ${suffix}`,
    interpretation: `fixture interpretation for ${round.id} from ${suffix}`,
    method: "deterministic smoke method",
    falsifiers: [{ value: "different result" }],
    uncertainties: [{ value: "none known" }],
    limitations: [{ value: "smoke fixture" }],
    claims: [
        {
            id: `claim-${round.id}-${suffix}`,
            statement: `fixture claim for ${round.id}; not external research`,
            materialIds: [`material-${round.id}-${suffix}`],
            qualification: "fixture"
        }
    ],
    materials: [
        {
            id: `material-${round.id}-${suffix}`,
            kind: "document",
            originator: "smoke",
            originalSource: "smoke",
            sourcePublishedAt: "2026-01-01",
            acquiredAt: "2026-01-01",
            version: "1",
            locator: `smoke://${round.sourceScope}/${suffix}`,
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
            identities: MEETING_BUSINESS_LOOP_DEFINITIONS.map(
                ([identityKey, definitionId, definitionVersion, role]) => ({
                    identityKey,
                    definitionId,
                    definitionVersion,
                    displayName: identityKey,
                    roles: [role],
                    agendaResponsibilityIds: ["agenda-1"],
                    riskAuthority: false,
                    required: true
                })
            ),
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
            limits: MEETING_BUSINESS_LOOP_LIMITS
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
    const roundTrace = [];
    const workerSessionIds = new Set();
    let workerAuthorityVerified = false;
    for (const roundPlan of MEETING_BUSINESS_LOOP_ROUNDS) {
        // Publishing the prior round can complete the Manager's turn. Each
        // plan/open-round pair therefore starts from a live Manager session.
        manager = await runtime.waitForAgent(ctx, manager.id);
        const plan = await callTargetTool(
            ctx,
            manager,
            "convivium_submit_manager_plan",
            {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: version,
                requestId: `loop-plan-${roundPlan.id}`,
                action: {
                    kind: "submit_manager_plan",
                    agendaId: "agenda-1",
                    planKind: "open_round",
                    roundGoal: {
                        question: roundPlan.question,
                        evidenceGap: `${roundPlan.sourceScope} evidence gap`,
                        expectedOutput: `fixture output for ${roundPlan.id}`
                    },
                    rationale: `plan ${roundPlan.id} fixture investigation`
                }
            },
            nextCall()
        );
        const planId = plan.relatedIds?.[1];
        assert(planId, `submit_manager_plan did not return its plan id for ${roundPlan.id}`);
        version = plan.committedVersion;
        // A target-tool invocation can complete the caller's Agent turn. Reacquire the
        // live Manager before using it for the dependent open_round command.
        manager = await runtime.waitForAgent(ctx, manager.id);
        const open = await callTargetTool(
            ctx,
            manager,
            "convivium_open_round",
            {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: version,
                requestId: `loop-open-round-${roundPlan.id}`,
                action: {
                    kind: "open_round",
                    agendaId: "agenda-1",
                    planId
                }
            },
            nextCall()
        );
        const roundId = open.relatedIds?.[0];
        assert(roundId, `open_round did not return its related round id for ${roundPlan.id}`);
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
                    requestId: `loop-raise-${roundPlan.id}-${key}`,
                    action: {
                        kind: "raise_hand",
                        roundId,
                        purpose: `submit fixture evidence for ${roundPlan.id}`
                    }
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
                    requestId: `loop-dispose-${roundPlan.id}-${key}`,
                    action: {
                        kind: "dispose_hand_raise",
                        roundId,
                        contributorId: identities[key],
                        disposition: "accepted",
                        reason: `needed for ${roundPlan.id} fixture smoke`
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
                        requestId: `loop-evidence-${roundPlan.id}-${key}`,
                        action: {
                            kind: "submit_evidence",
                            contributionId: contributions[index],
                            evidence: evidence(roundPlan, key)
                        }
                    },
                    nextCall()
                );
            } catch (error) {
                throw new Error(
                    `submit evidence failed for ${roundPlan.id}/${key} contribution=${contributions[index]} version=${beforeEvidence.version}: ${error.message}`,
                    { cause: error }
                );
            }
        }
        const afterEvidence = await read();
        const versionIds = afterEvidence.evidencePackages
            .filter((item) => contributions.includes(item.contributionId))
            .map((item) => item.currentVersion.id);
        assert(versionIds.length === 2, `expected two evidence versions for ${roundPlan.id}`);
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
            `review request was not delivered to the coordinator for ${roundPlan.id}`
        );
        let workers = [];
        for (let attempt = 0; attempt < 300; attempt += 1) {
            workers = runtime
                .observedAgents()
                .filter(
                    (agent) =>
                        !knownSessionIds.has(String(agent.id)) &&
                        !workerSessionIds.has(String(agent.id))
                );
            if (workers.length >= 2) break;
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        assert(
            workers.length >= 2,
            `reviewer did not create two one-shot workers for ${roundPlan.id}; observed=${JSON.stringify(runtime.observedAgents().map((agent) => String(agent.id)))}; turns=${JSON.stringify(reviewerTurnSummary(currentReviewer()))}; tools=${JSON.stringify(reviewerToolSummary(currentReviewer()))}`
        );
        const selectedWorkers = workers.slice(0, 2);
        for (const worker of selectedWorkers) workerSessionIds.add(String(worker.id));
        if (!workerAuthorityVerified) {
            const authorityVersion = (await read()).version;
            for (const [index, selectedWorker] of selectedWorkers.entries()) {
                const worker = await runtime.waitForAgent(ctx, selectedWorker.id);
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
                    unauthorized.isError &&
                    String(unauthorized.error?.message).includes("unknown tool");
                const commandRejected =
                    !unauthorized.isError &&
                    unauthorized.value?.kind === "rejected" &&
                    unauthorized.value.error?.code === "UNAUTHORIZED";
                assert(
                    toolUnavailable || commandRejected,
                    "review worker gained Meeting command authority"
                );
            }
            workerAuthorityVerified = true;
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
            `reviewer did not independently submit all worker reviews for ${roundPlan.id}; currentVersion=${reviewedView?.version}; reviewed=${JSON.stringify(reviewedView?.evidenceReviews?.map((review) => review.versionId) ?? [])}; turns=${JSON.stringify(reviewerTurnSummary(currentReviewer()))}; tools=${JSON.stringify(reviewerToolSummary(currentReviewer()))}`
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
            `evidence reviews were not delivered for ${roundPlan.id}: ${JSON.stringify({ version: reviewDelivered?.version, reviews: reviewDelivered?.evidenceReviews?.map((review) => review.versionId), deliveries: reviewDelivered?.reviewDeliveries })}`
        );
        if (roundPlan.id === "decision") {
            const lateContributorId = identities["contributor-e"];
            let lateHandReady = false;
            for (let attempt = 0; attempt < 10 && !lateHandReady; attempt += 1) {
                const current = await read();
                lateHandReady = current.rounds
                    .find((round) => round.id === roundId)
                    ?.pendingHandRaises?.some((hand) => hand.contributorId === lateContributorId);
                if (lateHandReady) break;
                const contributor = await runtime.waitForAgent(ctx, agents["contributor-e"].id);
                const lateRaise = await callTargetToolResult(
                    ctx,
                    contributor,
                    "convivium_raise_hand",
                    {
                        protocolVersion: 1,
                        meetingId,
                        expectedMeetingVersion: current.version,
                        requestId: `loop-late-hand-${attempt}`,
                        action: {
                            kind: "raise_hand",
                            roundId,
                            purpose: "submit valid late arXiv evidence for smoke disposition"
                        }
                    },
                    nextCall()
                );
                if (lateRaise.isError) {
                    throw new Error(`late hand failed: ${lateRaise.error?.message}`);
                }
                if (lateRaise.value?.kind === "accepted") {
                    lateHandReady = true;
                    break;
                }
                if (
                    lateRaise.value?.kind === "rejected" &&
                    ["CONFLICT", "PRECONDITION_FAILED"].includes(lateRaise.value.error?.code)
                ) {
                    continue;
                }
                throw new Error(`late hand rejected: ${JSON.stringify(lateRaise.value)}`);
            }
            assert(lateHandReady, "decision round did not receive a valid late hand raise");
        }
        let published;
        let publicationView = reviewDelivered;
        const deferredHandRaiseContributorIds = [];
        for (let attempt = 0; attempt < 30 && published === undefined; attempt += 1) {
            publicationView = await read();
            const pendingHand = publicationView.rounds.find((round) => round.id === roundId)
                ?.pendingHandRaises?.[0];
            if (pendingHand !== undefined) {
                manager = await runtime.waitForAgent(ctx, manager.id);
                const disposition = await callTargetToolResult(
                    ctx,
                    manager,
                    "convivium_dispose_hand_raise",
                    {
                        protocolVersion: 1,
                        meetingId,
                        expectedMeetingVersion: publicationView.version,
                        requestId: `loop-defer-${roundPlan.id}-${attempt}-${pendingHand.contributorId}`,
                        action: {
                            kind: "dispose_hand_raise",
                            roundId,
                            contributorId: pendingHand.contributorId,
                            disposition: "deferred",
                            reason: `fixed smoke evidence for ${roundPlan.id} is already under review`
                        }
                    },
                    nextCall()
                );
                if (disposition.isError) {
                    throw new Error(
                        `defer pending hand failed for ${roundPlan.id}: ${disposition.error?.message}`
                    );
                }
                if (disposition.value?.kind === "accepted") {
                    deferredHandRaiseContributorIds.push(pendingHand.contributorId);
                    continue;
                }
                if (
                    disposition.value?.kind === "rejected" &&
                    ["CONFLICT", "NOT_FOUND"].includes(disposition.value.error?.code)
                ) {
                    continue;
                }
                throw new Error(
                    `defer pending hand rejected for ${roundPlan.id}: ${JSON.stringify(disposition.value)}`
                );
            }
            manager = await runtime.waitForAgent(ctx, manager.id);
            const publication = await callTargetToolResult(
                ctx,
                manager,
                "convivium_publish_round",
                {
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: publicationView.version,
                    requestId: `loop-publish-${roundPlan.id}-${attempt}`,
                    action: { kind: "publish_round", roundId }
                },
                nextCall()
            );
            if (publication.isError) {
                throw new Error(
                    `publish failed for ${roundPlan.id}: ${publication.error?.message}`
                );
            }
            if (publication.value?.kind === "accepted") {
                published = publication.value;
                break;
            }
            if (
                publication.value?.kind === "rejected" &&
                ["CONFLICT", "ROUND_NOT_CLOSABLE"].includes(publication.value.error?.code)
            ) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                continue;
            }
            throw new Error(
                `publish rejected for ${roundPlan.id}: ${JSON.stringify(publication.value)}`
            );
        }
        assert(
            published !== undefined,
            `publish did not settle for ${roundPlan.id}; state=${JSON.stringify({ version: publicationView.version, round: publicationView.rounds.find((round) => round.id === roundId), contributions: publicationView.contributions, reviews: publicationView.reviews, reviewDeliveries: publicationView.reviewDeliveries })}`
        );
        if (roundPlan.id === "decision") {
            assert(
                deferredHandRaiseContributorIds.includes(identities["contributor-e"]),
                "decision round did not defer the valid late hand raise"
            );
        }
        version = published.committedVersion;
        const publication = (await read()).publications.find(
            (candidate) => candidate.roundId === roundId
        );
        assert(publication, `publication is missing for ${roundPlan.id}`);
        roundTrace.push({
            ...roundPlan,
            planId,
            roundId,
            evidenceVersionIds: versionIds,
            publicationId: publication.id,
            deferredHandRaiseContributorIds,
            reviewIds: reviewedView.evidenceReviews
                .filter((review) => versionIds.includes(review.versionId))
                .map((review) => review.id)
        });
    }
    const ended = await runtimeApi.control(
        {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: version,
            requestId: "loop-end",
            action: {
                kind: "end_meeting",
                outcome: "partial",
                reason: "four fixture research stages complete",
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
            "four-fixture-rounds",
            "eight-version-reviews",
            "worker-authority",
            "four-published-rounds",
            "archived"
        ],
        observed: {
            status: archived.lifecycle.status,
            rounds: roundTrace,
            startedNoticeCounts,
            workerSessionIds: [...workerSessionIds],
            subtopicOrigin: "manager-round-goal"
        }
    });
}
