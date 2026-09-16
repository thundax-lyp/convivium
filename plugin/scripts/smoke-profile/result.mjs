import { isDeepStrictEqual } from "node:util";

function exact(object, keys) {
    return (
        object &&
        typeof object === "object" &&
        !Array.isArray(object) &&
        Object.keys(object).length === keys.length &&
        keys.every((key) => Object.hasOwn(object, key))
    );
}

export function validateScenarioResult(value, expectedScenario) {
    if (expectedScenario === "parallel-contribution") {
        validateParallelContributionResult(value);
    } else if (expectedScenario === "parallel-contribution-model") {
        validateParallelContributionModelResult(value);
    } else if (expectedScenario === "identity-admission") {
        validateIdentityAdmissionResult(value);
    } else {
        throw new Error("Unsupported smoke result scenario: " + expectedScenario);
    }
    return value;
}

function validateIdentityAdmissionResult(value) {
    if (
        !exact(value, [
            "ok",
            "scenario",
            "catalog",
            "admittedChildId",
            "rejectedCandidateId",
            "nativeSkillLoaded",
            "sessionIndependent"
        ]) ||
        value.ok !== true ||
        value.scenario !== "identity-admission" ||
        !exact(value.catalog, [
            "protocolVersion",
            "meetingId",
            "catalogId",
            "catalogVersion",
            "generatedAt",
            "candidates"
        ]) ||
        value.catalog.candidates.length !== 2 ||
        value.admittedChildId !== "smoke-identity-admit" ||
        value.rejectedCandidateId !== "candidate-reject" ||
        value.nativeSkillLoaded !== true ||
        value.sessionIndependent !== true
    )
        throw new Error("Identity admission smoke result is invalid.");
}

function validateParallelContributionModelResult(value) {
    const assertions = [
        "model-origin-submissions",
        "boundary-before-publication",
        "material-version-readable",
        "review-not-self",
        "structured-comparison",
        "archive-verified"
    ];
    try {
        if (
            !exact(value, [
                "ok",
                "scenario",
                "meetingId",
                "captainSessionId",
                "assertions",
                "observed"
            ]) ||
            value.ok !== true ||
            value.scenario !== "parallel-contribution-model" ||
            typeof value.meetingId !== "string" ||
            !value.meetingId.trim() ||
            value.captainSessionId !== "convivium-smoke-captain" ||
            !isDeepStrictEqual(value.assertions, assertions) ||
            !exact(value.observed, ["status", "messageIds", "archiveVerified", "interventions"]) ||
            value.observed.status !== "archived" ||
            !Array.isArray(value.observed.messageIds) ||
            value.observed.messageIds.length === 0 ||
            new Set(value.observed.messageIds).size !== value.observed.messageIds.length ||
            value.observed.messageIds.some(
                (messageId) => typeof messageId !== "string" || !messageId.trim()
            ) ||
            value.observed.archiveVerified !== true ||
            value.observed.interventions !== 0
        )
            throw new Error("invalid");
    } catch {
        throw new Error("Parallel contribution model result is invalid.");
    }
}

function validateParallelContributionResult(value) {
    const required = [
        "parallel-inflight",
        "private-before-approval",
        "public-exact-version",
        "independent-review",
        "idempotent-publication",
        "stale-rejected",
        "pause-resume-generations"
    ];
    try {
        const browser = value.browserReady;
        const observed = value.observed;
        if (
            value.ok !== true ||
            value.scenario !== "parallel-contribution" ||
            typeof browser !== "boolean" ||
            !exact(value, [
                "ok",
                "scenario",
                "browserReady",
                "meetingId",
                "captainSessionId",
                "assertions",
                "observed"
            ]) ||
            value.captainSessionId !== "convivium-smoke-captain" ||
            typeof value.meetingId !== "string" ||
            !value.meetingId.trim() ||
            !isDeepStrictEqual(value.assertions, [
                ...required,
                ...(browser ? [] : ["archived-material-readable"])
            ]) ||
            !exact(observed, [
                "participantSessionIds",
                "contributionIds",
                "messageIds",
                "evidenceKey",
                "reviewVerdict",
                "status",
                "meetingVersion"
            ]) ||
            observed.participantSessionIds.length !== 3 ||
            new Set(observed.participantSessionIds).size !== 3 ||
            observed.contributionIds.length !== 2 ||
            new Set(observed.contributionIds).size !== 2 ||
            observed.messageIds.length !== 2 ||
            new Set(observed.messageIds).size !== 2 ||
            ![
                ...observed.participantSessionIds,
                ...observed.contributionIds,
                ...observed.messageIds,
                observed.evidenceKey
            ].every((item) => typeof item === "string" && item.trim().length > 0) ||
            observed.reviewVerdict !== "supports" ||
            observed.status !== (browser ? "running" : "archived") ||
            !Number.isSafeInteger(observed.meetingVersion) ||
            observed.meetingVersion < 0
        )
            throw new Error("invalid");
    } catch {
        throw new Error("Parallel contribution result is invalid.");
    }
}
