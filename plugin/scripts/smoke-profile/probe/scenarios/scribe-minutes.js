import { isDeepStrictEqual } from "node:util";

export async function runScribeMinutesScenario(runtime) {
    const { ctx, scenario, browserMode } = runtime;
    const captain = runtime.captain.agent;
    const call = (agent, name, input) =>
        runtime.callTool(ctx, agent, name, input, runtime.nextCall());
    const input = structuredClone(runtime.createInput());
    input.participants = input.participants.filter((p) => ["a", "b"].includes(p.participantKey));
    input.participants.find((p) => p.participantKey === "b").role = "meeting_scribe";
    input.agenda[0].requiredParticipantKeys = ["a"];
    if (browserMode) {
        captain.session.append(
            "user/message",
            {
                id: "convivium-smoke-browser-message",
                role: "user",
                content: [{ type: "text", text: "Browser smoke session" }],
                source: { kind: "user" }
            },
            { surfaceOp: "append" }
        );
        await ctx.sessions.flush(captain.session);
        await runtime.workspace.attachSession(captain.session.id);
    }
    const created = await call(captain, "convivium_create_meeting", input);
    const meetingId = created.result.meetingId;
    runtime.setMeetingId(meetingId);
    const read = () => call(captain, "convivium_meeting_status", { protocolVersion: 1, meetingId });
    const initial = await read();
    const manager = await runtime.waitForAgent(ctx, meetingId + "-manager-manager");
    const plan = await call(manager, "convivium_submit_manager_plan", {
        protocolVersion: 1,
        meetingId,
        planningAttemptId: meetingId + "-planning-1",
        observedMeetingVersion: initial.meetingVersion,
        requestId: "scribe-minutes-plan",
        agendaItemId: initial.result.activeAgendaItem.id,
        intent: "explore",
        objective: "Record referenced minutes",
        expectedOutputs: [],
        prohibitedTopics: [],
        steps: ["a", "b"].map((key) => ({
            participantId: "participant-" + key,
            instruction: key === "a" ? "Provide source" : "Draft referenced minutes",
            reason: "manager_selected"
        }))
    });
    const a = await runtime.waitForSpeakerContext(
        ctx,
        meetingId + "-participant-participant-a",
        plan.result.firstAttemptId
    );
    const submission = (delivery, content, kind) => ({
        protocolVersion: 1,
        meetingId,
        turnId: delivery.value.turn.id,
        stepId: delivery.value.step.id,
        attemptId: delivery.value.attempt.attemptId,
        deliveryId: delivery.value.attempt.deliveryId,
        agendaItemId: delivery.value.activeAgendaItem.id,
        kind,
        content,
        mentions: [],
        taskIds: [],
        agendaRelation: "on_topic",
        changes: {}
    });
    const sourceReceipt = await call(
        a.agent,
        "convivium_submit_turn",
        submission(a, "source-a", "statement")
    );
    const before = await read();
    const b = await runtime.waitForSpeakerContext(
        ctx,
        meetingId + "-participant-participant-b",
        before.result.currentAttemptId
    );
    const sources = b.value.recentMessages.filter((m) => m.id === sourceReceipt.result.messageId);
    runtime.assert(
        sources.length === 1 && sources[0].content === "source-a",
        "minutes source missing from context"
    );
    const sourceContext = sources[0];
    const publicKeys = [
        "id",
        "seq",
        "turnId",
        "stepId",
        "speaker",
        "agendaItemId",
        "kind",
        "content",
        "mentions",
        "replyTo",
        "taskIds",
        "createdAt",
        "minutesDraft"
    ];
    runtime.assert(
        Object.keys(sourceContext).every((key) => publicKeys.includes(key)),
        "private source fields in context"
    );
    const draftInput = {
        ...submission(b, "Minutes draft based on source-a", "summary"),
        minutesDraft: {
            coverage: { fromSeq: sourceContext.seq, throughSeq: sourceContext.seq },
            referencedMessageIds: [sourceContext.id]
        }
    };
    const invalid = await ctx.tools.execute({
        callId: "convivium-smoke-" + runtime.nextCall(),
        name: "convivium_submit_turn",
        arguments: {
            input: {
                ...draftInput,
                minutesDraft: {
                    ...draftInput.minutesDraft,
                    referencedMessageIds: ["missing-source"]
                }
            }
        },
        agent: b.agent,
        signal: new AbortController().signal
    });
    runtime.assert(
        invalid.isError === false &&
            invalid.value?.ok === false &&
            invalid.value.code === "INVALID_ARGUMENT",
        "invalid minutes did not return canonical rejection"
    );
    const afterInvalid = await read();
    runtime.assert(
        afterInvalid.meetingVersion === before.meetingVersion &&
            isDeepStrictEqual(afterInvalid.result.messages, before.result.messages),
        "invalid minutes changed state"
    );
    const afterSubmit = await call(b.agent, "convivium_submit_turn", draftInput);
    const replayAgent = await runtime.resumeParticipantForProbe(
        ctx,
        captain,
        b.agent.id,
        "scribe-minutes-replay"
    );
    const afterReplay = await call(replayAgent, "convivium_submit_turn", draftInput);
    runtime.assert(isDeepStrictEqual(afterSubmit, afterReplay), "minutes replay changed receipt");
    const status = await read();
    const find = (messages, id) => {
        const matches = messages.filter((m) => m.id === id);
        runtime.assert(matches.length === 1, "minutes message missing or duplicated");
        return matches[0];
    };
    const source = structuredClone(find(status.result.messages, sourceContext.id));
    const draft = structuredClone(find(status.result.messages, afterSubmit.result.messageId));
    const compare = (actual, expected) =>
        runtime.assert(
            publicKeys.every(
                (key) =>
                    Object.hasOwn(actual, key) === Object.hasOwn(expected, key) &&
                    isDeepStrictEqual(actual[key], expected[key])
            ),
            "minutes public message mismatch"
        );
    compare(sourceContext, source);
    const http = await runtime.callHttp(
        "http://127.0.0.1:" +
            ctx.webServer.port +
            "/api/convivium/meetings/" +
            encodeURIComponent(meetingId)
    );
    for (const message of [source, draft]) compare(find(http.result.messages, message.id), message);
    const observed = { source, draft, afterSubmit, afterReplay, status };
    const assertions = [
        "minutes-context-visible",
        "minutes-invalid-atomic",
        "minutes-replay-stable",
        "minutes-http-equal"
    ];
    if (browserMode) {
        await runtime.writeResult({
            ok: true,
            scenario,
            browserReady: true,
            meetingId,
            captainSessionId: "convivium-smoke-captain",
            observed,
            assertions
        });
        return;
    }
    await call(captain, "convivium_end_meeting", {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: status.meetingVersion,
        outcome: "partial",
        reason: "scribe minutes smoke",
        acceptedDecisionIds: [],
        deferredAgendaItemIds: [],
        waivers: [],
        requestId: "scribe-minutes-end"
    });
    const deadline = Date.now() + 30000;
    let archived;
    while (Date.now() < deadline) {
        const candidate = await read();
        if (candidate.result.status === "archived") {
            archived = candidate;
            break;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    runtime.assert(archived, "minutes Meeting did not archive");
    for (const message of [source, draft])
        compare(find(archived.result.archive.package.formalTranscript, message.id), message);
    const drainedSessionIds = [manager.id, a.agent.id, b.agent.id];
    runtime.assert(
        drainedSessionIds.every((id) => ctx.agents.get(id) === undefined),
        "minutes Session remained resident"
    );
    const children = await ctx.subagents.listChildren(
        captain.session.id,
        new AbortController().signal
    );
    runtime.assert(
        drainedSessionIds.every((id) =>
            children.some((child) => child.id === id && child.activity === "inactive")
        ),
        "minutes child did not drain"
    );
    await runtime.writeResult({
        ok: true,
        scenario,
        browserReady: false,
        meetingId,
        observed: { ...observed, archived, drainedSessionIds },
        assertions: [...assertions, "minutes-archive-equal", "minutes-sessions-drained"]
    });
}
