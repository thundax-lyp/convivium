import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state-v1.js";
import {
    MeetingActionV1Schema,
    ListMeetingsRequestV1Schema,
    ReadMeetingRequestV1Schema,
    decodeMeetingStateV1,
    encodeMeetingStateV1
} from "@/protocol/meeting-command-v1.js";
import {
    MeetingActionV1Schema as PublicMeetingActionV1Schema,
    MeetingCommandResultV1Schema as PublicMeetingCommandResultV1Schema,
    serializeValidatedRequestV1
} from "@/protocol/index.js";

const identity = {
    candidateId: "candidate-1",
    definitionId: "definition-1",
    definitionVersion: "1",
    catalogId: "catalog-1",
    catalogVersion: "1",
    agendaId: "agenda-1",
    rationale: "rationale",
    expectedContribution: "contribution",
    evidenceGap: "gap",
    decision: "admit" as const
};
const evidence = {
    observation: "observation",
    interpretation: "interpretation",
    method: "method",
    falsifiers: [{ value: "falsifier" }],
    uncertainties: [{ value: "uncertainty" }],
    limitations: [{ value: "limitation" }],
    claims: [
        {
            id: "claim-1",
            statement: "claim",
            materialIds: ["material-1"],
            qualification: "qualified"
        }
    ],
    materials: [
        {
            id: "material-1",
            kind: "document" as const,
            originator: "originator",
            originalSource: "source",
            sourcePublishedAt: "2026-01-01",
            acquiredAt: "2026-01-01",
            version: "1",
            locator: "locator",
            location: "location",
            verificationConditions: "conditions",
            limitations: "limitations",
            sharedDependencies: []
        }
    ]
};
const dimension = { score: 3 as const, scope: "scope", reason: "reason", baselineEvidenceIds: [] };

describe("target Meeting business-loop protocol", () => {
    it("parses all thirteen target write actions and strips runtime fields", () => {
        const actions = [
            {
                kind: "create_meeting",
                objective: {
                    statement: "objective",
                    requiredOutputs: [],
                    acceptanceCriteria: [],
                    hardConstraints: [],
                    acceptableRiskLevel: "low"
                },
                identities: [],
                managerIdentityKey: "manager",
                evidenceReviewerIdentityKey: "reviewer",
                initialAgenda: [],
                initialActiveAgendaId: "agenda-1",
                limits: {
                    maxFormalMessages: 1,
                    maxDurationMs: 1,
                    taskDeadlineMs: 1,
                    reviewDeadlineMs: 1
                }
            },
            { kind: "recommend_identity", ...identity },
            { kind: "record_identity_admission_result", recommendationId: "recommendation-1" },
            { kind: "open_round", agendaId: "agenda-1" },
            { kind: "raise_hand", roundId: "round-1", purpose: "purpose" },
            {
                kind: "dispose_hand_raise",
                roundId: "round-1",
                contributorId: "contributor-1",
                disposition: "accepted",
                reason: "reason"
            },
            { kind: "submit_evidence", contributionId: "contribution-1", evidence },
            {
                kind: "submit_review_batch",
                reviews: [
                    {
                        versionId: "version-1",
                        dimensions: {
                            source: dimension,
                            credibility: dimension,
                            completeness: dimension,
                            support: dimension
                        },
                        scope: "scope"
                    }
                ]
            },
            {
                kind: "record_review_delivery",
                reviewId: "review-1",
                status: "sent"
            },
            { kind: "publish_round", roundId: "round-1" },
            {
                kind: "end_meeting",
                outcome: "completed",
                reason: "done",
                decisionIds: [],
                completionFactIds: [],
                unresolvedQuestionIds: [],
                unresolvedIssueIds: []
            },
            { kind: "start_archive" },
            {
                kind: "record_archive_session_result",
                sessionOwnershipId: "ownership-1",
                status: "closed"
            }
        ];
        expect(actions).toHaveLength(13);
        for (const value of actions) {
            const parsed = MeetingActionV1Schema.parse({ ...value, forgedRuntimeField: "strip" });
            expect(PublicMeetingActionV1Schema.parse(value)).toEqual(parsed);
            expect(parsed).not.toHaveProperty("forgedRuntimeField");
        }
    });

    it("validates reads, result/error unions, and review/archive refinements", () => {
        expect(ListMeetingsRequestV1Schema.parse({ protocolVersion: 1, forged: true })).toEqual({
            protocolVersion: 1
        });
        expect(
            ReadMeetingRequestV1Schema.parse({ protocolVersion: 1, meetingId: "meeting-1" })
        ).toEqual({ protocolVersion: 1, meetingId: "meeting-1" });
        expect(
            MeetingActionV1Schema.safeParse({
                kind: "record_archive_session_result",
                sessionOwnershipId: "ownership-1",
                status: "closed",
                failureReason: "unexpected"
            }).success
        ).toBe(false);
        expect(
            MeetingActionV1Schema.safeParse({
                kind: "submit_review_batch",
                reviews: [
                    {
                        versionId: "version-1",
                        dimensions: {
                            source: dimension,
                            credibility: dimension,
                            completeness: dimension,
                            support: dimension
                        },
                        scope: "scope"
                    },
                    {
                        versionId: "version-1",
                        dimensions: {
                            source: dimension,
                            credibility: dimension,
                            completeness: dimension,
                            support: dimension
                        },
                        scope: "scope"
                    }
                ]
            }).success
        ).toBe(false);
        expect(
            PublicMeetingCommandResultV1Schema.safeParse({
                kind: "rejected",
                error: { code: "INVALID_ARGUMENT", message: "invalid" }
            }).success
        ).toBe(true);
    });

    it("sorts object keys without reordering arrays and rejects legacy state", () => {
        const first = { z: [{ b: 2, a: 1 }], a: { d: 4, c: 3 } };
        const second = { a: { c: 3, d: 4 }, z: [{ a: 1, b: 2 }] };
        expect(serializeValidatedRequestV1(first)).toBe(serializeValidatedRequestV1(second));
        const state = makeRunningMeetingStateV1();
        expect(decodeMeetingStateV1(encodeMeetingStateV1(state))).toEqual(state);
        expect(() => encodeMeetingStateV1({ ...state, formatApprovals: [] })).toThrow(
            "INCOMPATIBLE_VERSION"
        );
    });
});
