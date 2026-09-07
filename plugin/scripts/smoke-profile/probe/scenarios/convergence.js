export async function runConvergenceScenario(runtime) {
    const { ctx, scenario } = runtime;
    const input = runtime.createInput();
    input.participants = [{ participantKey: "a", displayName: "A" }];
    input.agenda[0].requiredParticipantKeys = ["a"];
    const created = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_create_meeting",
        input,
        1300
    );
    const meetingId = created.result.meetingId;
    const initial = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1301
    );
    const manager = await runtime.waitForAgent(ctx, meetingId + "-manager-manager");
    const fallback = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: meetingId + "-planning-1",
            observedMeetingVersion: initial.meetingVersion,
            requestId: "smoke-convergence-invalid-plan-1",
            agendaItemId: initial.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Invalid participant must trigger fallback",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-missing",
                    instruction: "invalid",
                    reason: "manager_selected"
                }
            ]
        },
        1302
    );
    runtime.assert(
        fallback.result.fallbackApplied === true,
        "deterministic Manager fallback was not applied"
    );
    runtime.assert(fallback.result.firstAttemptId, "fallback did not create a Speaker attempt");
    const afterFallback = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1303
    );
    runtime.assert(
        afterFallback.result.currentTurn?.reason === "manager_fallback",
        "fallback Turn reason mismatch"
    );
    runtime.assert(
        afterFallback.result.stallCount === 0 && afterFallback.result.replanCount === 0,
        "initial convergence counters mismatch"
    );
    const replay = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: meetingId + "-planning-1",
            observedMeetingVersion: initial.meetingVersion,
            requestId: "smoke-convergence-invalid-plan-1",
            agendaItemId: initial.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Invalid participant must trigger fallback",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-missing",
                    instruction: "invalid",
                    reason: "manager_selected"
                }
            ]
        },
        1304
    );
    runtime.assert(
        JSON.stringify(replay.result) === JSON.stringify(fallback.result),
        "fallback replay changed the result"
    );
    runtime.assert(
        replay.meetingVersion === fallback.meetingVersion,
        "fallback replay changed the meeting version"
    );
    await runtime.writeResult({
        ok: true,
        scenario,
        assertions: [
            "deterministic-fallback",
            "fallback-replay-idempotent",
            "fallback-status-projected"
        ],
        meetingId,
        observed: { fallback: fallback.result, replay: replay.result, status: afterFallback.result }
    });
}

async function createConvergenceMeeting(runtime, limits) {
    const input = runtime.createInput();
    input.requestId = "smoke-" + runtime.scenario + "-create-1";
    input.selectionMode = "rule_based";
    input.participants = [{ participantKey: "a", displayName: "A" }];
    input.agenda[0].requiredParticipantKeys = ["a"];
    input.limits = limits;
    const created = await runtime.callTool(
        runtime.ctx,
        runtime.captain.agent,
        "convivium_create_meeting",
        input,
        runtime.nextCall()
    );
    const meetingId = created.result.meetingId;
    return {
        meetingId,
        participantSessionId: meetingId + "-participant-participant-a",
        managerSessionId: meetingId + "-manager-manager"
    };
}

async function convergenceStatus(runtime, meetingId) {
    return runtime.callTool(
        runtime.ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        runtime.nextCall()
    );
}

