import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { buildMeetingEvents } from "@/runtime/application-service/meeting-event.ts";
import type { MeetingAction } from "@/protocol/index.ts";
import type { MeetingEventInput, MeetingState } from "@/domain/index.ts";

const caller = { channel: "runtime_recovery", principalId: "runtime-recovery" } as const;
const fixture = () => {
    const beforeState = makeRunningMeetingStateV1();
    return {
        beforeState,
        meetingId: beforeState.id,
        now: 20,
        scope: { caller, meetingId: beforeState.id, role: "runtime" as const },
        transition: {
            kind: "accepted" as const,
            state: structuredClone(beforeState),
            relatedIds: [],
            effectRequests: []
        }
    };
};

describe("Meeting occurrence mapping", () => {
    it("uses the Runtime-generated claim ID, not the source effect ID", () => {
        const input = fixture();
        input.transition.state.reviewClaims = [
            {
                id: "claim",
                sourceEffectId: "effect",
                roundId: "round",
                versionId: "version",
                reviewerId: "reviewer-v1",
                claimedAt: 20,
                expiresAt: 30
            }
        ];
        const events = buildMeetingEvents({
            ...input,
            transition: { ...input.transition, relatedIds: ["claim", "version"] },
            action: {
                kind: "claim_evidence_review",
                sourceEffectId: "effect",
                roundId: "round",
                versionId: "version"
            }
        });
        expect(events).toEqual([
            {
                type: "evidence_review.claimed",
                occurredAt: 20,
                payload: {
                    logVersion: 1,
                    actor: { kind: "system" },
                    subject: { kind: "evidence_version", id: "version" },
                    relatedObjects: [{ kind: "round", id: "round" }],
                    data: { claimId: "claim", sourceEffectId: "effect" }
                }
            }
        ]);
        input.transition.state.reviewClaims[0]!.id = "changed";
        expect(events[0]!.payload.data).toEqual({ claimId: "claim", sourceEffectId: "effect" });
    });

    it.each([
        { boundary: "missing transition ID", ids: [], override: {} },
        { boundary: "mismatched transition ID", ids: ["other", "version"], override: {} },
        {
            boundary: "source effect",
            ids: ["claim", "version"],
            override: { sourceEffectId: "other" }
        },
        { boundary: "round", ids: ["claim", "version"], override: { roundId: "other" } },
        { boundary: "version", ids: ["claim", "version"], override: { versionId: "other" } }
    ])("rejects a claim with a $boundary mismatch", ({ ids, override }) => {
        const input = fixture();
        input.transition.state.reviewClaims = [
            {
                id: "claim",
                sourceEffectId: "effect",
                roundId: "round",
                versionId: "version",
                reviewerId: "reviewer-v1",
                claimedAt: 20,
                expiresAt: 30,
                ...override
            }
        ];
        expect(() =>
            buildMeetingEvents({
                ...input,
                transition: { ...input.transition, relatedIds: ids },
                action: {
                    kind: "claim_evidence_review",
                    sourceEffectId: "effect",
                    roundId: "round",
                    versionId: "version"
                }
            })
        ).toThrow("Cannot map meeting event");
    });

    it("puts lifecycle before occurrence and emits no archive occurrence for an ownership-only update", () => {
        const input = fixture();
        expect(
            buildMeetingEvents({
                ...input,
                action: {
                    kind: "record_archive_session_result",
                    sessionOwnershipId: "owner",
                    status: "closed"
                }
            })
        ).toEqual([]);
        input.transition.state.lifecycle = {
            ...input.beforeState.lifecycle,
            status: "paused",
            reason: "pause"
        };
        const events = buildMeetingEvents({
            ...input,
            scope: { ...input.scope, role: "captain" },
            action: { kind: "pause_meeting", reason: "pause" }
        });
        expect(events).toMatchObject([
            {
                type: "meeting.lifecycle_changed",
                occurredAt: 20,
                payload: {
                    actor: {
                        kind: "captain",
                        actorId: "captain_actor-be6579378dcba3083c1af7ecd7d4590f"
                    },
                    data: { from: "running", to: "paused", reason: "pause" }
                }
            }
        ]);
        expect(JSON.stringify(events)).not.toContain("milestone");
    });
});

