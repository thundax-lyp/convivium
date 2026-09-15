import { meeting, archivePackage } from "../unit/domain/transitions/fixtures.js";
import { projectMeetingStatus } from "@/projection/index.js";
import { describe, expect, it } from "vitest";
import { validArchivePackage, validArchivedProjection } from "../fixtures/protocol-archive.js";
import {
    CaptainAttendanceDispositionInputSchema,
    CaptainAttendanceDispositionResultSchema,
    AttendanceRecommendationClaimSchema,
    MeetingArchivePackageSchema,
    MeetingAgentCatalogProjectionSchema,
    MeetingAgentCatalogSnapshotSchema,
    ManagerPlanSubmissionSchema,
    MeetingStatusResultSchema,
    PublicAttendanceRecommendationSchema,
    isKnownMeetingProtocolErrorCode,
    TurnSubmissionSchema
} from "@/protocol/index.js";

describe("Agent role catalog protocol", () => {
    const role = {
        roleDefinitionId: "runtime_engineer" as const,
        version: "1",
        displayName: "Runtime Engineer",
        summary: "Reviews runtime behavior",
        expertiseTags: ["runtime"],
        evidenceScopes: ["repository" as const],
        responsibilities: ["Review runtime changes"],
        nonResponsibilities: ["Approve attendance"]
    };
    const snapshotCandidate = {
        candidateId: "candidate-1",
        roleDefinitionId: "runtime_engineer" as const,
        roleDefinitionVersion: "1",
        sourceMemberName: "runtime-member",
        agentDefinitionId: "agent-definition-1",
        availability: "available" as const
    };
    const snapshot = {
        protocolVersion: 1 as const,
        catalogId: "catalog-1",
        catalogVersion: "1",
        teamId: "team-1",
        capturedAt: 1,
        roles: [role],
        candidates: [snapshotCandidate]
    };
    const projectedCandidate = {
        candidateId: "candidate-1",
        roleDefinitionId: "runtime_engineer" as const,
        roleDefinitionVersion: "1",
        displayName: "Runtime Engineer",
        summary: "Reviews runtime behavior",
        expertiseTags: ["runtime"],
        evidenceScopes: ["repository" as const],
        responsibilities: ["Review runtime changes"],
        nonResponsibilities: ["Approve attendance"],
        availability: "available" as const
    };
    const projection = {
        protocolVersion: 1 as const,
        catalogId: "catalog-1",
        catalogVersion: "1",
        candidates: [projectedCandidate],
        researchNeeds: []
    };
    const claim = {
        candidateId: "candidate-1",
        agendaItemId: "agenda-1",
        rationale: "Runtime expertise is needed",
        expectedContribution: "Review runtime risks",
        evidenceGapIds: [],
        urgency: "current_agenda" as const
    };
    const publicRecommendation = {
        ...claim,
        recommendationId: "planning-1-attendance-0",
        roleDefinitionId: "runtime_engineer" as const,
        displayName: "Runtime Engineer",
        status: "pending" as const
    };
    const managerSubmission = {
        protocolVersion: 1 as const,
        meetingId: "meeting-1",
        planningAttemptId: "planning-1",
        observedMeetingVersion: 2,
        requestId: "request-1",
        agendaItemId: "agenda-1",
        intent: "review",
        objective: "Review the proposal",
        expectedOutputs: ["review"],
        prohibitedTopics: [],
        steps: [
            {
                participantId: "participant-1",
                instruction: "Review the proposal",
                reason: "required_reviewer"
            }
        ]
    };

    it("validates exact Catalog snapshot and safe projection shapes", () => {
        expect(MeetingAgentCatalogSnapshotSchema(snapshot)).toEqual(snapshot);
        expect(MeetingAgentCatalogProjectionSchema(projection)).toEqual(projection);
        expect(() => MeetingAgentCatalogSnapshotSchema({ ...snapshot, extra: true })).toThrow();
        expect(() =>
            MeetingAgentCatalogSnapshotSchema({
                ...snapshot,
                roles: [{ ...role, prompt: "secret" }]
            })
        ).toThrow();
        expect(() =>
            MeetingAgentCatalogSnapshotSchema({
                ...snapshot,
                candidates: [{ ...snapshotCandidate, agentDefinitionId: undefined }]
            })
        ).toThrow();
        expect(() =>
            MeetingAgentCatalogProjectionSchema({
                ...projection,
                candidates: [{ ...projectedCandidate, sourceMemberName: "secret" }]
            })
        ).toThrow();
        expect(() =>
            MeetingAgentCatalogProjectionSchema({
                ...projection,
                researchNeeds: [
                    {
                        evidenceGapId: "gap-1",
                        agendaItemId: "agenda-1",
                        question: "What changed?",
                        requiredScopes: ["repository"],
                        existingEvidenceIds: [],
                        status: "open",
                        extra: true
                    }
                ]
            })
        ).toThrow();
    });

    it("validates exact claim and public recommendation shapes", () => {
        expect(AttendanceRecommendationClaimSchema(claim)).toEqual(claim);
        expect(PublicAttendanceRecommendationSchema(publicRecommendation)).toEqual(
            publicRecommendation
        );
        expect(() =>
            AttendanceRecommendationClaimSchema({ ...claim, status: "pending" })
        ).toThrow();
        expect(() =>
            AttendanceRecommendationClaimSchema({ ...claim, expectedContribution: undefined })
        ).toThrow();
        expect(() =>
            AttendanceRecommendationClaimSchema({ ...claim, evidenceGapIds: [1] })
        ).toThrow();
        expect(() =>
            AttendanceRecommendationClaimSchema({ ...claim, urgency: "urgent" })
        ).toThrow();
        expect(() =>
            PublicAttendanceRecommendationSchema({ ...publicRecommendation, extra: true })
        ).toThrow();
        expect(
            PublicAttendanceRecommendationSchema({
                ...publicRecommendation,
                admissionStatus: "provisioning",
                failureCode: "failure"
            })
        ).toMatchObject({ admissionStatus: "provisioning", failureCode: "failure" });
    });

    it("accepts absent, empty, and multiple recommendation claims only at the claim field", () => {
        expect(ManagerPlanSubmissionSchema(managerSubmission)).toEqual(managerSubmission);
        expect(
            ManagerPlanSubmissionSchema({ ...managerSubmission, attendanceRecommendations: [] })
        ).toEqual({ ...managerSubmission, attendanceRecommendations: [] });
        expect(
            ManagerPlanSubmissionSchema({
                ...managerSubmission,
                attendanceRecommendations: [claim, { ...claim, candidateId: "candidate-2" }]
            })
        ).toMatchObject({
            attendanceRecommendations: [claim, { ...claim, candidateId: "candidate-2" }]
        });
        expect(() =>
            ManagerPlanSubmissionSchema({ ...managerSubmission, recommendationId: "forbidden" })
        ).toThrow();
        expect(() =>
            ManagerPlanSubmissionSchema({ ...managerSubmission, status: "pending" })
        ).toThrow();
        expect(() =>
            ManagerPlanSubmissionSchema({
                ...managerSubmission,
                attendanceRecommendations: [{ ...claim, extra: true }]
            })
        ).toThrow();
    });

    it("recognizes all Catalog and attendance protocol errors", () => {
        for (const code of [
            "AGENT_CATALOG_UNAVAILABLE",
            "AGENT_CATALOG_VERSION_UNSUPPORTED",
            "AGENT_CANDIDATE_NOT_FOUND",
            "AGENT_CANDIDATE_UNAVAILABLE",
            "ATTENDANCE_RECOMMENDATION_INVALID",
            "ATTENDANCE_RECOMMENDATION_STALE",
            "ATTENDANCE_RECOMMENDATION_NOT_PENDING",
            "PARTICIPANT_PROVISIONING_FAILED"
        ]) {
            expect(isKnownMeetingProtocolErrorCode(code)).toBe(true);
        }
    });
});

