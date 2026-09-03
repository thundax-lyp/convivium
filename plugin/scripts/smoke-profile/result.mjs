export function validateScenarioResult(value, expectedScenario) {
    if (value === null || typeof value !== "object" || value.ok !== true) {
        throw new Error("Smoke result is not successful.");
    }
    if (value.scenario !== expectedScenario || !Array.isArray(value.assertions)) {
        throw new Error("Smoke result scenario contract mismatch.");
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