const mappingState = (): MeetingState => {
    const state = makeRunningMeetingStateV1();
    const dimension = {
        score: 2 as const,
        reason: "bounded",
        scope: "scope",
        baselineEvidenceIds: []
    };
    return {
        ...state,
        managerPlans: [
            {
                id: "plan",
                agendaId: "agenda-v1",
                managerId: "manager-v1",
                kind: "open_round",
                rationale: "plan rationale",
                blockingReason: "bounded",
                status: "active",
                createdAt: 20
            }
        ],
        rounds: [
            {
                id: "round",
                agendaId: "agenda-v1",
                planId: "plan",
                roundGoal: { question: "question", evidenceGap: "gap", expectedOutput: "output" },
                publicBaselinePublicationIds: [],
                openedAt: 20,
                status: "open",
                contributionIds: ["contribution"],
                invitedContributorIds: ["contributor-v1"],
                participationResponses: [
                    { contributorId: "contributor-v1", status: "raised", recordedAt: 20 }
                ],
                deadlineAt: 30
            }
        ],
        contributions: [
            {
                id: "contribution",
                roundId: "round",
                contributorId: "contributor-v1",
                handRaise: { purpose: "purpose", raisedAt: 10 },
                acceptedAt: 20,
                status: "preparing",
                failure: {
                    sourceEffectId: "effect",
                    stage: "execution",
                    failureCode: "FAILED",
                    failureSummary: "failure",
                    attemptCount: 1,
                    retryable: false,
                    occurredAt: 20
                }
            }
        ],
        evidencePackages: [
            {
                id: "package",
                roundId: "round",
                contributionId: "contribution",
                authorId: "contributor-v1",
                agendaId: "agenda-v1",
                currentVersionId: "version",
                versions: [
                    {
                        id: "version",
                        summary: "immutable summary",
                        ordinal: 1,
                        observation: "observation",
                        interpretation: "interpretation",
                        method: "method",
                        falsifiers: [],
                        uncertainties: [],
                        limitations: [],
                        claims: [],
                        materials: [],
                        submittedAt: 20,
                        status: "validated",
                        failureCount: 0
                    }
                ]
            }
        ],
        reviews: [
            {
                id: "review",
                versionId: "version",
                reviewerId: "reviewer-v1",
                baselinePublicationIds: [],
                scope: "review scope",
                dimensions: {
                    source: dimension,
                    credibility: dimension,
                    completeness: dimension,
                    support: dimension
                },
                createdAt: 20
            }
        ],
        reviewClaims: [
            {
                id: "claim",
                sourceEffectId: "effect",
                roundId: "round",
                versionId: "version",
                reviewerId: "reviewer-v1",
                claimedAt: 20,
                expiresAt: 30
            }
        ],
        reviewDeliveries: [
            {
                id: "delivery",
                reviewId: "review",
                authorId: "contributor-v1",
                status: "sent",
                sentAt: 20
            }
        ],
        publications: [
            {
                id: "publication",
                roundId: "round",
                seq: 1,
                finalVersionIds: ["version"],
                finalReviewIds: ["review"],
                publishedAt: 20,
                exitReasons: []
            }
        ],
        messages: [2, 1].map((seq) => ({
            id: `message-${seq}`,
            seq,
            actorId: "contributor-v1",
            agendaId: "agenda-v1",
            kind: "evidence",
            body: "private full body must not be copied",
            publicationId: "publication",
            relatedIds: ["version", "review", "version"],
            createdAt: 20
        })),
        identityRecommendations: [
            {
                id: "recommendation",
                candidateId: "candidate",
                definitionId: "definition",
                catalogId: "catalog",
                catalogVersion: "snapshot",
                agendaId: "agenda-v1",
                managerId: "manager-v1",
                rationale: "recommendation rationale",
                expectedContribution: "contribution",
                evidenceGap: "gap",
                createdAt: 20,
                decision: "reject",
                status: "rejected",
                resolvedAt: 20
            }
        ],
        questions: [
            {
                id: "question",
                actorId: "contributor-v1",
                agendaId: "agenda-v1",
                text: "question",
                affectedOutputIds: [],
                affectedCriterionIds: [],
                affectedConstraintIds: [],
                blocking: false,
                status: "open"
            }
        ],
        issues: [
            {
                id: "issue",
                actorId: "contributor-v1",
                agendaId: "agenda-v1",
                description: "issue",
                riskLevel: "low",
                classification: "follow_up",
                affectedOutputIds: [],
                affectedCriterionIds: [],
                affectedConstraintIds: [],
                requiresEvidenceReview: false,
                blocking: false,
                status: "open",
                rationale: "rationale"
            }
        ],
        completionFacts: [
            {
                id: "replacement",
                outputId: "output-v1",
                statement: "updated",
                rationale: "verified",
                evidenceIds: ["version"],
                actorId: "contributor-v1",
                status: "active",
                supersedesFactId: "fact",
                createdAt: 20
            }
        ],
        termination: {
            id: "termination",
            outcome: "partial",
            reason: "ended",
            endedAt: 20,
            completionFactIds: ["fact"],
            unresolvedQuestionIds: ["question"],
            unresolvedIssueIds: ["issue"],
            unclosedContributionIds: ["contribution"]
        }
    };
};

