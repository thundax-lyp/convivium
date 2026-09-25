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
    } else if (expectedScenario === "peer-meeting-agents") {
        validatePeerMeetingAgentsResult(value);
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
            "eight-version-reviews",
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
            "eight-version-reviews",
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
            "admittedIdentityId",
            "admittedSessionId",
            "ownershipId",
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
        ![value.admittedIdentityId, value.admittedSessionId, value.ownershipId].every(
            (item) => typeof item === "string" && item.length > 0
        ) ||
        value.rejectedCandidateId !== "candidate-reject" ||
        value.nativeSkillLoaded !== true ||
        value.sessionIndependent !== true
    )
        throw new Error("Identity admission smoke result is invalid.");
}

export const PEER_SKILLS = Object.freeze({
    meeting_manager: ["meeting-facilitation"],
    domain_architect: ["repository-analysis"],
    runtime_engineer: ["repository-analysis"],
    protocol_ui_engineer: ["repository-analysis"],
    verification_reviewer: ["arxiv", "evidence-review", "github", "repository-analysis"],
    github_research_analyst: ["github"],
    arxiv_research_analyst: ["arxiv"]
});
export const PEER_ASSERTIONS = [
    "seven-peer-sessions",
    "role-skill-isolation",
    "input-session-independent-delivery",
    "user-control-authorization",
    "github-source",
    "arxiv-source",
    "reviewer-worker",
    "cold-recovery"
];
export function validatePeerMeetingAgentsResult(value, coldRecovery = true) {
    const roles = Object.keys(PEER_SKILLS);
    const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
    const observed = value?.observed;
    if (
        !exact(value, ["ok", "scenario", "meetingId", "assertions", "observed"]) ||
        value.ok !== true ||
        value.scenario !== "peer-meeting-agents" ||
        !nonempty(value.meetingId) ||
        !isDeepStrictEqual(value.assertions, PEER_ASSERTIONS) ||
        !exact(observed, [
            "sessionIds",
            "presetIds",
            "skills",
            "userControl",
            "github",
            "arxiv",
            "review",
            "coldRecovery"
        ]) ||
        !exact(observed.sessionIds, roles) ||
        !Object.values(observed.sessionIds).every(nonempty) ||
        new Set(Object.values(observed.sessionIds)).size !== 7 ||
        !exact(observed.presetIds, roles) ||
        roles.some(
            (role) =>
                observed.presetIds[role] !==
                `convivium-${role.replace(/^meeting_/, "").replaceAll("_", "-")}`
        ) ||
        !exact(observed.skills, roles) ||
        roles.some((role) => !isDeepStrictEqual(observed.skills[role], PEER_SKILLS[role])) ||
        !exact(observed.userControl, [
            "inputSessionIndependent",
            "agentRejected",
            "reconnectedUserAccepted"
        ]) ||
        Object.values(observed.userControl).some((value) => value !== true) ||
        !exact(observed.github, ["url", "ref"]) ||
        observed.github.url !== "https://github.com/deepseek-ai/deepseek-harness" ||
        observed.github.ref !== "dsh-v0.1.2-rc.1" ||
        !exact(observed.arxiv, ["url", "id", "version"]) ||
        observed.arxiv.url !== "https://arxiv.org/abs/1706.03762v7" ||
        observed.arxiv.id !== "1706.03762" ||
        observed.arxiv.version !== "v7" ||
        !exact(observed.review, ["versionId", "reviewId"]) ||
        !Object.values(observed.review).every(nonempty) ||
        observed.coldRecovery !== coldRecovery
    )
        throw new Error("Peer meeting agents smoke result is invalid.");
    return value;
}
