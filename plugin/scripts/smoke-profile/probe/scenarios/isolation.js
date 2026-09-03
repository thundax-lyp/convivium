export async function runCrossMeetingScenario(runtime) {
    const { ctx, scenario, captain } = runtime;
    const fixtures = [
        { key: "a", teamId: "smoke-team-a", base: 1000 },
        { key: "b", teamId: "smoke-team-a", base: 1010 },
        { key: "c", teamId: "smoke-team-b", base: 1020 }
    ];
    const meetings = [];
    for (const fixture of fixtures) {
        const input = runtime.createInput();
        input.requestId = "smoke-cross-create-" + fixture.key;
        input.teamId = fixture.teamId;
        input.topic = "Cross meeting " + fixture.key.toUpperCase();
        input.agenda[0].requiredParticipantKeys = ["a"];
        const created = await runtime.callTool(
            ctx,
            captain.agent,
            "convivium_create_meeting",
            input,
            fixture.base
        );
        const isolatedMeetingId = created.result.meetingId;
        const status = await runtime.callTool(
            ctx,
            captain.agent,
            "convivium_meeting_status",
            { protocolVersion: 1, meetingId: isolatedMeetingId },
            fixture.base + 1
        );
        const isolatedManager = await runtime.waitForAgent(
            ctx,
            isolatedMeetingId + "-manager-manager"
        );
        const plan = await runtime.callTool(
            ctx,
            isolatedManager,
            "convivium_submit_manager_plan",
            {
                protocolVersion: 1,
                meetingId: isolatedMeetingId,
                planningAttemptId: isolatedMeetingId + "-planning-1",
                observedMeetingVersion: status.meetingVersion,
                requestId: "smoke-cross-plan-" + fixture.key,
                agendaItemId: status.result.activeAgendaItem.id,
                intent: "explore",
                objective: "Isolated " + fixture.key,
                expectedOutputs: [],
                prohibitedTopics: [],
                steps: [
                    {
                        participantId: "participant-a",
                        instruction: "Submit " + fixture.key,
                        reason: "manager_selected"
                    }
                ]
            },
            fixture.base + 2
        );
        const isolatedDelivery = await runtime.waitForSpeakerContext(
            ctx,
            isolatedMeetingId + "-participant-participant-a",
            plan.result.firstAttemptId
        );
        const submitted = await runtime.callTool(
            ctx,
            isolatedDelivery.agent,
            "convivium_submit_turn",
            {
                protocolVersion: 1,
                meetingId: isolatedMeetingId,
                turnId: isolatedDelivery.value.turn.id,
                stepId: isolatedDelivery.value.step.id,
                attemptId: isolatedDelivery.value.attempt.attemptId,
                deliveryId: isolatedDelivery.value.attempt.deliveryId,
                agendaItemId: isolatedDelivery.value.activeAgendaItem.id,
                kind: "statement",
                content: "cross-meeting:" + fixture.key + ":1",
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
            fixture.base + 3
        );
        const afterSubmit = await runtime.callTool(
            ctx,
            captain.agent,
            "convivium_meeting_status",
            { protocolVersion: 1, meetingId: isolatedMeetingId },
            fixture.base + 1
        );
        const children = await ctx.subagents.listChildren(
            captain.agent.session.id,
            new AbortController().signal
        );
        const sessionIds = children
            .map((child) => child.id)
            .filter((id) => id.startsWith(isolatedMeetingId + "-"))
            .sort();
        runtime.assert(
            sessionIds.length === 4,
            "cross Meeting child ownership invalid " + fixture.key
        );
        meetings.push({
            ...fixture,
            meetingId: isolatedMeetingId,
            manager: isolatedManager,
            participant: isolatedDelivery.agent,
            messageId: submitted.result.messageId,
            status: afterSubmit,
            sessionIds
        });
    }
    const sessionSets = meetings.map((meeting) => new Set(meeting.sessionIds));
    runtime.assert(
        [...sessionSets[0]].every((id) => !sessionSets[1].has(id) && !sessionSets[2].has(id)) &&
            [...sessionSets[1]].every((id) => !sessionSets[2].has(id)),
        "cross Meeting ownership sets overlap"
    );
    const first = meetings[0];
    await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_end_meeting",
        {
            protocolVersion: 1,
            meetingId: first.meetingId,
            expectedMeetingVersion: first.status.meetingVersion,
            outcome: "partial",
            reason: "smoke cross isolation",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: [],
            requestId: "smoke-cross-end-a-1"
        },
        1004
    );
    const firstDeadline = Date.now() + 30000;
    let firstFinal;
    while (Date.now() < firstDeadline) {
        const candidate = await runtime.callTool(
            ctx,
            captain.agent,
            "convivium_meeting_status",
            { protocolVersion: 1, meetingId: first.meetingId },
            1005
        );
        if (candidate.result.status === "archived") {
            firstFinal = candidate;
            break;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    runtime.assert(firstFinal?.result.status === "archived", "cross Meeting A did not archive");
    const secondFinal = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId: meetings[1].meetingId },
        1014
    );
    const thirdFinal = await runtime.callTool(
        ctx,
        captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId: meetings[2].meetingId },
        1024
    );
    runtime.assert(
        secondFinal.meetingVersion === meetings[1].status.meetingVersion &&
            thirdFinal.meetingVersion === meetings[2].status.meetingVersion,
        "cross Meeting cleanup changed another version"
    );
    runtime.assert(
        secondFinal.result.messages.length === 1 &&
            secondFinal.result.messages[0].id === meetings[1].messageId &&
            thirdFinal.result.messages.length === 1 &&
            thirdFinal.result.messages[0].id === meetings[2].messageId,
        "cross Meeting cleanup changed another transcript"
    );
    for (const meeting of meetings.slice(1)) {
        const children = await ctx.subagents.listChildren(
            captain.agent.session.id,
            new AbortController().signal
        );
        const sessionIds = children
            .map((child) => child.id)
            .filter((id) => id.startsWith(meeting.meetingId + "-"))
            .sort();
        runtime.assert(
            JSON.stringify(sessionIds) === JSON.stringify(meeting.sessionIds),
            "cross Meeting cleanup changed another ownership set"
        );
    }
    let crossAccessError;
    try {
        await runtime.callTool(
            ctx,
            first.participant,
            "convivium_meeting_status",
            { protocolVersion: 1, meetingId: meetings[1].meetingId },
            1006
        );
    } catch (error) {
        crossAccessError = String(error);
    }
    runtime.assert(
        crossAccessError?.includes("not live") || crossAccessError?.includes("UNAUTHORIZED"),
        "cross Meeting ownership access was not rejected"
    );
    await runtime.writeResult({
        ok: true,
        scenario,
        assertions: [
            "ownership-sets-disjoint",
            "meeting-a-cleanup-isolated",
            "meeting-b-submitted",
            "team-b-submitted"
        ],
        observed: {
            meetings: meetings.map((meeting, index) => ({
                key: meeting.key,
                teamId: meeting.teamId,
                meetingId: meeting.meetingId,
                messageId: meeting.messageId,
                versionBeforeCleanup: meeting.status.meetingVersion,
                versionAfterCleanup:
                    index === 0
                        ? firstFinal.meetingVersion
                        : index === 1
                          ? secondFinal.meetingVersion
                          : thirdFinal.meetingVersion,
                sessionIds: [...sessionSets[index]]
            })),
            crossAccessError
        }
    });
}