type MappingCase = {
    action: MeetingAction;
    ids?: string[];
    type: MeetingEventInput["type"];
    subject: { kind: string; id: string };
    data: object;
    relations?: { kind: string; id: string }[];
};
const cases: MappingCase[] = [
    {
        action: {
            kind: "activate_agenda",
            agendaId: "next",
            previousDisposition: "completed",
            reason: "next"
        },
        type: "agenda.activated",
        subject: { kind: "agenda", id: "next" },
        data: { previousDisposition: "completed", reason: "next" }
    },
    {
        action: {
            kind: "dispose_agenda_candidate",
            candidateId: "candidate",
            disposition: "parked",
            reason: "later"
        },
        type: "agenda_candidate.disposed",
        subject: { kind: "agenda_candidate", id: "candidate" },
        data: { disposition: "parked", reason: "later" }
    },
    {
        action: {
            kind: "submit_manager_plan",
            agendaId: "agenda-v1",
            planKind: "open_round",
            roundGoal: { question: "question", evidenceGap: "gap", expectedOutput: "output" },
            rationale: "not the snapshot rationale"
        },
        ids: ["meeting-v1", "plan", "agenda-v1"],
        type: "manager_plan.recorded",
        subject: { kind: "manager_plan", id: "plan" },
        data: { planKind: "open_round", rationale: "plan rationale", blockingReason: "bounded" }
    },
    {
        action: { kind: "open_round", agendaId: "agenda-v1", planId: "plan" },
        ids: ["round"],
        type: "round.opened",
        subject: { kind: "round", id: "round" },
        data: { deadlineAt: 30 },
        relations: [
            { kind: "agenda", id: "agenda-v1" },
            { kind: "manager_plan", id: "plan" }
        ]
    },
    {
        action: { kind: "decline_hand", roundId: "round", reason: "unavailable" },
        type: "round.participation_recorded",
        subject: { kind: "round", id: "round" },
        data: { contributorId: "contributor-v1", status: "declined", reason: "unavailable" }
    },
    {
        action: {
            kind: "expire_round_participation",
            roundId: "round",
            contributorId: "contributor-v1"
        },
        type: "round.participation_recorded",
        subject: { kind: "round", id: "round" },
        data: { contributorId: "contributor-v1", status: "no_response" }
    },
    {
        action: { kind: "raise_hand", roundId: "round", purpose: "purpose" },
        type: "hand_raise.recorded",
        subject: { kind: "round", id: "round" },
        data: { contributorId: "contributor-v1", purpose: "purpose" }
    },
    {
        action: {
            kind: "dispose_hand_raise",
            roundId: "round",
            contributorId: "contributor-v1",
            disposition: "accepted",
            reason: "accepted"
        },
        ids: ["round", "contribution"],
        type: "hand_raise.disposed",
        subject: { kind: "round", id: "round" },
        data: {
            contributorId: "contributor-v1",
            disposition: "accepted",
            reason: "accepted",
            contributionId: "contribution"
        },
        relations: [
            { kind: "identity", id: "contributor-v1" },
            { kind: "contribution", id: "contribution" }
        ]
    },
    {
        action: {
            kind: "close_contribution",
            contributionId: "contribution",
            exit: "withdrawn",
            reason: "withdrawn"
        },
        type: "contribution.closed",
        subject: { kind: "contribution", id: "contribution" },
        data: { exit: "withdrawn", reason: "withdrawn" }
    },
    {
        action: {
            kind: "record_contribution_failure",
            contributionId: "contribution",
            sourceEffectId: "effect",
            stage: "execution",
            failureCode: "FAILED",
            failureSummary: "failure",
            attemptCount: 1,
            retryable: false
        },
        type: "contribution.failed",
        subject: { kind: "contribution", id: "contribution" },
        data: {
            sourceEffectId: "effect",
            stage: "execution",
            failureCode: "FAILED",
            failureSummary: "failure",
            attemptCount: 1,
            retryable: false
        }
    },
    {
        action: {
            kind: "fail_evidence_validation",
            roundId: "round",
            claimId: "claim",
            reason: "review_timeout"
        },
        type: "evidence_validation.failed",
        subject: { kind: "evidence_version", id: "version" },
        data: { claimId: "claim", reason: "review_timeout" }
    },
    {
        action: {
            kind: "submit_evidence_review",
            roundId: "round",
            claimId: "claim",
            versionId: "version",
            scope: "review scope",
            dimensions: mappingState().reviews[0]!.dimensions
        },
        ids: ["review", "version"],
        type: "evidence_review.submitted",
        subject: { kind: "evidence_review", id: "review" },
        data: { claimId: "claim", scope: "review scope" }
    },
    {
        action: { kind: "record_review_delivery", reviewId: "review", status: "sent" },
        ids: ["delivery", "review"],
        type: "review_delivery.recorded",
        subject: { kind: "review_delivery", id: "delivery" },
        data: { status: "sent" },
        relations: [
            { kind: "evidence_review", id: "review" },
            { kind: "round", id: "round" }
        ]
    },
    {
        action: { kind: "abort_round", roundId: "round", reason: "stop" },
        ids: ["round", "contribution"],
        type: "round.aborted",
        subject: { kind: "round", id: "round" },
        data: { reason: "stop" }
    },
    {
        action: {
            kind: "recommend_identity",
            candidateId: "candidate",
            definitionId: "definition",
            catalogId: "catalog",
            catalogVersion: "snapshot",
            agendaId: "agenda-v1",
            decision: "reject",
            rationale: "recommendation rationale",
            expectedContribution: "contribution",
            evidenceGap: "gap"
        },
        ids: ["recommendation"],
        type: "identity.recommended",
        subject: { kind: "identity_recommendation", id: "recommendation" },
        data: { decision: "reject", status: "rejected", rationale: "recommendation rationale" }
    },
    {
        action: {
            kind: "resolve_question",
            questionId: "question",
            status: "deferred",
            rationale: "later",
            evidenceIds: ["version", "version"]
        },
        type: "question.disposed",
        subject: { kind: "question", id: "question" },
        data: { status: "deferred", rationale: "later" },
        relations: [
            { kind: "agenda", id: "agenda-v1" },
            { kind: "evidence_version", id: "version" }
        ]
    },
    {
        action: {
            kind: "dispose_issue",
            issueId: "issue",
            status: "resolved",
            rationale: "fixed",
            evidenceIds: ["version"]
        },
        type: "issue.disposed",
        subject: { kind: "issue", id: "issue" },
        data: { status: "resolved", rationale: "fixed" }
    },
    {
        action: {
            kind: "dispose_risk",
            issueId: "issue",
            action: "accept",
            scope: "bounded",
            rationale: "accepted",
            evidenceIds: ["version"]
        },
        ids: ["risk"],
        type: "risk.disposed",
        subject: { kind: "risk_disposition", id: "risk" },
        data: { action: "accept", scope: "bounded", rationale: "accepted" }
    },
    {
        action: {
            kind: "record_completion_fact",
            outputId: "output-v1",
            statement: "done",
            rationale: "verified",
            evidenceIds: ["version"]
        },
        ids: ["fact"],
        type: "completion_fact.recorded",
        subject: { kind: "completion_fact", id: "fact" },
        data: { outputId: "output-v1", statement: "done", rationale: "verified" }
    },
    {
        action: {
            kind: "change_completion_fact",
            factId: "fact",
            status: "superseded",
            rationale: "replaced",
            replacement: {
                outputId: "output-v1",
                statement: "updated",
                rationale: "verified",
                evidenceIds: ["version"]
            }
        },
        ids: ["fact", "replacement"],
        type: "completion_fact.changed",
        subject: { kind: "completion_fact", id: "fact" },
        data: { status: "superseded", rationale: "replaced", replacementFactId: "replacement" }
    },
    {
        action: {
            kind: "end_meeting",
            outcome: "partial",
            reason: "ended",
            completionFactIds: ["fact"],
            unresolvedQuestionIds: ["question"],
            unresolvedIssueIds: ["issue"]
        },
        type: "meeting.ended",
        subject: { kind: "termination", id: "termination" },
        data: { outcome: "partial", reason: "ended" }
    }
];

