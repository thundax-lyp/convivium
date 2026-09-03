export async function runTaskHandraiseScenario(runtime) {
    const { ctx, scenario } = runtime;
    const taskInput = runtime.createInput();
    taskInput.agenda[0].requiredParticipantKeys = ["a"];
    const created = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_create_meeting",
        taskInput,
        400
    );
    const meetingId = created.result.meetingId;
    const initialStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        401
    );
    const manager = await runtime.waitForAgent(ctx, meetingId + "-manager-manager");
    const firstPlan = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: meetingId + "-planning-1",
            observedMeetingVersion: initialStatus.meetingVersion,
            requestId: "smoke-task-plan-1",
            agendaItemId: initialStatus.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Create and finish task evidence",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-a",
                    instruction: "Create task evidence",
                    reason: "manager_selected"
                }
            ]
        },
        402
    );
    const participantSessionId = meetingId + "-participant-participant-a";
    const firstDelivery = await runtime.waitForSpeakerContext(
        ctx,
        participantSessionId,
        firstPlan.result.firstAttemptId
    );
    const firstEnvelope = firstDelivery.value;
    const firstAgent = firstDelivery.agent;
    const task = await runtime.callTool(
        ctx,
        firstAgent,
        "convivium_create_meeting_task",
        {
            protocolVersion: 1,
            meetingId,
            attemptId: firstEnvelope.attempt.attemptId,
            requestId: "smoke-task-create-1",
            title: "smoke task",
            description: "produce evidence",
            blocking: false
        },
        403
    );
    const meetingTaskId = task.result.meetingTaskId;
    await runtime.callTool(
        ctx,
        firstAgent,
        "convivium_submit_turn",
        {
            protocolVersion: 1,
            meetingId,
            turnId: firstEnvelope.turn.id,
            stepId: firstEnvelope.step.id,
            attemptId: firstEnvelope.attempt.attemptId,
            deliveryId: firstEnvelope.attempt.deliveryId,
            agendaItemId: firstEnvelope.activeAgendaItem.id,
            kind: "statement",
            content: "task-handraise:a:1",
            mentions: [],
            taskIds: [meetingTaskId],
            agendaRelation: "on_topic",
            changes: {}
        },
        404
    );
    const taskDelivery = await runtime.waitForTaskDelivery(
        ctx,
        participantSessionId,
        meetingTaskId
    );
    const delivery = taskDelivery.value;
    const taskAgent = taskDelivery.agent;
    const taskStatusPre = await runtime.callTool(
        ctx,
        taskAgent,
        "convivium_meeting_task_status",
        { protocolVersion: 1, meetingId, meetingTaskId },
        405
    );
    runtime.assert(
        taskStatusPre.result.task.status === "queued",
        "MeetingTask was not delivered as queued"
    );
    const started = await runtime.callTool(
        ctx,
        taskAgent,
        "convivium_start_meeting_task",
        { protocolVersion: 1, meetingId, meetingTaskId, requestId: delivery.deliveryId },
        406
    );
    runtime.assert(started.result.status === "running", "MeetingTask did not start");
    const statusAgent = await runtime.resumeParticipantForProbe(
        ctx,
        runtime.captain.agent,
        participantSessionId,
        "convivium-smoke-task-status-post"
    );
    const taskStatusPost = await runtime.callTool(
        ctx,
        statusAgent,
        "convivium_meeting_task_status",
        { protocolVersion: 1, meetingId, meetingTaskId },
        407
    );
    runtime.assert(
        taskStatusPost.result.task.status === "running" &&
            taskStatusPost.result.mayExecute === true,
        "MeetingTask running projection mismatch"
    );
    const finishAgent = await runtime.resumeParticipantForProbe(
        ctx,
        runtime.captain.agent,
        participantSessionId,
        "convivium-smoke-task-finish"
    );
    const finished = await runtime.callTool(
        ctx,
        finishAgent,
        "convivium_finish_meeting_task",
        {
            protocolVersion: 1,
            meetingId,
            meetingTaskId,
            requestId: delivery.deliveryId,
            executionId: delivery.executionId,
            status: "completed",
            resultSummary: "task evidence"
        },
        408
    );
    const handRaiseId = finished.result.handRaiseId;
    runtime.assert(
        typeof handRaiseId === "string" && handRaiseId.length > 0,
        "MeetingTask finish omitted HandRaise"
    );
    const handRaiseStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        409
    );
    runtime.assert(
        handRaiseStatus.result.pendingHandRaises.some((raise) => raise.id === handRaiseId),
        "finished task HandRaise is not visible"
    );
    const managerSessionId = meetingId + "-manager-manager";
    const secondManager = await runtime.resumeParticipantForProbe(
        ctx,
        runtime.captain.agent,
        managerSessionId,
        "convivium-smoke-manager-plan-2"
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
            requestId: "smoke-task-plan-2",
            agendaItemId: handRaiseStatus.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Consume task hand raise",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-a",
                    instruction: "Submit task evidence",
                    reason: "manager_selected"
                }
            ]
        },
        410
    );
    const laterDelivery = await runtime.waitForSpeakerContext(
        ctx,
        participantSessionId,
        secondPlan.result.firstAttemptId
    );
    const laterEnvelope = laterDelivery.value;
    await runtime.callTool(
        ctx,
        laterDelivery.agent,
        "convivium_submit_turn",
        {
            protocolVersion: 1,
            meetingId,
            turnId: laterEnvelope.turn.id,
            stepId: laterEnvelope.step.id,
            attemptId: laterEnvelope.attempt.attemptId,
            deliveryId: laterEnvelope.attempt.deliveryId,
            agendaItemId: laterEnvelope.activeAgendaItem.id,
            kind: "evidence",
            content: "task-handraise:a:2",
            mentions: [],
            taskIds: [meetingTaskId],
            agendaRelation: "on_topic",
            changes: {}
        },
        411
    );
    const finalStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        412
    );
    runtime.assert(
        finalStatus.result.pendingHandRaises.every((raise) => raise.id !== handRaiseId),
        "HandRaise remained pending after later plan"
    );
    runtime.assert(
        finalStatus.result.messages.at(-1)?.content === "task-handraise:a:2",
        "later task evidence was not submitted"
    );
    await runtime.writeResult({
        ok: true,
        scenario,
        assertions: [
            "task-delivered",
            "task-started",
            "finish-created-handraise",
            "handraise-visible-then-consumed",
            "later-turn-submitted"
        ],
        meetingId,
        observed: {
            meetingTaskId,
            delivery,
            handRaiseId,
            firstMessageId: finalStatus.result.messages[0]?.id,
            laterMessageId: finalStatus.result.messages.at(-1)?.id
        }
    });
}

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
