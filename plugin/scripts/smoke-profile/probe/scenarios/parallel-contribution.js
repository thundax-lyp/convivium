import { isDeepStrictEqual } from "node:util";

export async function runParallelContributionScenario(runtime) {
    const { ctx, browserMode, scenario } = runtime;
    const captain = runtime.captain.agent;
    const liveAgent = async (agent) =>
        ctx.agents.get(agent.id) ??
        runtime.resumeParticipantForProbe(
            ctx,
            captain,
            agent.id,
            `parallel-session-resume-${runtime.nextCall()}`
        );
    const call = async (agent, name, input) =>
        runtime.callTool(ctx, await liveAgent(agent), name, input, runtime.nextCall());
    const reject = async (agent, name, input, code) => {
        const outcome = await ctx.tools.execute({
            callId: "convivium-smoke-" + runtime.nextCall(),
            name,
            arguments: { input },
            agent: await liveAgent(agent),
            signal: new AbortController().signal
        });
        runtime.assert(
            outcome.isError === false && outcome.value?.ok === false && outcome.value.code === code,
            `${name} did not reject with ${code}: ${JSON.stringify(outcome.value)}`
        );
    };
    const waitForGenerationContext = (agentId, contributionId, purpose, generation) => {
        const prefix =
            purpose === "manager" ? "contribution manager context: " : "contribution context: ";
        return runtime.waitForInbox(ctx, agentId, (message) => {
            for (const text of runtime.messageTexts(message)) {
                if (!text.startsWith(prefix)) continue;
                try {
                    const context = JSON.parse(text.slice(prefix.length));
                    const task =
                        purpose === "manager"
                            ? context.work?.pending?.find((item) => item.id === contributionId)
                            : context.work?.task;
                    if (
                        context.purpose === purpose &&
                        task?.id === contributionId &&
                        task.generation === generation
                    )
                        return context;
                } catch {
                    // Ignore non-context text blocks.
                }
            }
            return undefined;
        });
    };
    const input = structuredClone(runtime.createInput());
    input.requestId = "parallel-create";
    input.topic = "Parallel evidence";
    input.objective = "Verify independent submissions";
    input.selectionMode = "manager";
    input.participants = [
        { participantKey: "a", displayName: "A" },
        { participantKey: "b", displayName: "B" },
        { participantKey: "reviewer", displayName: "Reviewer" }
    ];
    input.evidenceReviewerKey = "reviewer";
    input.objectiveContract = {
        requiredOutputs: [],
        acceptanceCriteria: [{ key: "verified", description: "deterministic evidence workflow" }],
        hardConstraints: [],
        requiredReviewerKeys: [],
        riskAcceptanceAuthorityKeys: [],
        acceptableRiskLevel: "low"
    };
    input.agenda = [
        {
            key: "topic",
            title: "Parallel evidence",
            objective: "Verify independent submissions",
            inScope: ["text evidence"],
            outOfScope: [],
            completionCriteria: ["verified"],
            requiredParticipantKeys: ["a", "b", "reviewer"]
        }
    ];
    input.limits = { maxTotalMessages: 8, maxDurationMs: 1_800_000 };
    if (browserMode) {
        captain.session.append(
            "user/message",
            {
                id: "convivium-parallel-browser-message",
                role: "user",
                content: [{ type: "text", text: "Parallel contribution Browser smoke" }],
                source: { kind: "user" }
            },
            { surfaceOp: "append" }
        );
        await ctx.sessions.flush(captain.session);
        await runtime.workspace.attachSession(captain.session.id);
    }
    const created = await call(captain, "convivium_create_meeting", input);
    const meetingId = created.result.meetingId;
    runtime.setMeetingId(meetingId);
    const status = () =>
        call(captain, "convivium_meeting_status", { protocolVersion: 1, meetingId });
    const sessionId = (key) => `${meetingId}-participant-participant-${key}`;
    let current = await status();
    let manager = await runtime.waitForAgent(ctx, `${meetingId}-manager-manager`);
    await runtime.waitForContributionContext(ctx, manager.id, undefined, "manager");
    const assign = async (participantId, requestId, requiresEvidenceReview) => {
        current = await status();
        return call(manager, "convivium_contribution", {
            protocolVersion: 1,
            meetingId,
            requestId,
            expectedMeetingVersion: current.meetingVersion,
            action: "assign",
            participantId,
            agendaItemId: current.result.activeAgendaItem.id,
            instruction: `Prepare ${participantId}`,
            targetIds: [],
            requiredForCompletion: false,
            requiresEvidenceReview
        });
    };
    const assignedA = await assign("participant-a", "parallel-assign-a", false);
    const assignedB = await assign("participant-b", "parallel-assign-b", true);
    const contributionA = assignedA.result.contributionId;
    const contributionB = assignedB.result.contributionId;
    const [deliveryA, deliveryB] = await Promise.all([
        runtime.waitForContributionContext(ctx, sessionId("a"), contributionA, "prepare"),
        runtime.waitForContributionContext(ctx, sessionId("b"), contributionB, "prepare")
    ]);
    const a = deliveryA.agent;
    const b = deliveryB.agent;
    const reviewer = await runtime.waitForObservedParticipant(ctx, meetingId, "reviewer");
    const participantSessionIds = [a.id, b.id, reviewer.id].map(String);
    runtime.assert(
        new Set(participantSessionIds).size === 3 &&
            contributionA !== contributionB &&
            deliveryA.value.work.task.generation === 1 &&
            deliveryB.value.work.task.generation === 1,
        "parallel contribution identities are not independent"
    );
    current = await status();
    const saveEvidence = await call(b, "convivium_contribution", {
        protocolVersion: 1,
        meetingId,
        requestId: "parallel-save-evidence-b",
        expectedMeetingVersion: current.meetingVersion,
        action: "save_evidence",
        contributionId: contributionB,
        generation: 1,
        expectedEvidenceRevision: 0,
        material: {
            title: "token observation",
            kind: "experiment",
            source: "probe fixture",
            sourceDate: "fixture",
            collectedAt: "fixture",
            locator: "fixture",
            observation: "amber-47",
            methodAndConditions: "fixture",
            limitations: "not applicable: deterministic text",
            dependencies: "not applicable: deterministic text",
            material: { kind: "text", text: "amber-47" }
        }
    });
    const evidenceKey = saveEvidence.result.evidenceKey;
    current = await status();
    const submitBInput = {
        protocolVersion: 1,
        meetingId,
        requestId: "parallel-submit-b",
        expectedMeetingVersion: current.meetingVersion,
        action: "submit",
        contributionId: contributionB,
        generation: 1,
        expectedDraftRevision: 0,
        basedOnSeq: 0,
        body: {
            kind: "statement",
            content:
                "主张：材料包含 amber-47；证据：固定材料；推断：逐字读取；反证条件：内容不同；不确定性：不代表外部事实。",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {}
        },
        citations: [
            {
                evidenceKey,
                claim: "material contains amber-47",
                locator: "full text",
                inference: "literal comparison"
            }
        ]
    };
    const submitB = await call(b, "convivium_contribution", submitBInput);
    current = await status();
    runtime.assert(
        current.result.contributions.tasks.find((task) => task.id === contributionA).phase ===
            "preparing" && current.result.messages.length === 0,
        "B waited for A or private draft became public"
    );
    await reject(
        a,
        "convivium_read_contribution",
        { protocolVersion: 1, meetingId, contributionId: contributionB, evidenceKey },
        "UNAUTHORIZED_CALLER"
    );
    const managerRead = await call(manager, "convivium_read_contribution", {
        protocolVersion: 1,
        meetingId,
        contributionId: contributionB,
        draftRevision: 1,
        evidenceKey
    });
    runtime.assert(
        managerRead.result.evidence.material.text === "amber-47",
        "Manager exact read failed"
    );
    await reject(
        b,
        "convivium_contribution",
        {
            protocolVersion: 1,
            meetingId,
            requestId: "parallel-self-review-b",
            expectedMeetingVersion: current.meetingVersion,
            action: "evidence_review",
            contributionId: contributionB,
            generation: 1,
            draftRevision: 1,
            reviews: [
                {
                    evidenceKey,
                    claim: "material contains amber-47",
                    verdict: "supports",
                    method: "literal comparison",
                    result: "amber-47 matched",
                    limitations: "fixture only"
                }
            ]
        },
        "UNAUTHORIZED_CALLER"
    );
    const approveBInput = {
        protocolVersion: 1,
        meetingId,
        requestId: "parallel-approve-b",
        expectedMeetingVersion: current.meetingVersion,
        action: "boundary_review",
        contributionId: contributionB,
        generation: 1,
        draftRevision: 1,
        decision: "approve",
        reason: "Within scope",
        checkedThroughSeq: 0
    };
    const approvedB = await call(manager, "convivium_contribution", approveBInput);
    const publicRead = await call(a, "convivium_read_contribution", {
        protocolVersion: 1,
        meetingId,
        contributionId: contributionB,
        draftRevision: 1,
        evidenceKey
    });
    runtime.assert(
        publicRead.result.evidence.material.text === "amber-47",
        "public exact read failed"
    );
    const reviewDelivery = await runtime.waitForContributionContext(
        ctx,
        sessionId("reviewer"),
        contributionB,
        "evidence_review"
    );
    const reviewerRead = await call(reviewDelivery.agent, "convivium_read_contribution", {
        protocolVersion: 1,
        meetingId,
        contributionId: contributionB,
        draftRevision: 1,
        evidenceKey
    });
    runtime.assert(
        reviewerRead.result.evidence.material.text === "amber-47",
        "reviewer did not read material"
    );
    current = await status();
    await call(reviewDelivery.agent, "convivium_contribution", {
        protocolVersion: 1,
        meetingId,
        requestId: "parallel-review-b",
        expectedMeetingVersion: current.meetingVersion,
        action: "evidence_review",
        contributionId: contributionB,
        generation: 1,
        draftRevision: 1,
        reviews: [
            {
                evidenceKey,
                claim: "material contains amber-47",
                verdict: "supports",
                method: "literal comparison",
                result: "amber-47 matched",
                limitations: "fixture only"
            }
        ]
    });
    const replayB = await call(b, "convivium_contribution", submitBInput);
    const replayApproval = await call(manager, "convivium_contribution", approveBInput);
    runtime.assert(
        isDeepStrictEqual(replayB, submitB) && isDeepStrictEqual(replayApproval, approvedB),
        "publication replay changed receipts"
    );
    await reject(
        b,
        "convivium_contribution",
        { ...submitBInput, body: { ...submitBInput.body, content: "different" } },
        "IDEMPOTENCY_CONFLICT"
    );
    current = await status();
    const submitAInput = {
        protocolVersion: 1,
        meetingId,
        requestId: "parallel-submit-a-1",
        expectedMeetingVersion: current.meetingVersion,
        action: "submit",
        contributionId: contributionA,
        generation: 1,
        expectedDraftRevision: 0,
        basedOnSeq: 1,
        body: {
            kind: "statement",
            content: "A private returned draft",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {}
        },
        citations: []
    };
    await call(a, "convivium_contribution", submitAInput);
    current = await status();
    const returnAInput = {
        protocolVersion: 1,
        meetingId,
        requestId: "parallel-return-a",
        expectedMeetingVersion: current.meetingVersion,
        action: "boundary_review",
        contributionId: contributionA,
        generation: 1,
        draftRevision: 1,
        decision: "return",
        reason: "补充反证条件",
        checkedThroughSeq: 1
    };
    await call(manager, "convivium_contribution", returnAInput);
    current = await status();
    await reject(
        manager,
        "convivium_contribution",
        {
            ...returnAInput,
            requestId: "parallel-stale-approve-a",
            expectedMeetingVersion: current.meetingVersion,
            decision: "approve"
        },
        "STALE_ATTEMPT"
    );
    const beforePause = current.result.contributions.tasks.find(
        (task) => task.id === contributionA
    );
    const paused = await call(captain, "convivium_pause_meeting", {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: current.meetingVersion,
        requestId: "parallel-pause",
        reason: "generation check"
    });
    await reject(
        a,
        "convivium_contribution",
        {
            ...submitAInput,
            requestId: "parallel-stale-submit-a",
            expectedMeetingVersion: paused.meetingVersion,
            generation: beforePause.generation,
            expectedDraftRevision: 1
        },
        "INVALID_STATE_TRANSITION"
    );
    await call(captain, "convivium_resume_meeting", {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: paused.meetingVersion,
        requestId: "parallel-resume"
    });
    current = await status();
    const resumedTask = current.result.contributions.tasks.find(
        (task) => task.id === contributionA
    );
    runtime.assert(
        resumedTask.generation > beforePause.generation,
        "resume did not advance generation"
    );
    const resumedDelivery = await waitForGenerationContext(
        sessionId("a"),
        contributionA,
        "prepare",
        resumedTask.generation
    );
    const finalAuthor = resumedDelivery.agent;
    current = await status();
    const finalGeneration = current.result.contributions.tasks.find(
        (task) => task.id === contributionA
    ).generation;
    const finalAInput = {
        ...submitAInput,
        requestId: "parallel-submit-a-2",
        expectedMeetingVersion: current.meetingVersion,
        generation: finalGeneration,
        expectedDraftRevision: 1,
        body: {
            ...submitAInput.body,
            content:
                "主张：A 完成；证据：固定流程；推断：状态回读；反证条件：状态不符；不确定性：仅代表夹具。"
        }
    };
    await call(finalAuthor, "convivium_contribution", finalAInput);
    const finalManagerDelivery = await waitForGenerationContext(
        manager.id,
        contributionA,
        "manager",
        finalGeneration
    );
    manager = finalManagerDelivery.agent;
    current = await runtime.callTool(
        ctx,
        manager,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        runtime.nextCall()
    );
    const finalTask = current.result.contributions.tasks.find((task) => task.id === contributionA);
    const finalApproval = await ctx.tools.execute({
        callId: "convivium-smoke-" + runtime.nextCall(),
        name: "convivium_contribution",
        arguments: {
            input: {
                protocolVersion: 1,
                meetingId,
                requestId: "parallel-approve-a",
                expectedMeetingVersion: current.meetingVersion,
                action: "boundary_review",
                contributionId: contributionA,
                generation: finalTask.generation,
                draftRevision: finalTask.currentDraftRevision,
                decision: "approve",
                reason: "Complete five-part statement",
                checkedThroughSeq: current.result.messages.length
            }
        },
        agent: manager,
        signal: new AbortController().signal
    });
    runtime.assert(
        finalApproval.isError === false && finalApproval.value?.ok === true,
        `final A approval failed: ${JSON.stringify({ result: finalApproval.value, task: finalTask, meetingVersion: current.meetingVersion, messages: current.result.messages.length })}`
    );
    current = await status();
    runtime.assert(
        current.result.messages.length === 2 &&
            current.result.messages.every(
                (message) =>
                    message.contributionId &&
                    message.contributionRevision &&
                    !Object.hasOwn(message, "turnId") &&
                    !Object.hasOwn(message, "attemptId")
            ) &&
            !JSON.stringify(current.result.messages).includes("A private returned draft"),
        "public transcript contains legacy origin or private draft"
    );
    const messageIds = current.result.messages.map((message) => message.id);
    const assertions = [
        "parallel-inflight",
        "private-before-approval",
        "public-exact-version",
        "independent-review",
        "idempotent-publication",
        "stale-rejected",
        "pause-resume-generations"
    ];
    if (!browserMode) {
        await call(captain, "convivium_end_meeting", {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: current.meetingVersion,
            outcome: "partial",
            reason: "parallel contribution probe",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: [],
            requestId: "parallel-end"
        });
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            current = await status();
            if (current.result.status === "archived") break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        runtime.assert(current.result.status === "archived", "parallel Meeting did not archive");
        const archivedEvidence = await call(captain, "convivium_read_contribution", {
            protocolVersion: 1,
            meetingId,
            contributionId: contributionB,
            draftRevision: 1,
            evidenceKey
        });
        runtime.assert(
            archivedEvidence.result.evidence.material.text === "amber-47",
            "archived material changed"
        );
        assertions.push("archived-material-readable");
    }
    await runtime.writeResult({
        ok: true,
        scenario,
        browserReady: browserMode,
        meetingId,
        captainSessionId: "convivium-smoke-captain",
        assertions,
        observed: {
            participantSessionIds,
            contributionIds: [contributionA, contributionB],
            messageIds,
            evidenceKey,
            reviewVerdict: "supports",
            status: current.result.status,
            meetingVersion: current.meetingVersion
        }
    });
}