async function submitConvergenceTurn(runtime, meetingId, ordinal, changes, completionClaims) {
    const before = await convergenceStatus(runtime, meetingId);
    const delivery = await runtime.waitForSpeakerContext(
        runtime.ctx,
        meetingId + "-participant-participant-a",
        before.result.currentAttemptId
    );
    const c = delivery.value;
    runtime.assert(
        c.meetingId === meetingId &&
            c.step.participantId === "participant-a" &&
            c.attempt.attemptId === before.result.currentAttemptId &&
            c.turn.id === before.result.currentTurn.id &&
            c.turn.seq === ordinal &&
            c.activeAgendaItem.id === before.result.activeAgendaItem.id &&
            c.step.id &&
            c.attempt.deliveryId,
        "Speaker context binding mismatch"
    );
    const input = {
        protocolVersion: 1,
        meetingId,
        turnId: c.turn.id,
        stepId: c.step.id,
        attemptId: c.attempt.attemptId,
        deliveryId: c.attempt.deliveryId,
        agendaItemId: c.activeAgendaItem.id,
        kind: "statement",
        content: runtime.scenario + ":a:" + ordinal,
        mentions: [],
        taskIds: [],
        agendaRelation: "on_topic",
        changes
    };
    if (completionClaims !== undefined) input.completionClaims = completionClaims;
    const submitted = await runtime.callTool(
        runtime.ctx,
        delivery.agent,
        "convivium_submit_turn",
        input,
        runtime.nextCall()
    );
    let checkpoint = null;
    if (["running", "converging"].includes(submitted.result.meetingStatus)) {
        const after = await convergenceStatus(runtime, meetingId);
        const s = after.result;
        checkpoint = {
            afterSubmission: ordinal,
            meetingVersion: after.meetingVersion,
            status: s.status,
            stallCount: s.stallCount,
            maxStalls: s.maxStalls,
            replanCount: s.replanCount,
            maxReplans: s.maxReplans,
            nextTurnId: s.currentTurn?.id ?? null,
            intent: s.currentTurn?.intent ?? null,
            reason: s.currentTurn?.reason ?? null
        };
        runtime.assert(
            after.meetingVersion === submitted.meetingVersion,
            "Checkpoint changed submission version"
        );
    }
    return { delivery, input, submitted, checkpoint };
}

function recordConvergenceSubmission(turn) {
    return {
        turnId: turn.input.turnId,
        turnSeq: turn.delivery.value.turn.seq,
        attemptId: turn.input.attemptId,
        deliveryId: turn.input.deliveryId,
        messageId: turn.submitted.result.messageId,
        messageSeq: turn.submitted.result.messageSeq,
        meetingVersion: turn.submitted.meetingVersion,
        meetingStatus: turn.submitted.result.meetingStatus
    };
}

function assertConvergenceCheckpoint(runtime, checkpoint, ordinal) {
    const index = (ordinal - 1) % 3;
    runtime.assert(
        checkpoint?.status === "running" &&
            checkpoint.stallCount === index &&
            checkpoint.replanCount === (index === 2 ? 1 : 0) &&
            checkpoint.maxStalls === 3 &&
            checkpoint.maxReplans === 1 &&
            checkpoint.nextTurnId &&
            checkpoint.intent === (index === 0 ? "explore" : "refocus") &&
            checkpoint.reason === ["explore", "refocus", "replan"][index],
        "Convergence checkpoint mismatch at submission " + ordinal
    );
}

