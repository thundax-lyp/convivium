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
            "four-fixture-rounds",
            "four-review-batches",
            "worker-authority",
            "four-published-rounds",
            "archived",
            "cold-reopen"
        ]) ||
        !exact(value.observed, [
            "status",
            "rounds",
            "startedNoticeCounts",
            "workerSessionIds",
            "subtopicOrigin",
            "coldReopen"
        ]) ||
        value.observed.status !== "archived" ||
        value.observed.coldReopen !== true ||
        !validRoundTrace(value.observed.rounds) ||
        !exact(value.observed.startedNoticeCounts, [
            "contributor-a",
            "contributor-b",
            "contributor-c",
            "contributor-d",
            "contributor-e"
        ]) ||
        Object.values(value.observed.startedNoticeCounts).some((count) => count !== 1) ||
        value.observed.workerSessionIds.length !== 8 ||
        new Set(value.observed.workerSessionIds).size !== 8 ||
        value.observed.subtopicOrigin !== "manager-round-goal"
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
            "four-fixture-rounds",
            "four-review-batches",
            "worker-authority",
            "four-published-rounds",
            "archived"
        ]) ||
        !exact(value.observed, [
            "status",
            "rounds",
            "startedNoticeCounts",
            "workerSessionIds",
            "subtopicOrigin"
        ]) ||
        value.observed.status !== "archived" ||
        !validRoundTrace(value.observed.rounds) ||
        !exact(value.observed.startedNoticeCounts, [
            "contributor-a",
            "contributor-b",
            "contributor-c",
            "contributor-d",
            "contributor-e"
        ]) ||
        Object.values(value.observed.startedNoticeCounts).some((count) => count !== 1) ||
        value.observed.workerSessionIds.length !== 8 ||
        new Set(value.observed.workerSessionIds).size !== 8 ||
        value.observed.subtopicOrigin !== "manager-round-goal"
    )
        throw new Error("Meeting business loop hot smoke result is invalid.");
    return value;
}

function validRoundTrace(rounds) {
    return (
        Array.isArray(rounds) &&
        rounds.length === 4 &&
        isDeepStrictEqual(
            rounds.map((round) => round.id),
            ["literature", "source", "implementation", "decision"]
        ) &&
        rounds.every(
            (round) =>
                typeof round.question === "string" &&
                typeof round.sourceScope === "string" &&
                typeof round.roundId === "string" &&
                typeof round.publicationId === "string" &&
                Array.isArray(round.evidenceVersionIds) &&
                round.evidenceVersionIds.length === 2 &&
                Array.isArray(round.reviewIds) &&
                round.reviewIds.length === 2
        )
    );
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
