import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { openRound } from "@/domain/transitions/round.ts";
import { disposeHandRaise, raiseHand } from "@/domain/transitions/hand-raise.ts";
import { submitEvidence } from "@/domain/transitions/format-evidence.ts";

function stateWithContribution() {
    const state = makeRunningMeetingStateV1();
    state.managerPlans = [
        {
            id: "plan-v1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            kind: "open_round",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "output" },
            rationale: "plan",
            createdAt: 0,
            status: "active"
        }
    ];
    const opened = openRound(state, {
        roundId: "round-v1",
        agendaId: "agenda-v1",
        planId: "plan-v1",
        managerId: "manager-v1",
        now: 1
    });
    if (opened.kind !== "accepted") {
        throw new Error("round");
    }
    const raised = raiseHand(opened.state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        purpose: "提交",
        now: 2
    });
    if (raised.kind !== "accepted") {
        throw new Error("hand");
    }
    const accepted = disposeHandRaise(raised.state, {
        roundId: "round-v1",
        contributorId: "contributor-v1",
        managerId: "manager-v1",
        disposition: "accepted",
        reason: "接纳",
        contributionId: "contribution-v1",
        now: 3
    });
    if (accepted.kind !== "accepted") {
        throw new Error("accept");
    }
    return accepted.state;
}
const evidence = {
    summary: "观点摘要",
    observation: "观察",
    interpretation: "解释",
    method: "方法",
    falsifiers: [{ value: "反证", reason: "理由" }],
    uncertainties: [{ value: "不确定", reason: "理由" }],
    limitations: [{ value: "限制", reason: "理由" }],
    claims: [
        { id: "claim-v1", statement: "主张", materialIds: ["material-v1"], qualification: "限定" }
    ],
    materials: [
        {
            id: "material-v1",
            kind: "document" as const,
            originator: "来源者",
            originalSource: "出处",
            sourcePublishedAt: "2026",
            acquiredAt: "2026",
            version: "1",
            locator: "loc",
            location: "url",
            verificationConditions: "条件",
            limitations: "限制",
            sharedDependencies: []
        }
    ]
};

describe("format and evidence transitions", () => {
    it("directly registers one complete version for the contributor", () => {
        const state = stateWithContribution();
        const result = submitEvidence(state, {
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            evidence,
            packageId: "package-v1",
            versionId: "version-v1",
            now: 4
        });
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") {
            return;
        }
        expect(result.state.evidencePackages[0].versions).toHaveLength(1);
        expect(result.state.evidencePackages[0].versions[0]).toMatchObject({
            summary: "观点摘要",
            observation: "观察"
        });
        expect(result.state.registrations[0].status).toBe("complete");
        expect(result.state.registrations[0]).toEqual({
            id: "registration-version-v1",
            versionId: "version-v1",
            status: "complete",
            createdAt: 4
        });
        expect(result.effectRequests).toEqual([
            {
                kind: "agent_notice",
                noticeKind: "review_request",
                recipientId: "reviewer-v1",
                agendaId: "agenda-v1",
                versionId: "version-v1"
            }
        ]);
    });
    it("rejects a blank viewpoint summary without registering evidence", () => {
        const state = stateWithContribution();
        const result = submitEvidence(state, {
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            evidence: { ...evidence, summary: " " },
            packageId: "package-v1",
            versionId: "version-v1",
            now: 4
        });
        expect(result.kind).toBe("rejected");
        expect(result.state).toBe(state);
    });
    it("rejects an incorrect author atomically", () => {
        const state = stateWithContribution();
        const result = submitEvidence(state, {
            contributionId: "contribution-v1",
            authorId: "manager-v1",
            evidence,
            packageId: "package-v1",
            versionId: "version-v1",
            now: 4
        });
        expect(result.kind).toBe("rejected");
        expect(result.kind === "rejected" && result.state).toBe(state);
        expect(result.kind === "rejected" && result.error.code).toBe("UNAUTHORIZED");
    });
    it("rejects initial evidence at the earliest persisted deadline", () => {
        const state = stateWithContribution();
        const deadlineState = {
            ...state,
            rounds: state.rounds.map((round) => ({ ...round, deadlineAt: 4 }))
        };
        const result = submitEvidence(deadlineState, {
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            evidence,
            packageId: "package-v1",
            versionId: "version-v1",
            now: 4
        });
        expect(result).toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED" },
            state: deadlineState
        });
    });
    it("rejects a second registration in the same Round", () => {
        const first = submitEvidence(stateWithContribution(), {
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            evidence,
            packageId: "package-v1",
            versionId: "version-v1",
            now: 4
        });
        if (first.kind !== "accepted") {
            throw new Error("initial evidence did not register");
        }
        const result = submitEvidence(first.state, {
            contributionId: "contribution-v1",
            authorId: "contributor-v1",
            evidence,
            packageId: "package-v2",
            versionId: "version-v2",
            now: 5
        });
        expect(result).toMatchObject({
            kind: "rejected",
            error: { code: "INVALID_STATE" },
            state: first.state
        });
    });
});
