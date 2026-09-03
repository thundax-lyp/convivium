export async function runRiskReopenScenario(runtime) {
    const { ctx, scenario, captain } = runtime;
    const riskInput = runtime.createInput();
    riskInput.agenda[0].requiredParticipantKeys = ["a"];
    riskInput.objectiveContract.riskAcceptanceAuthorityKeys = ["a"];
    riskInput.objectiveContract.acceptableRiskLevel = "high";
    const created = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_create_meeting",
        riskInput,
        600
    );
    runtime.setMeetingId(created.result.meetingId);
    const meetingId = created.result.meetingId;
    const status = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        601
    );
    const manager = await runtime.waitForAgent(ctx, meetingId + "-manager-manager");
    const plan = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: meetingId + "-planning-1",
            observedMeetingVersion: status.meetingVersion,
            requestId: "smoke-risk-plan-1",
            agendaItemId: status.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Risk evidence",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-a",
                    instruction: "Report risk",
                    reason: "manager_selected"
                }
            ]
        },
        602
    );
    const delivery = await runtime.waitForSpeakerContext(
        ctx,
        meetingId + "-participant-participant-a",
        plan.result.firstAttemptId
    );
    const submitted = await runtime.callTool(
        ctx,
        delivery.agent,
        "convivium_submit_turn",
        {
            protocolVersion: 1,
            meetingId,
            turnId: delivery.value.turn.id,
            stepId: delivery.value.step.id,
            attemptId: delivery.value.attempt.attemptId,
            deliveryId: delivery.value.attempt.deliveryId,
            agendaItemId: delivery.value.activeAgendaItem.id,
            kind: "statement",
            content: "risk",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {
                proposals: [],
                positions: [],
                issues: [
                    {
                        title: "smoke risk",
                        description: "smoke risk",
                        affectedOutputIds: [],
                        affectedCriterionIds: ["criterion-smoke-order"],
                        violatedConstraintIds: [],
                        impact: "high",
                        urgency: "now",
                        safeDefaultAvailable: false,
                        riskLevel: "high"
                    }
                ],
                decisionProposals: [],
                agendaCandidates: []
            }
        },
        603
    );
    const afterIssue = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        604
    );
    const issueCandidates = afterIssue.result.blockingFacts ?? [];
    const issueId = issueCandidates.find(
        (fact) => fact.kind === "issue" && fact.summary === "smoke risk"
    )?.id;
    runtime.assert(issueId, "risk issue missing");
    const input = {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: afterIssue.meetingVersion,
        requestId: "smoke-risk-dispose-1",
        issueId,
        decision: "accept",
        reason: "smoke accepted risk",
        evidenceMessageIds: [submitted.result.messageId]
    };
    const disposed = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_dispose_risk",
        input,
        605
    );
    const replay = await runtime.callTool(ctx, captain.agent, "convivium_dispose_risk", input, 606);
    runtime.assert(
        JSON.stringify(replay.result) === JSON.stringify(disposed.result),
        "risk replay mismatch"
    );
    let conflict;
    try {
        await runtime.callTool(
            ctx,
            captain.agent,
            "convivium_dispose_risk",
            { ...input, reason: "different" },
            607
        );
    } catch (error) {
        conflict = String(error);
    }
    runtime.assert(conflict?.includes("IDEMPOTENCY_CONFLICT"), "risk idempotency conflict missing");
    await runtime.writeResult({
        ok: true,
        scenario,
        assertions: ["risk-disposed", "risk-replay-stable", "risk-idempotency-conflict"],
        meetingId,
        observed: {
            issueId,
            handRaiseId: disposed.result.completionFactId,
            receipt: disposed.result
        }
    });
}