describe("Action-specific occurrence data", () => {
    it.each(["change_completion_fact"] as const)(
        "records only the old object's change when %s revokes without replacement",
        (kind) => {
            const state = mappingState();
            const action: MeetingAction =
                kind === "change_decision"
                    ? {
                          kind,
                          decisionId: "decision",
                          status: "revoked",
                          rationale: "revoke",
                          evidenceIds: ["version"]
                      }
                    : { kind, factId: "fact", status: "revoked", rationale: "revoke" };
            const events = buildMeetingEvents({
                ...fixture(),
                action,
                transition: { kind: "accepted", state, relatedIds: ["old"], effectRequests: [] }
            });
            expect(events).toHaveLength(1);
            expect(events[0]?.payload.data).toEqual({ status: "revoked", rationale: "revoke" });
        }
    );
    it("preserves submitted evidence summary rather than later mutable text", () => {
        const state = mappingState();
        const version = state.evidencePackages[0]!.versions[0]!;
        const events = buildMeetingEvents({
            ...fixture(),
            action: {
                kind: "submit_evidence",
                contributionId: "contribution",
                evidence: { ...version, summary: "submitted" }
            },
            transition: {
                kind: "accepted",
                state,
                relatedIds: ["package", "version", "registration"],
                effectRequests: []
            }
        });
        expect(events).toMatchObject([
            {
                type: "evidence.submitted",
                payload: {
                    subject: { kind: "evidence_version", id: "version" },
                    relatedObjects: [
                        { kind: "contribution", id: "contribution" },
                        { kind: "round", id: "round" }
                    ],
                    data: { summary: "immutable summary" }
                }
            }
        ]);
        version.summary = "updated";
        expect(events[0]!.payload.data).toEqual({ summary: "immutable summary" });
    });

    it.each(["active", "failed"] as const)(
        "records identity admission %s without exposing session data",
        (status) => {
            const state = mappingState();
            const core = state.identityRecommendations[0]!;
            state.identityRecommendations = [
                {
                    ...core,
                    decision: "admit",
                    status,
                    identityId: "admitted",
                    sessionId: "private-session",
                    definitionHash: "a".repeat(64),
                    ...(status === "failed" ? { failureCode: "FAILED" } : {})
                }
            ];
            const events = buildMeetingEvents({
                ...fixture(),
                action: {
                    kind: "record_identity_admission_result",
                    recommendationId: "recommendation"
                },
                transition: {
                    kind: "accepted",
                    state,
                    relatedIds: ["recommendation"],
                    effectRequests: []
                }
            });
            expect(events[0]).toMatchObject({
                type: "identity.admission_recorded",
                payload: {
                    data: status === "active" ? { status } : { status, failureCode: "FAILED" },
                    relatedObjects:
                        status === "active" ? [{ kind: "identity", id: "admitted" }] : []
                }
            });
            expect(JSON.stringify(events)).not.toContain("private-session");
        }
    );

    it("records archive start and first completion, while resume only records lifecycle", () => {
        const state = mappingState();
        const termination = state.termination!;
        state.archive = {
            id: "archive",
            status: "complete",
            createdAt: 20,
            publicSnapshotVersion: 1,
            terminationId: termination.id,
            objective: state.objective,
            agenda: state.agenda,
            agendaCandidates: [],
            publications: [],
            messages: [],
            evidenceBundles: [],
            completionFacts: [],
            questions: [],
            issues: [],
            riskDispositions: [],
            questionIssueDispositionFacts: [],
            termination,
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            unresolvedItemIds: [],
            unclosedContributions: [],
            identityProvenance: [],
            controlActorProvenance: [],
            exportMaterials: []
        };
        const before = structuredClone(state);
        before.lifecycle.status = "terminal";
        state.lifecycle.status = "archiving";
        const input = {
            ...fixture(),
            beforeState: before,
            transition: { kind: "accepted" as const, state, relatedIds: [], effectRequests: [] }
        };
        expect(
            buildMeetingEvents({ ...input, action: { kind: "start_archive" } }).map(
                (event) => event.type
            )
        ).toEqual(["meeting.lifecycle_changed", "archive.started"]);
        before.lifecycle.status = "archiving";
        state.lifecycle.status = "archived";
        expect(
            buildMeetingEvents({
                ...input,
                action: {
                    kind: "record_archive_session_result",
                    sessionOwnershipId: "owner",
                    status: "closed"
                }
            }).map((event) => event.type)
        ).toEqual(["meeting.lifecycle_changed", "archive.completed"]);
        before.lifecycle.status = "paused";
        state.lifecycle.status = "running";
        expect(
            buildMeetingEvents({
                ...input,
                action: { kind: "resume_meeting", reason: "resume" }
            }).map((event) => event.type)
        ).toEqual(["meeting.lifecycle_changed"]);
    });
    it.each(cases)(
        "maps $action.kind to $type",
        ({ action, ids = [], type, subject, data, relations }) => {
            const state = mappingState();
            const events = buildMeetingEvents({
                action,
                beforeState: structuredClone(state),
                transition: { kind: "accepted", state, relatedIds: ids, effectRequests: [] },
                scope: {
                    caller,
                    meetingId: state.id,
                    role: "participant",
                    identityId: "contributor-v1"
                },
                meetingId: state.id,
                now: 20
            });
            const superseded =
                (action.kind === "change_decision" || action.kind === "change_completion_fact") &&
                action.status === "superseded";
            expect(events).toHaveLength(superseded ? 2 : 1);
            expect(events[0]).toMatchObject({
                type,
                occurredAt: 20,
                payload: {
                    logVersion: 1,
                    actor: { kind: "identity", actorId: "contributor-v1" },
                    subject,
                    data
                }
            });
            expect(events[0]!.payload.data).toEqual(data);
            if (superseded) {
                expect(events[1]).toMatchObject({
                    type:
                        action.kind === "change_decision"
                            ? "decision.recorded"
                            : "completion_fact.recorded",
                    occurredAt: 20,
                    payload: {
                        subject: {
                            kind:
                                action.kind === "change_decision" ? "decision" : "completion_fact",
                            id: "replacement"
                        },
                        data:
                            action.kind === "change_decision"
                                ? { status: "accepted" }
                                : {
                                      outputId: "output-v1",
                                      statement: "updated",
                                      rationale: "verified"
                                  }
                    }
                });
                expect(events[1]!.payload.relatedObjects).toContainEqual({
                    kind: "evidence_version",
                    id: "version"
                });
                if (action.kind === "change_completion_fact") {
                    state.completionFacts[0]!.statement = "later mutation";
                    expect(events[1]!.payload.data).toMatchObject({ statement: "updated" });
                }
            }
            if (relations) {
                expect(events[0]!.payload.relatedObjects).toEqual(relations);
            }
            expect(JSON.stringify(events)).not.toMatch(/milestone|private full body/);
        }
    );

    it("publishes lifecycle first, then publication and each new message in sequence order", () => {
        const after = mappingState();
        const before = { ...structuredClone(after), messages: [] };
        after.lifecycle = { ...after.lifecycle, status: "converging" };
        const events = buildMeetingEvents({
            action: { kind: "publish_round", roundId: "round" },
            beforeState: before,
            transition: {
                kind: "accepted",
                state: after,
                relatedIds: ["publication", "message-2", "message-1"],
                effectRequests: []
            },
            scope: { caller, meetingId: after.id, role: "manager", identityId: "manager-v1" },
            meetingId: after.id,
            now: 20
        });
        expect(events.map((event) => [event.type, event.payload.subject.id])).toEqual([
            ["meeting.lifecycle_changed", after.id],
            ["round.published", "publication"],
            ["formal_message.published", "message-1"],
            ["formal_message.published", "message-2"]
        ]);
        expect(events[2]!.payload.relatedObjects).toEqual([
            { kind: "publication", id: "publication" },
            { kind: "round", id: "round" },
            { kind: "evidence_version", id: "version" },
            { kind: "evidence_review", id: "review" }
        ]);
        after.messages[0]!.kind = "changed";
        expect(events[3]!.payload.data).toEqual({ messageKind: "evidence" });
    });
});
