export async function runColdRebindScenario(runtime) {
    const { ctx, scenario } = runtime;
    if (runtime.coldPhase === "2") {
        const checkpoint = runtime.validateColdCheckpoint(
            JSON.parse(await runtime.readFile(runtime.coldCheckpointPath, "utf8"))
        );
        const signal = new AbortController().signal;
        const preparation = await ctx.sessionPersistence.prepare(
            checkpoint.captainSessionId,
            signal
        );
        const restoredSession = preparation.session;
        const detach = ctx.sessions.enter(restoredSession);
        try {
            ctx.sessions.announce(restoredSession);
        } catch (error) {
            detach();
            preparation[Symbol.dispose]();
            throw error;
        }
        preparation[Symbol.dispose]();
        const registered = runtime.registerSmokeAgent(ctx, restoredSession);
        runtime.setCaptain({
            agent: registered.agent,
            async dispose() {
                await registered.dispose();
                detach();
            }
        });
        const reboundStatus = await runtime.callTool(
            ctx,
            runtime.captain.agent,
            "convivium_meeting_status",
            { protocolVersion: 1, meetingId: checkpoint.meetingId },
            704
        );
        runtime.assert(
            reboundStatus.meetingVersion === checkpoint.meetingVersion,
            "cold rebind version changed"
        );
        runtime.assert(
            checkpoint.transcriptMessageIds.every((id) =>
                reboundStatus.result.messages.some((message) => message.id === id)
            ),
            "cold transcript prefix missing"
        );
        const children = await ctx.subagents.listChildren(restoredSession.id, signal);
        const checkpointChildren = checkpoint.sessionIds.map((sessionId) => {
            const child = children.find((candidate) => candidate.id === sessionId);
            runtime.assert(child, "cold durable child missing " + sessionId);
            runtime.assert(child.mode === "continuable", "cold child mode mismatch " + sessionId);
            runtime.assert(child.diagnostic === undefined, "cold child diagnostic " + sessionId);
            return child;
        });
        runtime.assert(
            ctx.agents.get(checkpoint.managerSessionId) === undefined,
            "cold Manager unexpectedly resident before followup"
        );
        const manager = await runtime.resumeParticipantForProbe(
            ctx,
            runtime.captain.agent,
            checkpoint.managerSessionId,
            "convivium-smoke-cold-manager"
        );
        let managerContext;
        let managerContextMessageId;
        for (const message of [
            ...(manager.inbox.nextTurn ?? []),
            ...(manager.inbox.nextStep ?? [])
        ]) {
            for (const text of runtime.messageTexts(message)) {
                const marker = text.indexOf("manager context: ");
                try {
                    const parsed = JSON.parse(
                        marker >= 0 ? text.slice(marker + "manager context: ".length) : text
                    );
                    if (
                        parsed.meetingId === checkpoint.meetingId &&
                        parsed.planningAttemptId === checkpoint.managerPlanningAttemptId &&
                        parsed.meetingVersion === checkpoint.managerPlanningMeetingVersion
                    ) {
                        managerContext = parsed;
                        managerContextMessageId = message.id;
                    }
                } catch {
                    // Ignore non-context inbox messages.
                }
            }
        }
        runtime.assert(
            managerContext && managerContextMessageId,
            "cold persisted Manager inbox context missing"
        );
        const replanned = await runtime.callTool(
            ctx,
            manager,
            "convivium_submit_manager_plan",
            {
                protocolVersion: 1,
                meetingId: checkpoint.meetingId,
                planningAttemptId: managerContext.planningAttemptId,
                observedMeetingVersion: managerContext.meetingVersion,
                requestId: "smoke-cold-plan-2",
                agendaItemId: reboundStatus.result.activeAgendaItem.id,
                intent: "explore",
                objective: "Cold restart followup",
                expectedOutputs: [],
                prohibitedTopics: [],
                steps: [
                    { participantId: "participant-a", instruction: "A", reason: "manager_selected" }
                ]
            },
            705
        );
        runtime.assert(replanned.result.firstAttemptId, "cold replan missing attempt");
        const phase2Delivery = await runtime.waitForSpeakerContext(
            ctx,
            checkpoint.participantSessionId,
            replanned.result.firstAttemptId
        );
        const submitted = await runtime.callTool(
            ctx,
            phase2Delivery.agent,
            "convivium_submit_turn",
            {
                protocolVersion: 1,
                meetingId: checkpoint.meetingId,
                turnId: phase2Delivery.value.turn.id,
                stepId: phase2Delivery.value.step.id,
                attemptId: phase2Delivery.value.attempt.attemptId,
                deliveryId: phase2Delivery.value.attempt.deliveryId,
                agendaItemId: phase2Delivery.value.activeAgendaItem.id,
                kind: "statement",
                content: "cold-rebind:a:2",
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
            706
        );
        const finalStatus = await runtime.callTool(
            ctx,
            runtime.captain.agent,
            "convivium_meeting_status",
            { protocolVersion: 1, meetingId: checkpoint.meetingId },
            707
        );
        runtime.assert(runtime.hostPid !== checkpoint.hostPid, "cold Host PID did not change");
        runtime.assert(
            checkpoint.transcriptMessageIds.every((id) =>
                finalStatus.result.messages.some((message) => message.id === id)
            ),
            "cold final transcript prefix missing"
        );
        runtime.assert(
            finalStatus.result.messages.some(
                (message) => message.id === submitted.result.messageId
            ),
            "cold followup transcript missing"
        );
        const finalChildren = await ctx.subagents.listChildren(restoredSession.id, signal);
        runtime.assert(
            checkpoint.sessionIds.every((id) => finalChildren.some((child) => child.id === id)),
            "cold child identity changed"
        );
        await runtime.writeResult({
            ok: true,
            scenario,
            assertions: [
                "phase1-checkpoint-durable",
                "host-pid-changed",
                "exact-parent-rebound",
                "transcript-prefix-preserved",
                "cold-followup-submitted"
            ],
            observed: {
                phase1HostPid: checkpoint.hostPid,
                phase2HostPid: runtime.hostPid,
                captainSessionId: restoredSession.id,
                managerSessionId: checkpoint.managerSessionId,
                participantSessionId: checkpoint.participantSessionId,
                managerPlanningAttemptId: checkpoint.managerPlanningAttemptId,
                managerContextMessageId,
                transcriptMessageIds: [
                    ...checkpoint.transcriptMessageIds,
                    submitted.result.messageId
                ],
                reboundVersion: reboundStatus.meetingVersion,
                finalVersion: finalStatus.meetingVersion,
                children: checkpointChildren.map((child) => ({
                    id: child.id,
                    mode: child.mode,
                    activity: child.activity
                }))
            }
        });
        return;
    }
    const input = runtime.createInput();
    input.agenda[0].requiredParticipantKeys = ["a"];
    const created = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_create_meeting",
        input,
        700
    );
    runtime.setMeetingId(created.result.meetingId);
    const meetingId = created.result.meetingId;
    const status = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        701
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
            requestId: "smoke-cold-plan-1",
            agendaItemId: status.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Cold restart",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                { participantId: "participant-a", instruction: "A", reason: "manager_selected" }
            ]
        },
        702
    );
    const delivery = await runtime.waitForSpeakerContext(
        ctx,
        meetingId + "-participant-participant-a",
        plan.result.firstAttemptId
    );
    let laterManagerAgent = ctx.agents.get(manager.id);
    if (laterManagerAgent === undefined)
        laterManagerAgent = await runtime.resumeParticipantForProbe(
            ctx,
            runtime.captain.agent,
            manager.id,
            "convivium-smoke-cold-manager-barrier"
        );
    await laterManagerAgent.whenIdle();
    let maintenanceStartedResolve;
    const maintenanceStarted = new Promise((resolveStarted) => {
        maintenanceStartedResolve = resolveStarted;
    });
    const maintenancePromise = laterManagerAgent.runMaintenance(async () => {
        maintenanceStartedResolve();
        await new Promise((resolveMaintenance) => {
            runtime.setColdMaintenance(resolveMaintenance);
        });
    });
    runtime.setColdMaintenance(undefined, maintenancePromise);
    await maintenanceStarted;
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
            content: "cold-rebind:a:1",
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
        703
    );
    const laterManagerDelivery = await runtime.waitForInbox(ctx, manager.id, (message) =>
        runtime
            .messageTexts(message)
            .map((text) => {
                const marker = text.indexOf("manager context: ");
                try {
                    return JSON.parse(
                        marker >= 0 ? text.slice(marker + "manager context: ".length) : text
                    );
                } catch {
                    return undefined;
                }
            })
            .find(
                (context) =>
                    context?.meetingId === meetingId &&
                    context.planningAttemptId !==
                        (plan.result.planningAttemptId ?? meetingId + "-planning-1") &&
                    Number.isInteger(context.meetingVersion)
            )
    );
    const laterManagerContext = laterManagerDelivery.value;
    runtime.assert(
        laterManagerDelivery.agent === laterManagerAgent,
        "cold planning context used a different Manager Agent"
    );
    runtime.assert(
        (await ctx.sessions.flush(laterManagerDelivery.agent.session)) === true,
        "cold later Manager Session flush failed"
    );
    runtime.assert(
        (await ctx.sessions.flush(runtime.captain.agent.session)) === true,
        "cold Captain Session flush failed"
    );
    const checkpointStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        701
    );
    runtime.assert(
        checkpointStatus.meetingVersion === laterManagerContext.meetingVersion,
        "cold planning/status version mismatch"
    );
    runtime.assert(
        checkpointStatus.result.currentAttemptId === undefined,
        "cold phase1 still has running attempt"
    );
    runtime.assert(
        checkpointStatus.result.termination === undefined,
        "cold phase1 unexpectedly terminal"
    );
    runtime.assert(
        checkpointStatus.result.messages.some(
            (message) => message.id === submitted.result.messageId
        ),
        "cold phase1 transcript missing"
    );
    const checkpoint = runtime.validateColdCheckpoint({
        schemaVersion: 1,
        scenario,
        phase: 1,
        hostPid: runtime.hostPid,
        captainSessionId: runtime.captain.agent.session.id,
        meetingId,
        meetingVersion: checkpointStatus.meetingVersion,
        managerSessionId: laterManagerDelivery.agent.id,
        participantSessionId: delivery.agent.id,
        sessionIds: [laterManagerDelivery.agent.id, delivery.agent.id],
        transcriptMessageIds: [submitted.result.messageId],
        managerPlanningAttemptId: laterManagerContext.planningAttemptId,
        managerPlanningMeetingVersion: laterManagerContext.meetingVersion
    });
    await runtime.writeCheckpoint(checkpoint);
    await runtime.writeResult({ ok: true, scenario, phase1Complete: true, meetingId, checkpoint });
}
