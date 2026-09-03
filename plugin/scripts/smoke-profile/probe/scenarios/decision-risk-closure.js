export async function runDecisionRiskClosureScenario(runtime) {
    const { ctx, scenario } = runtime;
    const input = runtime.createInput();
    input.requestId = "smoke-decision-risk-create-1";
    input.topic = "Decision risk closure";
    input.objectiveContract.acceptableRiskLevel = "high";
    input.agenda[0].requiredParticipantKeys = ["a"];
    input.participants = [{ participantKey: "a", displayName: "A" }];

    const created = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_create_meeting",
        input,
        1100
    );
    const meetingId = created.result.meetingId;
    const initialStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1101
    );
    const manager = await runtime.waitForAgent(ctx, meetingId + "-manager-manager");
    const managerContext = await runtime.waitForStoredManagerContext(manager.id, meetingId, "");
    const plan = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: managerContext.planningAttemptId,
            observedMeetingVersion: managerContext.meetingVersion,
            requestId: "smoke-decision-risk-plan-1",
            agendaItemId: initialStatus.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Submit a proposal and decision candidate",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-a",
                    instruction: "Submit the proposal",
                    reason: "manager_selected"
                }
            ]
        },
        1102
    );
    const participantSessionId = meetingId + "-participant-participant-a";
    const delivery = await runtime.waitForSpeakerContext(
        ctx,
        participantSessionId,
        plan.result.firstAttemptId
    );
    const deliveryId = delivery.value.attempt.deliveryId;
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
            deliveryId,
            agendaItemId: delivery.value.activeAgendaItem.id,
            kind: "proposal",
            content: "Use the accepted proposal",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {
                proposals: [
                    {
                        title: "Closure proposal",
                        description: "Use the accepted proposal."
                    }
                ],
                positions: [
                    {
                        proposalId: deliveryId + "-proposal-1",
                        proposalRevision: 1,
                        position: "accept",
                        blocking: false
                    }
                ],
                decisionProposals: [
                    {
                        proposalId: deliveryId + "-proposal-1",
                        proposalRevision: 1,
                        statement: "Accept the closure proposal",
                        rationale: "The proposal satisfies the objective."
                    }
                ],
                questions: [],
                issues: [],
                agendaCandidates: []
            }
        },
        1103
    );
    const candidateStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1104
    );
    const candidates = candidateStatus.result.pendingDecisionCandidates;
    runtime.assert(
        Array.isArray(candidates) && candidates.length === 1,
        "pending decision candidate missing"
    );
    const candidate = candidates[0];
    runtime.assert(candidate.proposalRevision === 1, "candidate revision mismatch");
    runtime.assert(
        candidate.sourceMessageId === submitted.result.messageId,
        "candidate source message mismatch"
    );

    const accepted = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_accept_decision",
        {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: candidateStatus.meetingVersion,
            requestId: "smoke-decision-risk-accept-1",
            decisionCandidateId: candidate.id,
            reason: "Captain accepts the candidate.",
            evidenceMessageIds: [submitted.result.messageId]
        },
        1105
    );
    const acceptedStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1106
    );
    runtime.assert(
        acceptedStatus.result.pendingDecisionCandidates.length === 0,
        "accepted candidate remained pending"
    );
    runtime.assert(
        acceptedStatus.result.acceptedDecisions.some(
            (decision) => decision.id === accepted.result.decisionId
        ),
        "accepted decision missing"
    );
    runtime.assert(
        acceptedStatus.result.decisionHistory.some(
            (decision) => decision.id === accepted.result.decisionId
        ),
        "decision history missing accepted decision"
    );
    const pauseAfterAcceptance = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_pause_meeting",
        {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: acceptedStatus.meetingVersion,
            reason: "Refresh decision lifecycle planning context.",
            requestId: "smoke-decision-risk-pause-1"
        },
        1107
    );
    const resumeAfterAcceptance = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_resume_meeting",
        {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: pauseAfterAcceptance.meetingVersion,
            requestId: "smoke-decision-risk-resume-1"
        },
        1110
    );
    const laterManagerContext = await runtime.waitForStoredManagerContext(
        manager.id,
        meetingId,
        managerContext.planningAttemptId,
        resumeAfterAcceptance.meetingVersion
    );
    const replacementPlan = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: laterManagerContext.planningAttemptId,
            observedMeetingVersion: laterManagerContext.meetingVersion,
            requestId: "smoke-decision-risk-plan-2",
            agendaItemId: acceptedStatus.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Submit a replacement decision candidate",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-a",
                    instruction: "Revise the proposal",
                    reason: "manager_selected"
                }
            ]
        },
        1111
    );
    const replacementDelivery = await runtime.waitForSpeakerContext(
        ctx,
        participantSessionId,
        replacementPlan.result.firstAttemptId
    );
    const replacementDeliveryId = replacementDelivery.value.attempt.deliveryId;
    const replacementSubmitted = await runtime.callTool(
        ctx,
        replacementDelivery.agent,
        "convivium_submit_turn",
        {
            protocolVersion: 1,
            meetingId,
            turnId: replacementDelivery.value.turn.id,
            stepId: replacementDelivery.value.step.id,
            attemptId: replacementDelivery.value.attempt.attemptId,
            deliveryId: replacementDeliveryId,
            agendaItemId: replacementDelivery.value.activeAgendaItem.id,
            kind: "proposal",
            content: "Revise the accepted proposal",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {
                proposals: [
                    {
                        proposalId: candidate.proposalId,
                        expectedRevision: 1,
                        title: "Closure proposal revision",
                        description: "Use the revised accepted proposal."
                    }
                ],
                positions: [
                    {
                        proposalId: candidate.proposalId,
                        proposalRevision: 2,
                        position: "accept",
                        blocking: false
                    }
                ],
                decisionProposals: [
                    {
                        proposalId: candidate.proposalId,
                        proposalRevision: 2,
                        statement: "Accept the revised closure proposal",
                        rationale: "The revision addresses the new evidence."
                    }
                ],
                questions: [],
                issues: [],
                agendaCandidates: []
            }
        },
        1108
    );
    const replacementCandidateStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1109
    );
    const replacementCandidates = replacementCandidateStatus.result.pendingDecisionCandidates;
    runtime.assert(
        replacementCandidates.length === 1 &&
            replacementCandidates[0].proposalRevision === 2 &&
            replacementCandidates[0].proposalId === candidate.proposalId,
        "replacement candidate revision is not pending"
    );
    const replacementCandidate = replacementCandidates[0];
    const supersedeInput = {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: replacementCandidateStatus.meetingVersion,
        requestId: "smoke-decision-risk-supersede-1",
        decisionId: accepted.result.decisionId,
        action: "supersede",
        reason: "Supersede with the revised candidate.",
        evidenceMessageIds: [submitted.result.messageId, replacementSubmitted.result.messageId],
        replacementCandidateId: replacementCandidate.id
    };
    const superseded = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_dispose_decision",
        supersedeInput,
        1112
    );
    const supersedeReplay = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_dispose_decision",
        supersedeInput,
        1113
    );
    runtime.assert(
        JSON.stringify(supersedeReplay.result) === JSON.stringify(superseded.result),
        "decision supersede replay result mismatch"
    );
    runtime.assert(
        supersedeReplay.meetingVersion === superseded.meetingVersion,
        "decision supersede replay changed meeting version"
    );
    const supersededStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1114
    );
    const oldDecision = supersededStatus.result.decisionHistory.find(
        (decision) => decision.id === accepted.result.decisionId
    );
    const replacementDecision = supersededStatus.result.decisionHistory.find(
        (decision) => decision.id === superseded.result.replacementDecisionId
    );
    runtime.assert(oldDecision?.status === "superseded", "old decision was not superseded");
    runtime.assert(
        oldDecision.supersededByDecisionId === replacementDecision?.id,
        "superseded decision link is missing"
    );
    runtime.assert(
        replacementDecision?.status === "accepted",
        "replacement decision is not accepted"
    );
    runtime.assert(
        supersededStatus.result.acceptedDecisions.length === 1 &&
            supersededStatus.result.acceptedDecisions[0].id === replacementDecision.id,
        "replacement decision is not the current accepted decision"
    );
    runtime.assert(
        supersededStatus.result.pendingDecisionCandidates.length === 0,
        "superseded candidate remained pending"
    );
    const revokeInput = {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: supersededStatus.meetingVersion,
        requestId: "smoke-decision-risk-revoke-1",
        decisionId: replacementDecision.id,
        action: "revoke",
        reason: "Revoke the replacement decision.",
        evidenceMessageIds: [replacementSubmitted.result.messageId]
    };
    const revoked = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_dispose_decision",
        revokeInput,
        1115
    );
    const revokedStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1116
    );
    const history = revokedStatus.result.decisionHistory;
    runtime.assert(history.length === 2, "decision history does not retain both decisions");
    runtime.assert(
        history[0].id === oldDecision.id && history[0].status === "superseded",
        "decision history order changed"
    );
    runtime.assert(
        history[1].id === replacementDecision.id && history[1].status === "revoked",
        "replacement revoke missing from history"
    );
    runtime.assert(
        revokedStatus.result.acceptedDecisions.length === 0,
        "revoked decision remains current accepted"
    );
    runtime.assert(revoked.result.action === "revoke", "revoke result action mismatch");
    const pauseAfterRevoke = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_pause_meeting",
        {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: revokedStatus.meetingVersion,
            reason: "Refresh risk lifecycle planning context.",
            requestId: "smoke-decision-risk-pause-2"
        },
        1117
    );
    const resumeAfterRevoke = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_resume_meeting",
        {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: pauseAfterRevoke.meetingVersion,
            requestId: "smoke-decision-risk-resume-2"
        },
        1118
    );
    const riskManagerContext = await runtime.waitForStoredManagerContext(
        manager.id,
        meetingId,
        laterManagerContext.planningAttemptId,
        resumeAfterRevoke.meetingVersion
    );
    const riskPlan = await runtime.callTool(
        ctx,
        manager,
        "convivium_submit_manager_plan",
        {
            protocolVersion: 1,
            meetingId,
            planningAttemptId: riskManagerContext.planningAttemptId,
            observedMeetingVersion: riskManagerContext.meetingVersion,
            requestId: "smoke-decision-risk-plan-3",
            agendaItemId: revokedStatus.result.activeAgendaItem.id,
            intent: "explore",
            objective: "Submit risk evidence",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-a",
                    instruction: "Submit the risk",
                    reason: "manager_selected"
                }
            ]
        },
        1119
    );
    const riskDelivery = await runtime.waitForSpeakerContext(
        ctx,
        participantSessionId,
        riskPlan.result.firstAttemptId
    );
    const riskSubmitted = await runtime.callTool(
        ctx,
        riskDelivery.agent,
        "convivium_submit_turn",
        {
            protocolVersion: 1,
            meetingId,
            turnId: riskDelivery.value.turn.id,
            stepId: riskDelivery.value.step.id,
            attemptId: riskDelivery.value.attempt.attemptId,
            deliveryId: riskDelivery.value.attempt.deliveryId,
            agendaItemId: riskDelivery.value.activeAgendaItem.id,
            kind: "statement",
            content: "The proposal has a high risk.",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic",
            changes: {
                proposals: [],
                positions: [],
                decisionProposals: [],
                questions: [],
                issues: [
                    {
                        title: "Closure risk",
                        description: "The revised proposal has a high implementation risk.",
                        affectedOutputIds: [],
                        affectedCriterionIds: ["criterion-smoke-order"],
                        violatedConstraintIds: [],
                        impact: "high",
                        urgency: "now",
                        safeDefaultAvailable: false,
                        riskLevel: "high"
                    }
                ],
                agendaCandidates: []
            }
        },
        1120
    );
    const riskStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1121
    );
    const risk = riskStatus.result.risks.find((item) => item.title === "Closure risk");
    runtime.assert(
        risk?.status === "open" && risk.disposition === "blocking" && risk.blocking,
        "open risk state mismatch"
    );
    runtime.assert(
        riskStatus.result.blockingFacts.some((fact) => fact.id === risk.id),
        "open risk missing from blocking facts"
    );
    const riskAcceptInput = {
        protocolVersion: 1,
        meetingId,
        expectedMeetingVersion: riskStatus.meetingVersion,
        requestId: "smoke-decision-risk-accept-risk-1",
        issueId: risk.id,
        decision: "accept",
        reason: "Captain accepts the documented risk.",
        evidenceMessageIds: [riskSubmitted.result.messageId]
    };
    const riskAccepted = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_dispose_risk",
        riskAcceptInput,
        1122
    );
    const acceptedRiskStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1123
    );
    const acceptedRisk = acceptedRiskStatus.result.risks.find((item) => item.id === risk.id);
    runtime.assert(
        acceptedRisk?.status === "accepted_risk" &&
            acceptedRisk.disposition === "accepted_risk" &&
            !acceptedRisk.blocking,
        "accepted risk state mismatch"
    );
    runtime.assert(
        !acceptedRiskStatus.result.blockingFacts.some((fact) => fact.id === risk.id),
        "accepted risk remains blocking"
    );
    const riskReplay = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_dispose_risk",
        riskAcceptInput,
        1124
    );
    runtime.assert(
        JSON.stringify(riskReplay.result) === JSON.stringify(riskAccepted.result),
        "risk replay result mismatch"
    );
    runtime.assert(
        riskReplay.meetingVersion === riskAccepted.meetingVersion,
        "risk replay changed meeting version"
    );
    const riskRejected = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_dispose_risk",
        {
            ...riskAcceptInput,
            expectedMeetingVersion: acceptedRiskStatus.meetingVersion,
            requestId: "smoke-decision-risk-reject-risk-1",
            decision: "reject",
            reason: "Captain rejects the risk acceptance.",
            evidenceMessageIds: [riskSubmitted.result.messageId]
        },
        1125
    );
    const rejectedRiskStatus = await runtime.callTool(
        ctx,
        runtime.captain.agent,
        "convivium_meeting_status",
        { protocolVersion: 1, meetingId },
        1126
    );
    const rejectedRisk = rejectedRiskStatus.result.risks.find((item) => item.id === risk.id);
    runtime.assert(
        rejectedRisk?.status === "open" &&
            rejectedRisk.disposition === "blocking" &&
            rejectedRisk.blocking,
        "rejected risk state mismatch"
    );
    runtime.assert(
        rejectedRiskStatus.result.blockingFacts.some((fact) => fact.id === risk.id),
        "rejected risk missing from blocking facts"
    );
    runtime.assert(
        riskAccepted.result.completionFactId !== riskRejected.result.completionFactId,
        "risk re-disposition did not create a new fact"
    );
    await runtime.writeResult({
        ok: true,
        scenario,
        assertions: [
            "candidate-visible-to-captain",
            "candidate-accepted",
            "accepted-candidate-not-pending",
            "decision-history-current-state",
            "decision-pending-by-current-revision",
            "risk-disposition-status",
            "risk-blocking-facts",
            "risk-replay-version-stable",
            "event-order-not-observable-by-command-status"
        ],
        meetingId,
        observed: {
            decisionHistory: rejectedRiskStatus.result.decisionHistory,
            acceptedDecisions: rejectedRiskStatus.result.acceptedDecisions,
            pendingDecisionCandidates: rejectedRiskStatus.result.pendingDecisionCandidates,
            risk: rejectedRisk,
            blockingFacts: rejectedRiskStatus.result.blockingFacts,
            riskCompletionFactIds: [
                riskAccepted.result.completionFactId,
                riskRejected.result.completionFactId
            ]
        }
    });
}