describe("referenced minutes schema", () => {
    const draft = { coverage: { fromSeq: 1, throughSeq: 2 }, referencedMessageIds: ["m2", "m1"] };
    const input = {
        protocolVersion: 1,
        meetingId: "meeting-1",
        turnId: "t1",
        stepId: "s1",
        attemptId: "a1",
        deliveryId: "d1",
        agendaItemId: "agenda-1",
        kind: "summary",
        content: " draft ",
        mentions: [],
        taskIds: [],
        agendaRelation: "on_topic",
        changes: {}
    };
    const message = {
        id: "m3",
        seq: 3,
        turnId: "t1",
        stepId: "s1",
        speaker: "p1",
        agendaItemId: "agenda-1",
        kind: "summary",
        content: input.content,
        mentions: [],
        taskIds: [],
        createdAt: 1
    };
    it("preserves absent fields and valid draft boundaries without normalizing references", () => {
        expect(TurnSubmissionSchema(input)).not.toHaveProperty("minutesDraft");
        expect(TurnSubmissionSchema({ ...input, minutesDraft: draft }).minutesDraft).toEqual(draft);
        const boundary = {
            coverage: { fromSeq: Number.MAX_SAFE_INTEGER, throughSeq: Number.MAX_SAFE_INTEGER },
            referencedMessageIds: Array.from({ length: 64 }, (_, i) => `${i}`.padEnd(256, "x"))
        };
        expect(
            TurnSubmissionSchema({ ...input, content: "x".repeat(8000), minutesDraft: boundary })
                .minutesDraft
        ).toEqual(boundary);
        expect(
            TurnSubmissionSchema({
                ...input,
                minutesDraft: {
                    coverage: { fromSeq: 1, throughSeq: 1 },
                    referencedMessageIds: [" m1 "]
                }
            }).minutesDraft.referencedMessageIds
        ).toEqual([" m1 "]);
    });
    it.each([
        null,
        {},
        { ...draft, status: "draft" },
        { ...draft, extra: true },
        { referencedMessageIds: ["m1"] },
        { coverage: draft.coverage },
        { ...draft, coverage: null },
        { ...draft, coverage: { fromSeq: 1 } },
        ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1"].map((fromSeq) => ({
            ...draft,
            coverage: { fromSeq, throughSeq: 2 }
        })),
        ...[0, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "2"].map((throughSeq) => ({
            ...draft,
            coverage: { fromSeq: 1, throughSeq }
        })),
        { ...draft, coverage: { fromSeq: 2, throughSeq: 1 } },
        { ...draft, coverage: { ...draft.coverage, extra: 1 } },
        ...[
            null,
            [],
            [""],
            [" "],
            [1],
            ["m1", "m1"],
            ["m1", null],
            ["x".repeat(257)],
            Array.from({ length: 65 }, (_, i) => String(i))
        ].map((referencedMessageIds) => ({ ...draft, referencedMessageIds }))
    ])("rejects malformed draft %#", (minutesDraft) => {
        expect(() => TurnSubmissionSchema({ ...input, minutesDraft })).toThrow();
    });
    it.each([
        { content: " " },
        { content: "x".repeat(8001) },
        { kind: "statement" },
        { taskIds: ["task-1"] },
        { replyTo: "m1" },
        { completionClaims: { outputs: [], reviews: [], criteria: [] } },
        { agendaRelation: "supporting_context" }
    ])("rejects incompatible message fields %#", (fields) => {
        expect(() => TurnSubmissionSchema({ ...input, ...fields, minutesDraft: draft })).toThrow();
    });
    it.each([
        { questions: [{ text: "question", blocking: false }] },
        { proposals: [{ title: "proposal", description: "description" }] },
        {
            positions: [
                { proposalId: "p1", proposalRevision: 1, position: "support", blocking: false }
            ]
        },
        {
            issues: [
                {
                    title: "risk",
                    description: "description",
                    affectedOutputIds: [],
                    affectedCriterionIds: [],
                    violatedConstraintIds: [],
                    impact: "low",
                    urgency: "later",
                    safeDefaultAvailable: true,
                    riskLevel: "low"
                }
            ]
        },
        {
            decisionProposals: [
                {
                    proposalId: "p1",
                    proposalRevision: 1,
                    statement: "decision",
                    rationale: "reason"
                }
            ]
        },
        {
            agendaCandidates: [
                {
                    title: "candidate",
                    reason: "reason",
                    relationToActiveAgenda: "related",
                    urgency: "later",
                    suggestedParticipants: []
                }
            ]
        }
    ])("rejects each otherwise valid nonempty change %#", (changes) => {
        expect(() => TurnSubmissionSchema({ ...input, changes })).not.toThrow();
        expect(() => TurnSubmissionSchema({ ...input, changes, minutesDraft: draft })).toThrow();
    });
    it("preserves archive metadata, rejects tampering, and reads legacy messages", () => {
        const archive = { ...validArchivedProjection(), meetingTasks: [] };
        const project = (minutesDraft: unknown) => ({
            ...archive,
            archive: {
                ...archive.archive,
                package: {
                    ...archive.archive.package,
                    formalTranscript: [{ ...message, minutesDraft }]
                }
            }
        });
        const metadata = { status: "draft", ...draft };
        const active = {
            meetingId: "meeting-1",
            meetingVersion: 1,
            topic: "topic",
            objective: "objective",
            continuationMaterials: [],
            limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
            status: "running",
            messages: [{ ...message, minutesDraft: metadata }],
            questions: [],
            proposals: [],
            pendingDecisionCandidates: [],
            acceptedDecisions: [],
            decisionHistory: [],
            risks: [],
            blockingFacts: [],
            parkingLot: [],
            meetingTasks: [],
            attendanceRecommendations: [],
            stallCount: 0,
            maxStalls: 3,
            replanCount: 0,
            maxReplans: 1,
            pendingHandRaises: [],
            pauseControl: { action: "pause" }
        };
        expect(MeetingStatusResultSchema(active).messages[0].minutesDraft).toEqual(metadata);

        expect(() => MeetingArchivePackageSchema(project(metadata).archive.package)).not.toThrow();
        expect(
            MeetingStatusResultSchema(project(metadata)).archive.package.formalTranscript[0]
                .minutesDraft
        ).toEqual(metadata);
        for (const invalid of [
            null,
            draft,
            { ...metadata, status: "accepted" },
            { ...metadata, extra: 1 }
        ]) {
            expect(() => MeetingStatusResultSchema(project(invalid))).toThrow();
        }
        const legacy = MeetingArchivePackageSchema({
            ...validArchivePackage(),
            formalTranscript: [message]
        });
        expect(legacy.formalTranscript[0]).not.toHaveProperty("minutesDraft");
    });
});