async function finishConvergenceObservation(runtime, meetingId, finalDelivery, finalInput) {
    const { ctx } = runtime;
    const deadline = Date.now() + 30000;
    let archived;
    while (Date.now() < deadline) {
        const candidate = await convergenceStatus(runtime, meetingId);
        if (candidate.result.status === "archived") {
            archived = candidate;
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    runtime.assert(archived, "Meeting did not archive");
    const snapshot = JSON.stringify(archived.result);
    const reply = await ctx.tools.execute({
        callId: "convivium-smoke-" + runtime.nextCall(),
        name: "convivium_submit_turn",
        arguments: { input: finalInput },
        agent: finalDelivery.agent,
        signal: new AbortController().signal
    });
    let lateSubmit;
    if (
        reply.value?.ok === false &&
        ["IMMUTABLE_MEETING", "ARCHIVED_MEETING", "UNAUTHORIZED_CALLER"].includes(
            reply.value.error?.code
        )
    ) {
        lateSubmit = { kind: "protocol", code: reply.value.error.code };
    } else if (reply.isError && typeof reply.error?.message === "string") {
        if (reply.error.message.includes("caller Session capability has been revoked"))
            lateSubmit = { kind: "tool", code: "CAPABILITY_REVOKED" };
        else if (reply.error.message.includes("is not live in this store"))
            lateSubmit = { kind: "tool", code: "AGENT_NOT_LIVE" };
    }
    runtime.assert(lateSubmit, "Late submit was not rejected by the expected boundary");
    const after = await convergenceStatus(runtime, meetingId);
    const stableAfterLateSubmit =
        after.meetingVersion === archived.meetingVersion &&
        JSON.stringify(after.result) === snapshot;
    runtime.assert(stableAfterLateSubmit, "Late submit changed archived Meeting");
    const ids = [meetingId + "-manager-manager", meetingId + "-participant-participant-a"];
    const children = (
        await ctx.subagents.listChildren(
            runtime.captain.agent.session.id,
            new AbortController().signal
        )
    )
        .filter((child) => ids.includes(child.id))
        .map((child) => ({ id: child.id, mode: child.mode, activity: child.activity }));
    const residentSessionIds = ids.filter((id) => ctx.agents.get(id) !== undefined);
    runtime.assert(
        children.length === 2 &&
            ids.every((id) =>
                children.some(
                    (child) =>
                        child.id === id &&
                        child.mode === "continuable" &&
                        child.activity === "inactive"
                )
            ) &&
            residentSessionIds.length === 0,
        "Meeting Sessions did not drain"
    );
    return {
        archived: archived.result,
        archivedVersion: archived.meetingVersion,
        lateSubmit,
        stableAfterLateSubmit,
        children,
        residentSessionIds
    };
}

function assertConvergenceArchive(runtime, observed, code) {
    const a = observed.archived,
        p = a.archive?.package;
    runtime.assert(
        a.status === "archived" &&
            a.meetingVersion === observed.archivedVersion &&
            p &&
            a.termination?.code === code &&
            p.termination?.code === code &&
            a.termination.reason === p.termination.reason &&
            p.formalTranscript.length === observed.submissions.length &&
            p.formalTranscript.every(
                (message, index) =>
                    message.id === observed.submissions[index].messageId &&
                    message.seq === index + 1 &&
                    message.turnId === observed.submissions[index].turnId &&
                    message.speaker === "participant-a" &&
                    message.content === runtime.scenario + ":a:" + (index + 1)
            ),
        "Convergence archive mismatch"
    );
}

export async function runConvergenceStalledScenario(runtime) {
    const { meetingId } = await createConvergenceMeeting(runtime, {
        maxTurns: 10,
        maxSpeakersPerTurn: 1,
        maxTotalMessages: 100
    });
    const submissions = [],
        checkpoints = [];
    let final;
    for (let ordinal = 1; ordinal <= 4; ordinal++) {
        const turn = await submitConvergenceTurn(runtime, meetingId, ordinal, {});
        submissions.push(recordConvergenceSubmission(turn));
        if (ordinal < 4) {
            assertConvergenceCheckpoint(runtime, turn.checkpoint, ordinal);
            checkpoints.push(turn.checkpoint);
        } else {
            runtime.assert(
                turn.submitted.result.meetingStatus === "partial" && turn.checkpoint === null,
                "Fourth empty submit did not terminate partial"
            );
            final = turn;
        }
    }
    const observed = {
        submissions,
        checkpoints,
        questionId: null,
        proposalId: null,
        endResult: null,
        ...(await finishConvergenceObservation(runtime, meetingId, final.delivery, final.input))
    };
    assertConvergenceArchive(runtime, observed, "stalled");
    await runtime.writeResult({
        ok: true,
        scenario: runtime.scenario,
        meetingId,
        observed,
        assertions: [
            "first-progress-baseline",
            "refocus-observed",
            "replan-observed",
            "partial-stalled",
            "terminal-submit-rejected",
            "archive-consistent",
            "sessions-drained"
        ]
    });
}
