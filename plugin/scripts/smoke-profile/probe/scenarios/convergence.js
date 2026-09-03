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
