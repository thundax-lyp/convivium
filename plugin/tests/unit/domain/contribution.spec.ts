import { isMeetingStateV2 } from "@/domain/index.js";
import { contributionMeeting, contributionNow } from "../../fixtures/contribution.js";
import { describe, expect, it } from "vitest";

function validContributionState() {
    const state = contributionMeeting();
    const authorId = state.participants[0]!.id;
    const reviewerId = state.participants[1]!.id;
    const agendaItemId = state.agenda[0]!.id;
    return {
        schemaVersion: 1,
        reviewerId,
        managerNoticeSeq: 0,
        managerDeadlineAt: contributionNow + 600_000,
        tasks: {
            "contribution-1": {
                id: "contribution-1",
                participantId: authorId,
                agendaItemId,
                instruction: "Research the topic.",
                targetIds: [],
                requiredForCompletion: false,
                requiresEvidenceReview: false,
                generation: 1,
                phase: "preparing",
                basedOnSeq: 0,
                deadlineAt: contributionNow + 600_000,
                createdAt: contributionNow,
                updatedAt: contributionNow,
                currentDraftRevision: 0,
                returnCount: 0,
                drafts: {},
                boundaryReviews: [],
                evidenceReviews: [],
                reviewStatus: "not_required"
            }
        },
        evidence: {}
    };
}

function evidenceVersion(revision: number) {
    return {
        evidenceId: "evidence-1",
        revision,
        key: `evidence-1:${revision}`,
        submittedBy: contributionMeeting().participants[0]!.id,
        submittedAt: contributionNow,
        title: "Source",
        kind: "document",
        source: "fixture",
        sourceDate: "fixture",
        collectedAt: "fixture",
        locator: "fixture",
        observation: "fixture",
        methodAndConditions: "fixture",
        limitations: "fixture",
        dependencies: "fixture",
        material: { kind: "text", text: "fixture" }
    };
}

describe("contribution state structure", () => {
    it("keeps a legacy meeting readable and accepts one complete contribution state", () => {
        const legacy = contributionMeeting();
        expect(isMeetingStateV2(legacy)).toBe(true);
        expect(
            isMeetingStateV2({
                ...legacy,
                contributions: validContributionState()
            } as unknown as MeetingState)
        ).toBe(true);
    });

    it("rejects a contribution whose task references an unknown participant", () => {
        const state = validContributionState();
        state.tasks["contribution-1"]!.participantId = "participant-missing";

        expect(
            isMeetingStateV2({
                ...contributionMeeting(),
                contributions: state
            } as unknown as MeetingState)
        ).toBe(false);
    });

    it("rejects non-contiguous material revisions and mixed message origins", () => {
        const contribution = validContributionState();
        contribution.evidence = { "evidence-1:2": evidenceVersion(2) };
        const mixedOrigin = {
            ...contributionMeeting(),
            transcript: [
                {
                    id: "message-1",
                    seq: 1,
                    turnSeq: 1,
                    turnId: "turn-1",
                    stepId: "step-1",
                    attemptId: "attempt-1",
                    contributionId: "contribution-1",
                    contributionRevision: 1,
                    speaker: contributionMeeting().participants[0]!.id,
                    agendaItemId: contributionMeeting().agenda[0]!.id,
                    agendaRelation: "on_topic",
                    content: "fixture",
                    kind: "statement",
                    mentions: [],
                    taskIds: [],
                    createdAt: contributionNow
                }
            ],
            contributions: contribution
        };

        expect(isMeetingStateV2(mixedOrigin as unknown as MeetingState)).toBe(false);
    });

    it("accepts 128 material versions and rejects the 129th", () => {
        const contribution = validContributionState();
        contribution.evidence = Object.fromEntries(
            Array.from({ length: 128 }, (_, index) => {
                const revision = index + 1;
                return [`evidence-1:${revision}`, evidenceVersion(revision)];
            })
        );
        expect(
            isMeetingStateV2({
                ...contributionMeeting(),
                contributions: contribution
            } as unknown as MeetingState)
        ).toBe(true);

        contribution.evidence = {
            ...contribution.evidence,
            "evidence-1:129": evidenceVersion(129)
        };
        expect(
            isMeetingStateV2({
                ...contributionMeeting(),
                contributions: contribution
            } as unknown as MeetingState)
        ).toBe(false);
    });
});
