export async function runReassignScenario(runtime) {
    const { ctx, scenario, captain } = runtime;
    const reassignInput = runtime.createInput();
    reassignInput.agenda[0].requiredParticipantKeys = ["a"];
    const created = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_create_meeting",
        reassignInput,
        300
    );
    runtime.setMeetingId(created.result.meetingId);
    const meetingId = created.result.meetingId;
    const manager = await runtime.waitForAgent(ctx, meetingId + "-manager-manager");
    await runtime.waitForObservedParticipant(ctx, meetingId, "a");
    const _planned = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: meetingId + "-planning-1",
            observedMeetingVersion: created.meetingVersion,
            requestId: "smoke-reassign-plan-1",
            agendaItemId: "agenda-agenda-1",
            intent: "explore",
            objective: "Reassign A to B",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                { participantId: "participant-a", instruction: "A", reason: "manager_selected" }
            ]
        },
        301
    );
    const before = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        302
    );
    const oldAttemptId =
        before.result.currentTurn?.steps?.[0]?.attemptId ?? before.result.currentAttemptId;
    const oldAgent = await runtime.waitForObservedParticipant(ctx, meetingId, "a");
    const oldChildId = oldAgent.id;
    const replacementParticipantId = created.result.participants.find(
        (p) => p.participantKey === "b"
    )?.participantId;
    runtime.assert(oldAttemptId && replacementParticipantId, "reassign identifiers missing");
    if (runtime.browserMode) {
        captain.agent.session.append(
            "user/message",
            {
                id: "convivium-reassign-browser-message",
                role: "user",
                content: [{ type: "text", text: "Browser reassign evidence session" }],
                source: { kind: "user" }
            },
            { surfaceOp: "append" }
        );
        await ctx.sessions.flush(captain.agent.session);
        runtime.assert(runtime.workspace !== undefined, "browser smoke workspace missing");
        await runtime.workspace.attachSession(runtime.captain.agent.session.id);
        runtime.assert(
            before.result.status === "running" &&
                before.result.currentSpeakerId === "participant-a" &&
                before.result.currentAttemptId === oldAttemptId,
            "browser reassign fixture is not ready"
        );
        await runtime.writeResult({
            ok: true,
            scenario,
            browserReady: true,
            assertions: ["browser-reassign-ready"],
            meetingId,
            captainSessionId: captain.agent.session.id,
            observed: {
                oldAttemptId,
                currentSpeakerId: "participant-a",
                currentAttemptId: oldAttemptId,
                meetingVersion: before.meetingVersion
            }
        });
        return;
    }
    const reassigned = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_reassign_turn",
        {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: before.meetingVersion,
            currentAttemptId: oldAttemptId,
            action: "reassign",
            replacementParticipantId,
            reason: "smoke reassign",
            requestId: "smoke-reassign-1"
        },
        303
    );
    runtime.assert(
        reassigned.result.revokedAttemptId === oldAttemptId,
        "reassign revoked attempt mismatch"
    );
    runtime.assert(
        typeof reassigned.result.replacementAttemptId === "string" &&
            reassigned.result.replacementAttemptId !== oldAttemptId,
        "replacement attempt invalid: " + JSON.stringify(reassigned.result)
    );
    const drainDeadline = Date.now() + 30000;
    while (ctx.agents.get(oldChildId) !== undefined && Date.now() < drainDeadline)
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    runtime.assert(
        ctx.agents.get(oldChildId) === undefined,
        "reassigned old activation still resident"
    );
    const after = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        304
    );
    runtime.assert(
        after.result.currentSpeakerId === "participant-b",
        "replacement speaker is not participant-b"
    );
    runtime.assert(
        after.result.currentAttemptId === reassigned.result.replacementAttemptId,
        "replacement attempt is not current"
    );
    const replacement = await runtime.waitForObservedParticipant(ctx, meetingId, "b");
    runtime.assert(
        ctx.agents.get(replacement.id) === replacement,
        "replacement Agent is not live in store"
    );
    const envelope = await runtime.waitForInbox(ctx, replacement.id, (message) => {
        const text = runtime.messageText(message);
        const marker = typeof text === "string" ? text.indexOf("speaker context: ") : -1;
        if (marker < 0) return undefined;
        try {
            return JSON.parse(text.slice(marker + "speaker context: ".length));
        } catch {
            return undefined;
        }
    });
    runtime.assert(
        envelope.value.meetingId === meetingId &&
            envelope.value.step?.participantId === replacementParticipantId &&
            envelope.value.attempt?.attemptId === reassigned.result.replacementAttemptId,
        "replacement speaker context missing or mismatched: " +
            JSON.stringify({
                meetingId: envelope.value.meetingId,
                turn: envelope.value.turn?.id,
                step: envelope.value.step?.id,
                participantId: envelope.value.step?.participantId,
                attemptId: envelope.value.attempt?.attemptId,
                deliveryId: envelope.value.attempt?.deliveryId,
                agendaItemId: envelope.value.activeAgendaItem?.id
            })
    );
    runtime.assert(
        typeof envelope.value.turn?.id === "string" &&
            typeof envelope.value.step?.id === "string" &&
            typeof envelope.value.attempt?.attemptId === "string" &&
            typeof envelope.value.attempt?.deliveryId === "string" &&
            typeof envelope.value.activeAgendaItem?.id === "string",
        "replacement speaker context fields incomplete"
    );
    const submittingReplacement = await runtime.waitForObservedParticipant(ctx, meetingId, "b");
    runtime.assert(
        ctx.agents.get(submittingReplacement.id) === submittingReplacement,
        "replacement Agent is not live before submit"
    );
    const submittedAt = Date.now();
    const submitted = await runtime.callTool(
        ctx,
        submittingReplacement,
        "convivium_submit_turn",
        {
            protocolVersion: 1,
            meetingId,
            turnId: envelope.value.turn.id,
            stepId: envelope.value.step.id,
            attemptId: envelope.value.attempt.attemptId,
            deliveryId: envelope.value.attempt.deliveryId,
            agendaItemId: envelope.value.activeAgendaItem.id,
            kind: "statement",
            content: "reassign:b:1",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {}
        },
        305
    );
    const finalStatus = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        306
    );
    runtime.assert(
        finalStatus.result.messages.length === 1 &&
            finalStatus.result.messages[0].content === "reassign:b:1",
        "reassign transcript mismatch"
    );
    await runtime.writeResult({
        ok: true,
        scenario,
        assertions: [
            "old-attempt-revoked",
            "old-activation-drained",
            "replacement-attempt-submitted",
            "transcript-preserved"
        ],
        meetingId,
        observed: {
            oldAttemptId,
            revokedAttemptId: reassigned.result.revokedAttemptId,
            replacementAttemptId: reassigned.result.replacementAttemptId,
            oldChildId,
            oldAgentResidentAfterReassign: ctx.agents.get(oldChildId) !== undefined,
            currentSpeakerId: after.result.currentSpeakerId,
            currentAttemptId: after.result.currentAttemptId,
            submittedMessageId: submitted.result.messageId,
            submittedAt,
            transcript: finalStatus.result.messages
        }
    });
}
