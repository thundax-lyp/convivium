export async function runArchiveContinuationScenario(runtime) {
    const { ctx, scenario } = runtime;
    const sourceInput = runtime.createInput();
    sourceInput.agenda[0].requiredParticipantKeys = ["a"];
    const created = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_create_meeting",
        sourceInput,
        800
    );
    const sourceMeetingId = created.result.meetingId;
    const status = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId: sourceMeetingId },
        801
    );
    const manager = await runtime.waitForAgent(ctx, sourceMeetingId + "-manager-manager");
    const plan = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId: sourceMeetingId,
            planningAttemptId: sourceMeetingId + "-planning-1",
            observedMeetingVersion: status.meetingVersion,
            requestId: "smoke-archive-plan-1",
            agendaItemId: status.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Archive source",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                { participantId: "participant-a", instruction: "A", reason: "manager_selected" }
            ]
        },
        802
    );
    const delivery = await runtime.waitForSpeakerContext(
        ctx,
        sourceMeetingId + "-participant-participant-a",
        plan.result.firstAttemptId
    );
    const submitted = await runtime.callTool(
        ctx,
        delivery.agent,
        "convivium_submit_turn",
        {
            protocolVersion: 1,
            meetingId: sourceMeetingId,
            turnId: delivery.value.turn.id,
            stepId: delivery.value.step.id,
            attemptId: delivery.value.attempt.attemptId,
            deliveryId: delivery.value.attempt.deliveryId,
            agendaItemId: delivery.value.activeAgendaItem.id,
            kind: "statement",
            content: "archive-continuation:a:1",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {
                questions: [],
                proposals: [],
                positions: [],
                issues: [],
                decisionProposals: [],
                agendaCandidates: []
            }
        },
        803
    );
    const beforeEnd = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId: sourceMeetingId },
        805
    );
    await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_end_meeting",
        {
            protocolVersion: 1,
            meetingId: sourceMeetingId,
            expectedMeetingVersion: beforeEnd.meetingVersion,
            outcome: "partial",
            reason: "smoke archive",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: [],
            requestId: "smoke-archive-end-1"
        },
        804
    );
    const archiveDeadline = Date.now() + 30000;
    let archived;
    while (Date.now() < archiveDeadline) {
        const candidate = await runtime.callTool(
            ctx,
            runtime.captain.agent,
            "convivium_meeting_status",
            { protocolVersion: 1, meetingId: sourceMeetingId },
            805
        );
        if (candidate.result.status === "archived") {
            archived = candidate;
            break;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    runtime.assert(archived, "source Meeting did not archive");
    const sourceSessionIds = [manager.id, delivery.agent.id];
    runtime.assert(
        sourceSessionIds.every((id) => ctx.agents.get(id) === undefined),
        "source Session remained resident after archive"
    );
    const sourceChildren = await ctx.subagents.listChildren(
        runtime.captain.agent.session.id,
        new AbortController().signal
    );
    runtime.assert(
        sourceSessionIds.every((id) =>
            sourceChildren.some((child) => child.id === id && child.activity === "inactive")
        ),
        "source durable child did not drain"
    );
    const targetInput = runtime.createInput();
    targetInput.requestId = "smoke-archive-target-1";
    targetInput.topic = "Runtime smoke continuation";
    targetInput.agenda[0].requiredParticipantKeys = ["a"];
    targetInput.continuation = {
        sourceMeetingId,
        includeFinalSummary: true,
        decisionIds: [],
        unresolvedIssueIds: [],
        riskIds: [],
        evidenceIds: [],
        artifactIds: []
    };
    const targetCreated = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_create_meeting",
        targetInput,
        806
    );
    const targetMeetingId = targetCreated.result.meetingId;
    const targetStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId: targetMeetingId },
        807
    );
    const targetManager = await runtime.waitForAgent(ctx, targetMeetingId + "-manager-manager");
    const targetParticipant = await runtime.waitForAgent(
        ctx,
        targetMeetingId + "-participant-participant-a"
    );
    const targetSessionIds = [targetManager.id, targetParticipant.id];
    runtime.assert(sourceMeetingId !== targetMeetingId, "continuation reused source Meeting ID");
    runtime.assert(
        sourceSessionIds.every((id) => !targetSessionIds.includes(id)),
        "continuation reused source Session ID"
    );
    runtime.assert(
        targetStatus.result.continuationMaterials.length === 1 &&
            targetStatus.result.continuationMaterials[0].sourceKind === "final_summary" &&
            targetStatus.result.continuationMaterials[0].sourceMeetingId === sourceMeetingId,
        "continuation material is not final-summary-only"
    );
    await runtime.writeResult({
        ok: true,
        scenario,
        assertions: [
            "source-archived",
            "source-sessions-drained",
            "continuation-final-summary-only",
            "target-identities-new"
        ],
        observed: {
            sourceMeetingId,
            targetMeetingId,
            sourceMessageId: submitted.result.messageId,
            sourceStatus: archived.result.status,
            sourceSessionIds,
            targetSessionIds,
            continuationMaterials: targetStatus.result.continuationMaterials,
            sourceChildren: sourceChildren
                .filter((child) => sourceSessionIds.includes(child.id))
                .map((child) => ({ id: child.id, mode: child.mode, activity: child.activity }))
        }
    });
}
