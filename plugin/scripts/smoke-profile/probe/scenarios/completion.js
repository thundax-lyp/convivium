export async function runCompletionEndScenario(runtime) {
    const { ctx, scenario } = runtime;
    const completionInput = runtime.createInput();
    completionInput.objectiveContract.requiredOutputs = [
        { key: "smoke-output", description: "Smoke output" }
    ];
    completionInput.objectiveContract.acceptanceCriteria = [
        { key: "smoke-criterion", description: "Smoke criterion" }
    ];
    completionInput.agenda[0].completionCriteria = ["smoke-criterion"];
    completionInput.agenda[0].requiredParticipantKeys = ["a"];
    const created = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_create_meeting",
        completionInput,
        500
    );
    const meetingId = created.result.meetingId;
    const initialStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        501
    );
    const managerSessionId = meetingId + "-manager-manager";
    const manager = await runtime.waitForAgent(ctx, managerSessionId);
    const firstPlan = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: meetingId + "-planning-1",
            observedMeetingVersion: initialStatus.meetingVersion,
            requestId: "smoke-completion-plan-1",
            agendaItemId: initialStatus.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Produce initial completion evidence",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-a",
                    instruction: "Submit initial evidence",
                    reason: "manager_selected"
                }
            ]
        },
        502
    );
    const participantSessionId = meetingId + "-participant-participant-a";
    const firstDelivery = await runtime.waitForSpeakerContext(
        ctx,
        participantSessionId,
        firstPlan.result.firstAttemptId
    );
    const firstEnvelope = firstDelivery.value;
    const firstSubmit = await runtime.callTool(
        ctx,
        firstDelivery.agent,
        "convivium_submit_turn",
        {
            protocolVersion: 1,
            meetingId,
            turnId: firstEnvelope.turn.id,
            stepId: firstEnvelope.step.id,
            attemptId: firstEnvelope.attempt.attemptId,
            deliveryId: firstEnvelope.attempt.deliveryId,
            agendaItemId: firstEnvelope.activeAgendaItem.id,
            kind: "evidence",
            content: "completion-end:a:1",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {}
        },
        503
    );
    const afterFirst = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        504
    );
    const secondManager = await runtime.resumeParticipantForProbe(
        ctx,
        runtime.captain.agent,
        managerSessionId,
        "convivium-smoke-completion-plan-2"
    );
    const managerContext = await runtime.waitForStoredManagerContext(
        managerSessionId,
        meetingId,
        firstPlan.result.planningAttemptId ?? meetingId + "-planning-1"
    );
    const secondPlan = await runtime.callTool(
        ctx,
        secondManager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: managerContext.planningAttemptId,
            observedMeetingVersion: managerContext.meetingVersion,
            requestId: "smoke-completion-plan-2",
            agendaItemId: afterFirst.result.activeAgendaItem.id,
            intent: "synthesize",
            objective: "Submit completion claims",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-a",
                    instruction: "Submit completion claims",
                    reason: "manager_selected"
                }
            ]
        },
        505
    );
    const secondDelivery = await runtime.waitForSpeakerContext(
        ctx,
        participantSessionId,
        secondPlan.result.firstAttemptId
    );
    const sameStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        506
    );
    const outputId = secondDelivery.value.objectiveContract.requiredOutputs[0]?.id;
    const criterionId = secondDelivery.value.objectiveContract.acceptanceCriteria[0]?.id;
    runtime.assert(outputId && criterionId, "completion fixture identifiers are missing");
    const completionInputForRace = {
        protocolVersion: 1,
        meetingId,
        turnId: secondDelivery.value.turn.id,
        stepId: secondDelivery.value.step.id,
        attemptId: secondDelivery.value.attempt.attemptId,
        deliveryId: secondDelivery.value.attempt.deliveryId,
        agendaItemId: secondDelivery.value.activeAgendaItem.id,
        kind: "evidence",
        content: "completion-end:a:2",
        mentions: [],
        taskIds: [],
        agendaRelation: "on_topic",
        changes: {},
        completionClaims: {
            outputClaims: [
                {
                    subjectId: outputId,
                    evidenceMessageIds: [firstSubmit.result.messageId],
                    taskIds: []
                }
            ],
            criterionClaims: [
                {
                    subjectId: criterionId,
                    evidenceMessageIds: [firstSubmit.result.messageId],
                    taskIds: []
                }
            ]
        }
    };
    const endInput = {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: sameStatus.meetingVersion,
        outcome: "partial",
        reason: "smoke competition",
        acceptedDecisionIds: [],
        deferredAgendaItemIds: [],
        waivers: [],
        requestId: "smoke-completion-end-1"
    };
    const raceParticipant = await runtime.resumeParticipantForProbe(
        ctx,
        runtime.captain.agent,
        participantSessionId,
        "convivium-smoke-completion-race"
    );
    const executeRaw = (agent, name, input, index) =>
        ctx.tools.execute({
            callId: "convivium-smoke-" + index,
            name,
            arguments: { input },
            agent,
            signal: new AbortController().signal
        });
    const raced = await Promise.allSettled([
        executeRaw(raceParticipant, "convivium_submit_turn", completionInputForRace, 507),
        executeRaw(runtime.captain.agent, "convivium_end_meeting", endInput, 508)
    ]);
    const raceValues = raced.map((entry) =>
        entry.status === "fulfilled" ? entry.value.value : undefined
    );
    const successes = raceValues.filter((value) => value?.ok === true);
    const failures = raceValues.filter((value) => value?.ok === false);
    runtime.assert(
        successes.length === 1 && failures.length === 1,
        "completion/end race did not produce one winner: " + JSON.stringify(raceValues)
    );
    const failureCode = failures[0].code;
    runtime.assert(
        [
            "VERSION_CONFLICT",
            "IMMUTABLE_MEETING",
            "ARCHIVED_MEETING",
            "STALE_ATTEMPT",
            "UNAUTHORIZED_CALLER"
        ].includes(failureCode),
        "completion/end race returned an unexpected loser: " + JSON.stringify(failures[0])
    );
    const terminalStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        509
    );
    runtime.assert(
        ["completed", "partial", "archiving", "archived"].includes(terminalStatus.result.status),
        "completion/end race did not reach a terminal status"
    );
    runtime.assert(terminalStatus.result.termination, "completion/end race omitted termination");
    const lateSubmit = await executeRaw(
        raceParticipant,
        "convivium_submit_turn",
        completionInputForRace,
        510
    );
    const lateEnd = await executeRaw(
        runtime.captain.agent,
        "convivium_end_meeting",
        {
            ...endInput,
            expectedMeetingVersion: terminalStatus.meetingVersion,
            requestId: "smoke-completion-end-late"
        },
        511
    );
    runtime.assert(
        (lateSubmit.value?.ok === false &&
            ["IMMUTABLE_MEETING", "ARCHIVED_MEETING", "UNAUTHORIZED_CALLER"].includes(
                lateSubmit.value.code
            )) ||
            (lateSubmit.isError === true &&
                (String(lateSubmit.error?.message).includes(
                    "caller Session capability has been revoked"
                ) ||
                    String(lateSubmit.error?.message).includes("is not live in this store"))),
        "terminal submit was not rejected: " +
            JSON.stringify({ value: lateSubmit.value, error: lateSubmit.error?.message })
    );
    runtime.assert(
        lateEnd.value?.ok === false &&
            ["IMMUTABLE_MEETING", "ARCHIVED_MEETING"].includes(lateEnd.value.code),
        "terminal end was not rejected: " + JSON.stringify(lateEnd.value)
    );
    await runtime.writeResult({
        ok: true,
        scenario,
        assertions: [
            "single-winner",
            "single-termination",
            "terminal-submit-rejected",
            "terminal-end-rejected"
        ],
        meetingId,
        observed: {
            winnerStatus: successes[0].result?.status ?? successes[0].result?.meetingStatus,
            loserCode: failureCode,
            termination: terminalStatus.result.termination
        }
    });
}
