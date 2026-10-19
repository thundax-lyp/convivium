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

export const validateScenarioResult = (value, expectedScenario) => {
    if (expectedScenario === "research-targets") {
        if (
            value?.ok !== true ||
            value.scenario !== "research-targets" ||
            value.cases?.length !== 3 ||
            value.cases.some(
                (c) =>
                    c.planning?.status !== "accepted" ||
                    c.roundCount !== 0 ||
                    c.planning.plan.originalQuestion !== c.question ||
                    !c.skillLoaded ||
                    !c.planningCalled
            )
        ) {
            throw new Error("Research targets smoke did not validate three real planning flows");
        }
    } else if (expectedScenario === "acp-codex-reviewer-web") {
        validateAcpCodexReviewerWebResult(value);
    } else if (expectedScenario === "identity-admission") {
        validateIdentityAdmissionResult(value);
    } else if (expectedScenario === "meeting-business-loop") {
        validateMeetingBusinessLoopResult(value);
    } else if (expectedScenario === "peer-meeting-agents") {
        validatePeerMeetingAgentsResult(value);
    } else {
        throw new Error("Unsupported smoke result scenario: " + expectedScenario);
    }
    return value;
};

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
        !exact(value.observed.startedNoticeCounts, ["contributor-a", "contributor-b"]) ||
        Object.values(value.observed.startedNoticeCounts).some((count) => count !== 1) ||
        value.observed.workerSessionIds.length !== 8 ||
        new Set(value.observed.workerSessionIds).size !== 8 ||
        value.observed.subtopicOrigin !== "manager-round-goal"
    ) {
        throw new Error("Meeting business loop smoke result is invalid.");
    }
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
        !exact(value.observed.startedNoticeCounts, ["contributor-a", "contributor-b"]) ||
        Object.values(value.observed.startedNoticeCounts).some((count) => count !== 1) ||
        value.observed.workerSessionIds.length !== 8 ||
        new Set(value.observed.workerSessionIds).size !== 8 ||
        value.observed.subtopicOrigin !== "manager-round-goal"
    ) {
        throw new Error("Meeting business loop hot smoke result is invalid.");
    }
    return value;
}

function validRoundTrace(rounds) {
    return (
        Array.isArray(rounds) &&
        rounds.length === 4 &&
        isDeepStrictEqual(
            rounds.map((round) => round.id),
            ["identity", "model", "long-lived-agent", "evaluation"]
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
    ) {
        throw new Error("Meeting business loop cold reopen result is invalid.");
    }
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
    ) {
        throw new Error("Identity admission smoke result is invalid.");
    }
}

export const PEER_SKILLS = Object.freeze({
    meeting_manager: ["meeting-facilitation", "research-planning"],
    verification_reviewer: ["arxiv", "evidence-review", "github", "repository-analysis"],
    github_research_analyst: ["github"],
    arxiv_research_analyst: ["arxiv"]
});
export const PEER_ASSERTIONS = [
    "four-peer-sessions",
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
        new Set(Object.values(observed.sessionIds)).size !== 4 ||
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
        observed.github.ref !== "dsh-v0.2.0-rc.2" ||
        !exact(observed.arxiv, ["url", "id", "version"]) ||
        observed.arxiv.url !== "https://arxiv.org/abs/1706.03762v7" ||
        observed.arxiv.id !== "1706.03762" ||
        observed.arxiv.version !== "v7" ||
        !exact(observed.review, ["versionId", "reviewId"]) ||
        !Object.values(observed.review).every(nonempty) ||
        observed.coldRecovery !== coldRecovery
    ) {
        throw new Error("Peer meeting agents smoke result is invalid.");
    }
    return value;
}

export const validateAcpCodexReviewerWebResult = (value) => {
    const observed = value?.observed;
    const roles = [
        "meeting_manager",
        "verification_reviewer",
        "github_research_analyst",
        "arxiv_research_analyst",
        "web_research_analyst"
    ];
    const text = (item) => typeof item === "string" && item.trim().length > 0;
    if (
        !exact(value, ["ok", "scenario", "meetingId", "observed"]) ||
        value.ok !== true ||
        value.scenario !== "acp-codex-reviewer-web" ||
        !text(value.meetingId) ||
        !exact(observed, [
            "sessionIds",
            "reviewer",
            "web",
            "timedOutContributions",
            "rounds",
            "coldRecovery",
            "authorizationRejected",
            "archiveComplete"
        ]) ||
        !exact(observed.sessionIds, roles) ||
        !Object.values(observed.sessionIds).every(text) ||
        new Set(Object.values(observed.sessionIds)).size !== 5 ||
        !exact(observed.reviewer, [
            "provider",
            "model",
            ...(Object.hasOwn(observed.reviewer ?? {}, "reasoningEffort")
                ? ["reasoningEffort"]
                : []),
            "workerProvider",
            "workerModel",
            "hostValidatedReviews"
        ]) ||
        observed.reviewer.provider !== "acp-codex" ||
        !text(observed.reviewer.model) ||
        observed.reviewer.workerProvider !== "spawn" ||
        observed.reviewer.workerModel !== observed.reviewer.model ||
        !Number.isInteger(observed.reviewer.hostValidatedReviews) ||
        observed.reviewer.hostValidatedReviews < 2 ||
        !Number.isInteger(observed.timedOutContributions) ||
        observed.timedOutContributions < 0 ||
        !exact(observed.web, ["searchCalls", "sources", "blockedSources"]) ||
        !Number.isInteger(observed.web.searchCalls) ||
        observed.web.searchCalls < 2 ||
        !Array.isArray(observed.web.sources) ||
        !Array.isArray(observed.web.blockedSources) ||
        observed.web.blockedSources.some(
            (source) =>
                !exact(source, ["roundId", "url", "errorCode", "reason"]) ||
                ![source.roundId, source.url, source.reason].every(text) ||
                source.errorCode !== "WEB_BLOCKED_URL" ||
                !source.reason.includes("resolves to a non-public IP address")
        ) ||
        observed.web.sources.some(
            (source) =>
                !exact(source, [
                    "roundId",
                    "url",
                    "title",
                    "publishedAt",
                    "accessedAt",
                    "contentSha256"
                ]) ||
                ![
                    source.roundId,
                    source.url,
                    source.title,
                    source.publishedAt,
                    source.accessedAt
                ].every(text) ||
                !/^[a-f0-9]{64}$/.test(source.contentSha256) ||
                Number.isNaN(Date.parse(source.accessedAt))
        ) ||
        observed.rounds !== 2 ||
        observed.coldRecovery !== true ||
        observed.authorizationRejected !== true ||
        observed.archiveComplete !== true
    ) {
        throw new Error("ACP Codex Web smoke result is invalid");
    }
    const records = [...observed.web.sources, ...observed.web.blockedSources];
    const rounds = [...new Set(records.map((source) => source.roundId))];
    if (
        rounds.length !== 2 ||
        rounds.some((round) => {
            const domains = new Set(
                records
                    .filter((source) => source.roundId === round)
                    .map((source) => new URL(source.url).hostname)
            );
            return (
                records.filter((source) => source.roundId === round).length !== 2 ||
                !domains.has("agentclientprotocol.com") ||
                !domains.has("deepseek-harness.github.io")
            );
        })
    ) {
        throw new Error("ACP Web per-round source domains missing");
    }
    return value;
};
