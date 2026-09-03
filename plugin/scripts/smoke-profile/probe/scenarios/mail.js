export async function runMailRaceScenario(runtime) {
    const { ctx, scenario, captain } = runtime;
    const mailInput = runtime.createInput();
    mailInput.agenda[0].requiredParticipantKeys = ["a", "b"];
    mailInput.limits = { mailHandlingTimeoutMs: 100 };
    const created = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_create_meeting",
        mailInput,
        900
    );
    const mailMeetingId = created.result.meetingId;
    runtime.setMeetingId(mailMeetingId);
    const status = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId: mailMeetingId },
        901
    );
    const manager = await runtime.waitForAgent(ctx, mailMeetingId + "-manager-manager");
    const plan = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId: mailMeetingId,
            planningAttemptId: mailMeetingId + "-planning-1",
            observedMeetingVersion: status.meetingVersion,
            requestId: "smoke-mail-plan-1",
            agendaItemId: status.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Mail race",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-a",
                    instruction: "Send mail",
                    reason: "manager_selected"
                },
                {
                    participantId: "participant-b",
                    instruction: "Receive next speaker followup",
                    reason: "manager_selected"
                }
            ]
        },
        902
    );
    const senderDelivery = await runtime.waitForSpeakerContext(
        ctx,
        mailMeetingId + "-participant-participant-a",
        plan.result.firstAttemptId
    );
    const beforeSend = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId: mailMeetingId },
        901
    );
    const recipientSessionId = mailMeetingId + "-participant-participant-b";
    let mailMaintenanceStartedResolve;
    const mailMaintenanceStarted = new Promise((resolveStarted) => {
        mailMaintenanceStartedResolve = resolveStarted;
    });
    const mailDeliveryPromise = runtime.waitForInbox(
        ctx,
        recipientSessionId,
        (message, liveRecipient) => {
            for (const text of runtime.messageTexts(message)) {
                try {
                    const envelope = JSON.parse(text);
                    if (
                        envelope.kind === "meeting_mail" &&
                        envelope.meetingContext?.meetingId === mailMeetingId
                    ) {
                        const maintenancePromise = liveRecipient.runMaintenance(async () => {
                            mailMaintenanceStartedResolve();
                            await new Promise((resolveMaintenance) => {
                                runtime.setMailMaintenance(resolveMaintenance);
                            });
                        });
                        runtime.setMailMaintenance(undefined, maintenancePromise);
                        return envelope;
                    }
                } catch {
                    // Ignore non-mail inbox messages.
                }
            }
            return undefined;
        }
    );
    const sent = await runtime.callTool(
        ctx,
        senderDelivery.agent,
        "convivium_send_message",
        {
            protocolVersion: 1,
            meetingId: mailMeetingId,
            expectedMeetingVersion: beforeSend.meetingVersion,
            requestId: "smoke-mail-send-1",
            recipient: {
                kind: "meeting_participant",
                meetingId: mailMeetingId,
                participantId: "participant-b"
            },
            content: "private-smoke-body",
            meetingContext: {
                meetingId: mailMeetingId,
                agendaItemId: beforeSend.result.activeAgendaItem.id,
                contextFromSeq: 0,
                contextThroughSeq: beforeSend.result.messages.at(-1)?.seq ?? 0,
                relevantMessageIds: [],
                snapshotSummary: "smoke"
            }
        },
        903
    );
    const mailDelivery = await mailDeliveryPromise.catch((error) => {
        throw new Error("mail envelope wait failed: " + String(error));
    });
    await mailMaintenanceStarted;
    runtime.assert(
        ctx.agents.get(recipientSessionId) === mailDelivery.agent,
        "mail recipient maintenance barrier lost live Agent"
    );
    runtime.assert(mailDelivery.value.mailId === sent.result.mailId, "mail envelope ID mismatch");
    runtime.assert(
        typeof mailDelivery.value.handlingAttemptId === "string" &&
            typeof mailDelivery.value.deliveryId === "string",
        "mail envelope identifiers missing"
    );
    await new Promise((resolveWait) =>
        setTimeout(resolveWait, mailInput.limits.mailHandlingTimeoutMs - 25)
    );
    let finishResult;
    let finishError;
    try {
        finishResult = await runtime.callTool(
            ctx,
            mailDelivery.agent,
            "convivium_finish_meeting_mail",
            {
                protocolVersion: 1,
                meetingId: mailMeetingId,
                mailId: sent.result.mailId,
                handlingAttemptId: mailDelivery.value.handlingAttemptId,
                deliveryId: mailDelivery.value.deliveryId,
                requestId: mailDelivery.value.deliveryId,
                status: "processed"
            },
            904
        );
    } catch (error) {
        finishError = String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    runtime.assert(
        (finishResult?.result.status === "processed") !== (finishError !== undefined),
        "mail race did not produce one terminal outcome"
    );
    let duplicateFinishError;
    try {
        await runtime.callTool(
            ctx,
            mailDelivery.agent,
            "convivium_finish_meeting_mail",
            {
                protocolVersion: 1,
                meetingId: mailMeetingId,
                mailId: sent.result.mailId,
                handlingAttemptId: mailDelivery.value.handlingAttemptId,
                deliveryId: mailDelivery.value.deliveryId,
                requestId: mailDelivery.value.deliveryId + "-duplicate",
                status: "processed"
            },
            9041
        );
    } catch (error) {
        duplicateFinishError = String(error);
    }
    runtime.assert(
        duplicateFinishError !== undefined,
        "mail race accepted a second terminal outcome"
    );
    await runtime.releaseMailMaintenance();
    const senderSessionId = mailMeetingId + "-participant-participant-a";
    const liveSender =
        ctx.agents.get(senderSessionId) ??
        (await runtime.resumeParticipantForProbe(
            ctx,
            captain.agent,
            senderSessionId,
            "convivium-smoke-mail-sender-resume"
        ));
    runtime.assert(
        ctx.agents.get(senderSessionId) === liveSender,
        "mail sender did not cold-resume as live Agent"
    );
    const submitted = await runtime.callTool(
        ctx,
        liveSender,
        "convivium_submit_turn",
        {
            protocolVersion: 1,
            meetingId: mailMeetingId,
            turnId: senderDelivery.value.turn.id,
            stepId: senderDelivery.value.step.id,
            attemptId: senderDelivery.value.attempt.attemptId,
            deliveryId: senderDelivery.value.attempt.deliveryId,
            agendaItemId: senderDelivery.value.activeAgendaItem.id,
            kind: "statement",
            content: "mail-race:a:1",
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
        905
    );
    const afterSender = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId: mailMeetingId },
        906
    );
    runtime.assert(
        afterSender.result.currentSpeakerId === "participant-b" &&
            typeof afterSender.result.currentAttemptId === "string",
        "recipient did not become next speaker"
    );
    const recipientSpeaker = await runtime
        .waitForSpeakerContext(ctx, recipientSessionId, afterSender.result.currentAttemptId)
        .catch((error) => {
            throw new Error("recipient speaker wait failed: " + String(error));
        });
    runtime.assert(
        String(recipientSpeaker.agent.id) === recipientSessionId &&
            ctx.agents.get(recipientSessionId) === recipientSpeaker.agent,
        "recipient queue did not accept a live speaker followup"
    );
    runtime.assert(
        afterSender.result.messages.some((message) => message.id === submitted.result.messageId) &&
            !JSON.stringify(afterSender.result).includes("private-smoke-body"),
        "mail privacy/status assertion failed"
    );
    await runtime.writeResult({
        ok: true,
        scenario,
        assertions: [
            "single-mail-terminal",
            "stable-delivery-ids",
            "private-body-not-projected",
            "recipient-queue-reusable"
        ],
        observed: {
            meetingId: mailMeetingId,
            mailId: sent.result.mailId,
            handlingAttemptId: mailDelivery.value.handlingAttemptId,
            deliveryId: mailDelivery.value.deliveryId,
            processingThroughSeq: mailDelivery.value.processingThroughSeq,
            terminalStatus: finishResult?.result.status ?? "timed_out",
            finishOutcome: finishResult?.result.status ?? finishError,
            duplicateFinishError,
            senderMessageId: submitted.result.messageId,
            recipientAttemptId: afterSender.result.currentAttemptId,
            recipientSessionId
        }
    });
}