describe("Captain attendance rejection schema", () => {
    const input = {
        protocolVersion: 1,
        meetingId: "meeting-1",
        expectedMeetingVersion: 0,
        requestId: "reject-1",
        recommendationId: "recommendation-1",
        decision: "reject",
        reason: " Not needed "
    };
    const result = {
        requestId: "reject-1",
        recommendationId: "recommendation-1",
        disposition: "rejected"
    };
    it("validates only the supported command and result without trimming values", () => {
        expect(CaptainAttendanceDispositionInputSchema(input)).toEqual(input);
        expect(CaptainAttendanceDispositionResultSchema(result)).toEqual(result);
    });
    it.each(Object.keys(input))("rejects missing or null %s", (key) => {
        const missing = { ...input };
        Reflect.deleteProperty(missing, key);
        expect(() => CaptainAttendanceDispositionInputSchema(missing)).toThrow();
        expect(() => CaptainAttendanceDispositionInputSchema({ ...input, [key]: null })).toThrow();
    });
    it.each([
        { decision: "approve" },
        { reason: "  " },
        { meetingId: " " },
        { requestId: " " },
        { recommendationId: " " },
        { actor: "captain:x" },
        ...[-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1].map((expectedMeetingVersion) => ({
            expectedMeetingVersion
        }))
    ])("rejects invalid input %j", (change) => {
        expect(() => CaptainAttendanceDispositionInputSchema({ ...input, ...change })).toThrow();
    });
    it.each([{ disposition: "approved" }, { admissionId: "a" }, { participantId: "p" }])(
        "rejects unsupported result %j",
        (change) => {
            expect(() =>
                CaptainAttendanceDispositionResultSchema({ ...result, ...change })
            ).toThrow();
        }
    );
    it.each(Object.keys(result))("rejects missing or null result %s", (key) => {
        const missing = { ...result };
        Reflect.deleteProperty(missing, key);
        expect(() => CaptainAttendanceDispositionResultSchema(missing)).toThrow();
        expect(() =>
            CaptainAttendanceDispositionResultSchema({ ...result, [key]: null })
        ).toThrow();
    });
    it("uses validated order for the request hash while preserving reason whitespace", async () => {
        const { serializeValidatedRequestV1 } = await import("@/protocol/request-idempotency.js");
        const first = CaptainAttendanceDispositionInputSchema(input);
        const reordered = CaptainAttendanceDispositionInputSchema(
            Object.fromEntries(Object.entries(input).reverse())
        );
        expect(Object.keys(reordered)).toEqual(Object.keys(input));
        expect(serializeValidatedRequestV1(first)).toBe(serializeValidatedRequestV1(reordered));
        expect(first.reason).toBe(input.reason);
        expect(serializeValidatedRequestV1(first)).not.toBe(
            serializeValidatedRequestV1(
                CaptainAttendanceDispositionInputSchema({ ...input, reason: input.reason.trim() })
            )
        );
    });
});

