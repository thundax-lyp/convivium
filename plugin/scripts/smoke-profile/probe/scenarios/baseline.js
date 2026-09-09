export async function runBaselineScenario(runtime) {
    const { ctx, scenario } = runtime;
    if (runtime.browserMode) {
        runtime.captain.agent.session.append(
            "user/message",
            {
                id: "convivium-smoke-browser-message",
                role: "user",
                content: [{ type: "text", text: "Browser smoke session" }],
                source: { kind: "user" }
            },
            { surfaceOp: "append" }
        );
        await ctx.sessions.flush(runtime.captain.agent.session);
        await runtime.workspace.attachSession(runtime.captain.agent.session.id);
    }
    const created = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_create_meeting",
        runtime.createInput(),
        0
    );
    const meetingId = created.result.meetingId;
    runtime.setMeetingId(meetingId);
    if (scenario === "baseline") {
        const rejected = await ctx.tools.execute({
            callId: "convivium-smoke-attendance-reject-missing",
            name: "convivium_dispose_attendance_recommendation",
            arguments: {
                input: {
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: created.meetingVersion,
                    requestId: "smoke-attendance-reject-missing",
                    recommendationId: "missing-recommendation",
                    decision: "reject",
                    reason: "Verify attendance rejection boundary"
                }
            },
            agent: runtime.captain.agent,
            signal: new AbortController().signal
        });
        runtime.assert(
            !rejected.isError &&
                rejected.value?.ok === false &&
                rejected.value.code === "INVALID_ARGUMENT" &&
                rejected.value.retryable === false,
            "attendance rejection did not return canonical INVALID_ARGUMENT"
        );
        const unchanged = await runtime.callTool(
            ctx,
            runtime.captain.agent,
            "convivium_meeting_status",
            { protocolVersion: 1, meetingId },
            runtime.nextCall()
        );
        runtime.assert(
            unchanged.meetingVersion === created.meetingVersion &&
                Array.isArray(unchanged.result.attendanceRecommendations) &&
                unchanged.result.attendanceRecommendations.length === 0,
            "attendance rejection changed meeting facts"
        );
    }
    const manager = await runtime.waitForAgent(ctx, meetingId + "-manager-manager");
    const managerPlan = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: meetingId + "-planning-1",
            observedMeetingVersion: created.meetingVersion,
            requestId: "smoke-plan-1",
            agendaItemId: "agenda-agenda-1",
            intent: "explore",
            objective: "Commit A then C then B",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                { participantId: "participant-a", instruction: "A", reason: "manager_selected" },
                { participantId: "participant-c", instruction: "C", reason: "manager_selected" },
                { participantId: "participant-b", instruction: "B", reason: "manager_selected" }
            ]
        },
        1
    );
    const timeoutProbe = scenario === "timeout";
    const timeoutSpeaker = timeoutProbe
        ? await runtime.waitForObservedParticipant(ctx, meetingId, "a")
        : undefined;
    const timeoutSessionId = timeoutSpeaker?.id;
    const timeoutStartedAt = timeoutProbe ? Date.now() : undefined;
    let timeoutOracle;
    let nextSpeakerSubmittedAt;
    const messages = [];
    for (let index = 0; index < runtime.participants.length; index += 1) {
        const stepDeadline = Date.now() + 30000;
        while (Date.now() < stepDeadline) {
            const beforeSubmit = await runtime.callTool(
                ctx,
                runtime.captain.agent,
                "convivium_meeting_status",
                {
                    protocolVersion: 1,
                    meetingId
                },
                runtime.nextCall()
            );
            if (timeoutProbe && index === 1) {
                const advanced = beforeSubmit.result.currentSpeakerId !== "participant-a";
                if (!advanced) {
                    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
                    continue;
                }
                if (timeoutSessionId === undefined)
                    throw new Error("timeout owned session missing");
                if (ctx.agents.get(timeoutSessionId) !== undefined) {
                    runtime.assert(
                        beforeSubmit.result.messages.length === 0,
                        "next speaker committed before timed-out Agent drained"
                    );
                    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
                    continue;
                }
                const listSignal = new AbortController();
                const children = await ctx.subagents.listChildren(
                    runtime.captain.agent.session.id,
                    listSignal.signal
                );
                const durableChild = children.find((child) => child.id === timeoutSessionId);
                if (
                    durableChild === undefined ||
                    durableChild.mode !== "continuable" ||
                    durableChild.activity !== "inactive" ||
                    durableChild.diagnostic !== undefined
                ) {
                    throw new Error("timed-out participant durable child observation invalid");
                }
                const drainedAt = Date.now();
                timeoutOracle = {
                    oldAttemptId: managerPlan.result.firstAttemptId,
                    drainedAt,
                    durableSessionId: timeoutSessionId,
                    durableChild
                };
            }
            const requiredMessages = scenario === "timeout" ? index : index + 1;
            if (beforeSubmit.result.messages.length >= requiredMessages) {
                if (timeoutProbe && index > 0) nextSpeakerSubmittedAt = Date.now();
                break;
            }
            await new Promise((resolveWait) => setTimeout(resolveWait, 100));
        }
        if (Date.now() >= stepDeadline) {
            throw new Error("Timed out waiting for committed participant step " + index + ".");
        }
    }
    const status = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        {
            protocolVersion: 1,
            meetingId
        },
        10
    );
    const transcript = status.result.messages;
    const expectedTranscript = scenario === "timeout" ? "CB" : "ACB";
    runtime.assert(
        transcript.map((message) => message.content).join("") === expectedTranscript,
        "transcript order is not " + expectedTranscript
    );
    if (timeoutProbe) {
        runtime.assert(
            transcript.every((message) => message.speaker !== "participant-a"),
            "timed-out speaker wrote a message"
        );
        runtime.assert(
            transcript.length === 2,
            "timeout transcript has an unexpected message count"
        );
        runtime.assert(
            status.result.currentAttemptId === undefined ||
                status.result.currentAttemptId !== managerPlan.result.firstAttemptId,
            "old attempt remains current"
        );
        runtime.assert(
            timeoutOracle !== undefined && nextSpeakerSubmittedAt !== undefined,
            "timeout timestamps missing"
        );
        runtime.assert(
            timeoutOracle.drainedAt < nextSpeakerSubmittedAt,
            "next speaker submitted before drain"
        );
    }
    runtime.assert(
        status.result.status === "running",
        "next planning did not keep meeting running"
    );
    runtime.assert(
        status.result.currentTurn === undefined,
        "next planning unexpectedly exposed a current turn"
    );
    const baseUrl = "http://127.0.0.1:" + ctx.webServer.port;
    const remote = await runtime.createRemoteProbe(ctx.connection, baseUrl);
    const statusInput = { protocolVersion: 1, meetingId };
    const list = await remote.callRemote("list");
    runtime.assert(
        list.result.meetings.some((meeting) => meeting.meetingId === meetingId),
        "Remote list did not include the smoke Meeting"
    );
    let updates;
    try {
        updates = await remote.openUpdates();
        await updates.next();
        const webStatus = await remote.callRemote("getStatus", statusInput);
        const paused = await remote.callRemote("pause", {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: webStatus.meetingVersion,
            requestId: "smoke-remote-pause-1",
            reason: "Verify local host control"
        });
        runtime.assert(paused.result.status === "paused", "Remote pause did not return paused");
        await updates.next();
        const pausedStatus = await remote.callRemote("getStatus", statusInput);
        runtime.assert(
            pausedStatus.result.status === "paused",
            "Remote status did not project paused"
        );
        runtime.assert(
            pausedStatus.result.pauseControl.pausedBy.kind === "local_host" &&
                pausedStatus.result.pauseControl.pausedBy.actorId === "loopback-web",
            "Remote pause actor was not local_host/loopback-web"
        );
        await updates.close();
        const resumed = await remote.callRemote("resume", {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: pausedStatus.meetingVersion,
            requestId: "smoke-remote-resume-1"
        });
        runtime.assert(resumed.result.status === "running", "Remote resume did not return running");
        updates = await remote.openUpdates();
        await updates.next();
        const refreshedList = await remote.callRemote("list");
        runtime.assert(
            refreshedList.result.meetings.some((meeting) => meeting.meetingId === meetingId),
            "Remote reconnect list lost Meeting"
        );
        const resumedStatus = await remote.callRemote("getStatus", statusInput);
        runtime.assert(
            resumedStatus.result.status === "running" &&
                resumedStatus.meetingVersion === resumed.meetingVersion,
            "Remote status did not return to running"
        );
    } finally {
        await updates?.close();
    }
    await runtime.writeResult({
        ok: true,
        scenario,
        assertions:
            scenario === "timeout"
                ? []
                : [
                      "baseline-transcript-acb",
                      "baseline-remote-pause-resume",
                      "baseline-remote-stream-reconnect",
                      "attendance-reject-tool-zero-effects"
                  ],
        meetingId,
        participants: runtime.participants,
        messages,
        transcript: transcript.map((message) => ({
            id: message.id,
            seq: message.seq,
            content: message.content,
            speaker: message.speaker
        })),
        managerPlan: managerPlan.result,
        timeoutOracle,
        timeoutStartedAt,
        nextSpeakerSubmittedAt,
        nextPlanObserved: status.result.currentTurn === undefined,
        remoteRouteUsed: true,
        captainSessionId: "convivium-smoke-captain",
        webUrl: baseUrl
    });
}
