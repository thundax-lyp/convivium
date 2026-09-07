export function validateScenarioResult(value, expectedScenario, validateMeetingStatus) {
    if (["convergence-stalled", "convergence-turn-budget-completion"].includes(expectedScenario)) {
        validateConvergenceRuntimeResult(value, expectedScenario, validateMeetingStatus);
        return value;
    }
    if (value === null || typeof value !== "object" || value.ok !== true) {
        throw new Error("Smoke result is not successful.");
    }
    if (value.scenario !== expectedScenario || !Array.isArray(value.assertions)) {
        throw new Error("Smoke result scenario contract mismatch.");
    }
    if (
        expectedScenario === "baseline" &&
        !value.assertions.includes("attendance-reject-tool-zero-effects")
    ) {
        throw new Error("Baseline attendance rejection assertion is missing.");
    }
    if (expectedScenario === "reassign" && value.browserReady === true) {
        const validKeys = [
            "ok",
            "scenario",
            "browserReady",
            "assertions",
            "meetingId",
            "captainSessionId",
            "observed"
        ];
        const observedKeys = [
            "oldAttemptId",
            "currentSpeakerId",
            "currentAttemptId",
            "meetingVersion"
        ];
        const observed = value.observed;
        if (
            Object.keys(value).length !== validKeys.length ||
            validKeys.some((key) => !Object.hasOwn(value, key)) ||
            value.assertions.length !== 1 ||
            value.assertions[0] !== "browser-reassign-ready" ||
            typeof value.meetingId !== "string" ||
            value.meetingId.length === 0 ||
            value.captainSessionId !== "convivium-smoke-captain" ||
            observed === null ||
            typeof observed !== "object" ||
            Object.keys(observed).length !== observedKeys.length ||
            observedKeys.some((key) => !Object.hasOwn(observed, key)) ||
            typeof observed.oldAttemptId !== "string" ||
            observed.oldAttemptId.length === 0 ||
            observed.currentSpeakerId !== "participant-a" ||
            typeof observed.currentAttemptId !== "string" ||
            observed.currentAttemptId.length === 0 ||
            observed.currentAttemptId !== observed.oldAttemptId ||
            !Number.isInteger(observed.meetingVersion) ||
            observed.meetingVersion < 0
        ) {
            throw new Error("Reassign browser-ready result is invalid.");
        }
        return value;
    }
    if (expectedScenario === "decision-risk-closure") {
        const requiredAssertions = [
            "candidate-visible-to-captain",
            "candidate-accepted",
            "accepted-candidate-not-pending",
            "decision-history-current-state",
            "decision-pending-by-current-revision",
            "risk-disposition-status",
            "risk-blocking-facts",
            "risk-replay-version-stable",
            "event-order-not-observable-by-command-status"
        ];
        if (requiredAssertions.some((label) => !value.assertions.includes(label))) {
            throw new Error("Decision risk smoke assertions are incomplete.");
        }
    }
    if (expectedScenario === "convergence") {
        const requiredAssertions = [
            "deterministic-fallback",
            "fallback-replay-idempotent",
            "fallback-status-projected"
        ];
        if (
            value.assertions.length !== requiredAssertions.length ||
            requiredAssertions.some((label) => !value.assertions.includes(label))
        ) {
            throw new Error("Convergence smoke assertions are incomplete.");
        }
    }
    return value;
}

function validateConvergenceRuntimeResult(value, scenario, validateMeetingStatus) {
    const requireValid = (condition) => {
        if (!condition) throw new Error("Convergence runtime result is invalid.");
    };
    try {
        requireValid(
            value?.ok === true && value.scenario === scenario && Array.isArray(value.assertions)
        );
        const o = value.observed,
            a = o.archived;
        // Validate the real DTO using the product contract. Driver assertions own
        // intermediate state transitions; this boundary checks the persisted result.
        validateMeetingStatus(structuredClone(a));
        const budget = scenario === "convergence-turn-budget-completion";
        const count = budget ? 2 : 4;
        const code = budget ? "objective_satisfied" : "stalled";
        const p = a.archive.package;
        requireValid(
            a.status === "archived" &&
                a.meetingId === value.meetingId &&
                p.meetingId === value.meetingId &&
                a.meetingVersion === o.archivedVersion &&
                a.termination.code === code &&
                p.termination.code === code &&
                a.termination.reason === p.termination.reason
        );
        requireValid(
            [
                "currentTurn",
                "currentSpeakerId",
                "currentAttemptId",
                "stallCount",
                "replanCount",
                "maxStalls",
                "maxReplans"
            ].every((key) => !Object.hasOwn(a, key))
        );
        requireValid(a.meetingTasks.length === 0 && a.pendingHandRaises.length === 0);
        requireValid(
            o.submissions.length === count &&
                p.formalTranscript.length === count &&
                o.submissions.at(-1).meetingStatus === (budget ? "converging" : "partial") &&
                o.archivedVersion > o.submissions.at(-1).meetingVersion
        );
        for (const [i, message] of p.formalTranscript.entries()) {
            const submitted = o.submissions[i];
            requireValid(
                message.id === submitted.messageId &&
                    message.seq === i + 1 &&
                    message.turnId === submitted.turnId &&
                    message.speaker === "participant-a" &&
                    message.content === scenario + ":a:" + (i + 1)
            );
        }
        if (budget) {
            requireValid(
                o.endResult.status === "completed" &&
                    o.endResult.terminationCode === code &&
                    a.limits.maxTurns === 2 &&
                    a.limits.maxTotalMessages === 100 &&
                    p.objectiveContract.acceptanceCriteria[0].satisfied &&
                    p.agenda[0].status === "resolved"
            );
            for (const [kind, subjectId] of [
                ["criterion_evidence", p.objectiveContract.acceptanceCriteria[0].id],
                ["agenda_resolution", p.agenda[0].id]
            ]) {
                requireValid(
                    p.completionFacts.some(
                        (fact) =>
                            fact.kind === kind &&
                            fact.subjectId === subjectId &&
                            fact.status === "active" &&
                            fact.evidenceMessageIds.length === 1 &&
                            fact.evidenceMessageIds[0] === o.submissions[0].messageId
                    )
                );
            }
        }
        requireValid(
            (o.lateSubmit.kind === "protocol" &&
                ["IMMUTABLE_MEETING", "ARCHIVED_MEETING", "UNAUTHORIZED_CALLER"].includes(
                    o.lateSubmit.code
                )) ||
                (o.lateSubmit.kind === "tool" &&
                    ["CAPABILITY_REVOKED", "AGENT_NOT_LIVE"].includes(o.lateSubmit.code))
        );
        const ids = [
            value.meetingId + "-manager-manager",
            value.meetingId + "-participant-participant-a"
        ];
        requireValid(
            o.stableAfterLateSubmit === true &&
                o.residentSessionIds.length === 0 &&
                o.children.length === 2 &&
                ids.every((id) =>
                    o.children.some(
                        (child) =>
                            child.id === id &&
                            child.mode === "continuable" &&
                            child.activity === "inactive"
                    )
                )
        );
    } catch {
        throw new Error("Convergence runtime result is invalid.");
    }
}