it("validates public rejection shapes consistently in standalone, active and terminal schemas", () => {
    const recommendation = {
        recommendationId: "rec-1",
        candidateId: "candidate-1",
        roleDefinitionId: "runtime_engineer",
        displayName: "Runtime",
        agendaItemId: "agenda-1",
        rationale: "Review",
        expectedContribution: "Review",
        evidenceGapIds: [],
        urgency: "current_agenda",
        status: "rejected",
        rejection: { reason: "Not needed", rejectedAt: 100 }
    };
    const statuses = ["running", "cancelled"].map((status) =>
        projectMeetingStatus(
            { ...meeting(status), meetingTasks: [] },
            { kind: "captain", sessionId: "captain-1" }
        )
    );
    for (const rejection of [
        undefined,
        null,
        {},
        { reason: " ", rejectedAt: 1 },
        { reason: "No", rejectedAt: -1 },
        { reason: "No", rejectedAt: Infinity },
        { reason: "No", rejectedAt: NaN },
        { reason: "No", rejectedAt: 1, requestId: "private" }
    ])
        expect(
            () => PublicAttendanceRecommendationSchema({ ...recommendation, rejection }),
            JSON.stringify(rejection)
        ).toThrow();
    const { rejection: _rejection, ...withoutRejection } = recommendation;
    expect(() => PublicAttendanceRecommendationSchema(recommendation)).not.toThrow();
    expect(() => PublicAttendanceRecommendationSchema(withoutRejection)).toThrow();
    for (const status of ["pending", "approved", "expired", "cancelled"]) {
        expect(
            () => PublicAttendanceRecommendationSchema({ ...recommendation, status }),
            status
        ).toThrow();
        expect(
            () => PublicAttendanceRecommendationSchema({ ...withoutRejection, status }),
            status
        ).not.toThrow();
    }
    for (const status of statuses) {
        const validate = (value: Record<string, unknown>) =>
            MeetingStatusResultSchema({ ...status, attendanceRecommendations: [value] });
        expect(() => validate(recommendation)).not.toThrow();
        expect(() => validate(withoutRejection)).toThrow();
        expect(() =>
            validate({ ...recommendation, rejection: { reason: " ", rejectedAt: 1 } })
        ).toThrow();
        expect(() => validate({ ...recommendation, status: "pending" })).toThrow();
        expect(() => validate({ ...withoutRejection, status: "pending" })).not.toThrow();
    }
});
it("validates exact nonempty unique archive rejections while preserving old packages", () => {
    const archive = archivePackage();
    const rejection = {
        recommendationId: "rec-1",
        candidateId: "candidate-1",
        roleDefinitionId: "runtime_engineer",
        displayName: "Runtime",
        agendaItemId: "agenda-1",
        reason: "Not needed",
        rejectedAt: 100
    };
    expect(MeetingArchivePackageSchema(archive)).not.toHaveProperty("attendanceRejections");
    expect(
        MeetingArchivePackageSchema({ ...archive, attendanceRejections: [rejection] })
    ).toMatchObject({ attendanceRejections: [rejection] });
    for (const attendanceRejections of [
        null,
        [],
        [rejection, rejection],
        ...Object.keys(rejection).map((key) => [{ ...rejection, [key]: undefined }]),
        ...Object.keys(rejection).map((key) => [
            { ...rejection, [key]: key === "rejectedAt" ? Infinity : " " }
        ]),
        [{ ...rejection, actorBinding: "secret" }],
        [{ ...rejection, rejectedAt: -1 }],
        [{ ...rejection, roleDefinitionId: "unknown" }]
    ]) {
        expect(
            () => MeetingArchivePackageSchema({ ...archive, attendanceRejections }),
            JSON.stringify(attendanceRejections)
        ).toThrow();
    }
});
