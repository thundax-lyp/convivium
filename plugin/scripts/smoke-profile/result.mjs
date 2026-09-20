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
    if (expectedScenario === "identity-admission") {
        validateIdentityAdmissionResult(value);
    } else if (expectedScenario === "meeting-business-loop") {
        validateMeetingBusinessLoopResult(value);
    } else {
        throw new Error("Unsupported smoke result scenario: " + expectedScenario);
    }
    return value;
}

function validateMeetingBusinessLoopResult(value) {
    if (
        !exact(value, ["ok", "scenario", "meetingId", "assertions", "observed"]) ||
        value.ok !== true ||
        value.scenario !== "meeting-business-loop" ||
        typeof value.meetingId !== "string" ||
        !isDeepStrictEqual(value.assertions, [
            "target-create",
            "meeting-started",
            "two-evidence",
            "review-batch",
            "worker-authority",
            "published",
            "archived",
            "cold-reopen"
        ]) ||
        !exact(value.observed, [
            "status",
            "evidenceVersionIds",
            "startedNoticeCounts",
            "workerSessionIds",
            "coldReopen"
        ]) ||
        value.observed.status !== "archived" ||
        value.observed.coldReopen !== true ||
        value.observed.evidenceVersionIds.length !== 2 ||
        !exact(value.observed.startedNoticeCounts, [
            "contributor-a",
            "contributor-b",
            "contributor-c",
            "contributor-d",
            "contributor-e"
        ]) ||
        Object.values(value.observed.startedNoticeCounts).some((count) => count !== 1) ||
        value.observed.workerSessionIds.length !== 2 ||
        new Set(value.observed.workerSessionIds).size !== 2
    )
        throw new Error("Meeting business loop smoke result is invalid.");
}

export function validateMeetingBusinessLoopHotResult(value) {
    if (
        !exact(value, ["ok", "scenario", "meetingId", "assertions", "observed"]) ||
        value.ok !== true ||
        value.scenario !== "meeting-business-loop" ||
        typeof value.meetingId !== "string" ||
        !isDeepStrictEqual(value.assertions, [
            "target-create",
            "meeting-started",
            "two-evidence",
            "review-batch",
            "worker-authority",
            "published",
            "archived"
        ]) ||
        !exact(value.observed, [
            "status",
            "evidenceVersionIds",
            "startedNoticeCounts",
            "workerSessionIds"
        ]) ||
        value.observed.status !== "archived" ||
        value.observed.evidenceVersionIds.length !== 2 ||
        !exact(value.observed.startedNoticeCounts, [
            "contributor-a",
            "contributor-b",
            "contributor-c",
            "contributor-d",
            "contributor-e"
        ]) ||
        Object.values(value.observed.startedNoticeCounts).some((count) => count !== 1) ||
        value.observed.workerSessionIds.length !== 2 ||
        new Set(value.observed.workerSessionIds).size !== 2
    )
        throw new Error("Meeting business loop hot smoke result is invalid.");
    return value;
}

export function completeMeetingBusinessLoopResult(hotValue, coldValue) {
    const hot = validateMeetingBusinessLoopHotResult(hotValue);
    if (
        !exact(coldValue, ["ok", "scenario", "meetingId", "status", "archiveStatus"]) ||
        coldValue.ok !== true ||
        coldValue.scenario !== "meeting-business-loop-cold-reopen" ||
        coldValue.meetingId !== hot.meetingId ||
        coldValue.status !== "archived" ||
        coldValue.archiveStatus !== "complete"
    )
        throw new Error("Meeting business loop cold reopen result is invalid.");
    const completed = {
        ...hot,
        assertions: [...hot.assertions, "cold-reopen"],
        observed: { ...hot.observed, coldReopen: true }
    };
    validateMeetingBusinessLoopResult(completed);
    return completed;
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
