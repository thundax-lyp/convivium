export function validateScenarioResult(value, expectedScenario) {
    if (expectedScenario === "convergence-stalled") {
        validateConvergenceRuntimeResult(value, expectedScenario);
        return value;
    }
    if (value === null || typeof value !== "object" || value.ok !== true) {
        throw new Error("Smoke result is not successful.");
    }
    if (value.scenario !== expectedScenario || !Array.isArray(value.assertions)) {
        throw new Error("Smoke result scenario contract mismatch.");
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

function validateConvergenceRuntimeResult(value, expectedScenario) {
    const isRecord = (value) =>
        value !== null && typeof value === "object" && !Array.isArray(value);
    const exactKeys = (value, keys) =>
        isRecord(value) &&
        Object.keys(value).length === keys.length &&
        keys.every((key) => Object.hasOwn(value, key));
    const nonempty = (value) => typeof value === "string" && value.length > 0;
    const integer = (value) => Number.isInteger(value) && value >= 0;
    const requireValid = (condition) => {
        if (!condition) throw new Error("Convergence runtime result is invalid.");
    };
    const labels = [
        "first-progress-baseline",
        "refocus-observed",
        "replan-observed",
        "partial-stalled",
        "terminal-submit-rejected",
        "archive-consistent",
        "sessions-drained"
    ];
    const count = 4,
        checkpointCount = 3,
        outcome = "partial",
        code = "stalled";
    requireValid(exactKeys(value, ["ok", "scenario", "assertions", "meetingId", "observed"]));
    requireValid(
        value.ok === true && value.scenario === expectedScenario && nonempty(value.meetingId)
    );
    requireValid(
        Array.isArray(value.assertions) &&
            value.assertions.length === labels.length &&
            labels.every((label, index) => value.assertions[index] === label)
    );
    const o = value.observed;
    requireValid(
        exactKeys(o, [
            "submissions",
            "checkpoints",
            "questionId",
            "proposalId",
            "endResult",
            "archived",
            "archivedVersion",
            "lateSubmit",
            "stableAfterLateSubmit",
            "children",
            "residentSessionIds"
        ])
    );
    requireValid(Array.isArray(o.submissions) && o.submissions.length === count);
    const seen = {
        turnId: new Set(),
        attemptId: new Set(),
        deliveryId: new Set(),
        messageId: new Set()
    };
    for (const [index, s] of o.submissions.entries()) {
        requireValid(
            exactKeys(s, [
                "turnId",
                "turnSeq",
                "attemptId",
                "deliveryId",
                "messageId",
                "messageSeq",
                "meetingVersion",
                "meetingStatus"
            ])
        );
        requireValid(
            s.messageSeq === index + 1 &&
                s.turnSeq === index + 1 &&
                integer(s.meetingVersion) &&
                (index === 0 || s.meetingVersion > o.submissions[index - 1].meetingVersion)
        );
        for (const key of Object.keys(seen)) {
            requireValid(nonempty(s[key]) && !seen[key].has(s[key]));
            seen[key].add(s[key]);
        }
        requireValid(
            s.messageId === "message-" + s.deliveryId &&
                s.meetingStatus === (index === count - 1 ? outcome : "running")
        );
    }
    requireValid(Array.isArray(o.checkpoints) && o.checkpoints.length === checkpointCount);
    for (const [index, c] of o.checkpoints.entries()) {
        requireValid(
            exactKeys(c, [
                "afterSubmission",
                "meetingVersion",
                "status",
                "stallCount",
                "maxStalls",
                "replanCount",
                "maxReplans",
                "nextTurnId",
                "intent",
                "reason"
            ])
        );
        requireValid(
            c.afterSubmission === index + 1 &&
                c.meetingVersion === o.submissions[index].meetingVersion &&
                c.status === "running" &&
                c.maxStalls === 3 &&
                c.maxReplans === 1
        );
        requireValid(
            c.stallCount === index % 3 &&
                c.replanCount === (index % 3 === 2 ? 1 : 0) &&
                c.intent === (index % 3 === 0 ? "explore" : "refocus") &&
                c.reason === ["explore", "refocus", "replan"][index % 3] &&
                c.nextTurnId === o.submissions[index + 1].turnId
        );
    }
    const a = o.archived;
    requireValid(
        isRecord(a) &&
            a.status === "archived" &&
            a.meetingId === value.meetingId &&
            integer(o.archivedVersion) &&
            o.archivedVersion === a.meetingVersion &&
            o.archivedVersion > o.submissions.at(-1).meetingVersion
    );
    requireValid(
        ["currentTurn", "currentSpeakerId", "currentAttemptId", "stallCount", "replanCount"].every(
            (key) => !Object.hasOwn(a, key)
        )
    );
    requireValid(
        Array.isArray(a.pendingHandRaises) &&
            a.pendingHandRaises.length === 0 &&
            Array.isArray(a.meetingTasks) &&
            a.meetingTasks.length === 0
    );
    requireValid(
        isRecord(a.archive) && Number.isFinite(a.archive.archivedAt) && isRecord(a.archive.package)
    );
    const p = a.archive.package;
    requireValid(p.meetingId === value.meetingId && Number.isFinite(p.endedAt));
    for (const termination of [a.termination, p.termination]) {
        requireValid(
            isRecord(termination) &&
                termination.code === code &&
                nonempty(termination.reason) &&
                Array.isArray(termination.decisionIds) &&
                termination.decisionIds.length === 0 &&
                Array.isArray(termination.unresolvedQuestionIds) &&
                termination.unresolvedQuestionIds.length === 0
        );
    }
    requireValid(a.termination.reason === p.termination.reason);
    requireValid(o.questionId === null && o.proposalId === null && o.endResult === null);
    requireValid(Array.isArray(p.formalTranscript) && p.formalTranscript.length === count);
    for (const [index, m] of p.formalTranscript.entries()) {
        const s = o.submissions[index];
        requireValid(
            isRecord(m) &&
                m.id === s.messageId &&
                m.seq === s.messageSeq &&
                m.turnId === s.turnId &&
                m.speaker === "participant-a" &&
                m.content === expectedScenario + ":a:" + (index + 1)
        );
    }
    requireValid(exactKeys(o.lateSubmit, ["kind", "code"]));
    requireValid(
        (o.lateSubmit.kind === "protocol" &&
            ["IMMUTABLE_MEETING", "ARCHIVED_MEETING", "UNAUTHORIZED_CALLER"].includes(
                o.lateSubmit.code
            )) ||
            (o.lateSubmit.kind === "tool" &&
                ["CAPABILITY_REVOKED", "AGENT_NOT_LIVE"].includes(o.lateSubmit.code))
    );
    requireValid(
        o.stableAfterLateSubmit === true &&
            Array.isArray(o.residentSessionIds) &&
            o.residentSessionIds.length === 0
    );
    requireValid(Array.isArray(o.children) && o.children.length === 2);
    const childIds = [
        value.meetingId + "-manager-manager",
        value.meetingId + "-participant-participant-a"
    ];
    for (const [index, child] of o.children.entries())
        requireValid(
            exactKeys(child, ["id", "mode", "activity"]) &&
                child.id === childIds[index] &&
                child.mode === "continuable" &&
                child.activity === "inactive"
        );
}
