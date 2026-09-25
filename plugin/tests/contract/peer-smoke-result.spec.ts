import { expect, it } from "vitest";
import {
    PEER_ASSERTIONS,
    PEER_SKILLS,
    validateScenarioResult
} from "../../scripts/smoke-profile/result.mjs";
const valid = () => ({
    ok: true,
    scenario: "peer-meeting-agents",
    meetingId: "m",
    assertions: [...PEER_ASSERTIONS],
    observed: {
        sessionIds: Object.fromEntries(
            Object.keys(PEER_SKILLS).map((role) => [role, `session-${role}`])
        ),
        presetIds: Object.fromEntries(
            Object.keys(PEER_SKILLS).map((role) => [
                role,
                `convivium-${role.replace(/^meeting_/, "").replaceAll("_", "-")}`
            ])
        ),
        skills: structuredClone(PEER_SKILLS),
        userControl: {
            inputSessionIndependent: true,
            agentRejected: true,
            reconnectedUserAccepted: true
        },
        github: { url: "https://github.com/deepseek-ai/deepseek-harness", ref: "dsh-v0.1.2-rc.1" },
        arxiv: { url: "https://arxiv.org/abs/1706.03762v7", id: "1706.03762", version: "v7" },
        review: { versionId: "v", reviewId: "r" },
        coldRecovery: true
    }
});
it("accepts only complete peer evidence", () =>
    expect(validateScenarioResult(valid(), "peer-meeting-agents")).toEqual(valid()));
it.each([
    (value) =>
        (value.observed.sessionIds.runtime_engineer = value.observed.sessionIds.domain_architect),
    (value) => (value.observed.presetIds.meeting_manager = "convivium"),
    (value) => value.observed.skills.domain_architect.push("github"),
    (value) => (value.observed.github.ref = "main"),
    (value) => (value.observed.arxiv.version = "v1"),
    (value) => (value.observed.review.reviewId = ""),
    (value) => (value.observed.userControl.inputSessionIndependent = false),
    (value) => (value.observed.userControl.agentRejected = false),
    (value) => (value.observed.userControl.reconnectedUserAccepted = false),
    (value) => (value.observed.coldRecovery = false),
    (value) => (value.observed.apiKey = "unexpected")
])("rejects incomplete or altered observed evidence %#", (change) => {
    const value = valid();
    change(value);
    expect(() => validateScenarioResult(value, "peer-meeting-agents")).toThrow();
});
