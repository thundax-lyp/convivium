export function validateScenarioResult(value, expectedScenario) {
    if (value === null || typeof value !== "object" || value.ok !== true) {
        throw new Error("Smoke result is not successful.");
    }
    if (value.scenario !== expectedScenario || !Array.isArray(value.assertions)) {
        throw new Error("Smoke result scenario contract mismatch.");
    }
    if (expectedScenario === "reassign" && value.browserReady === true) {
        const validKeys = ["ok", "scenario", "browserReady", "assertions", "meetingId", "observed"];
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
