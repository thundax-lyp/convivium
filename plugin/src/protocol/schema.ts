import Schema from "@deepseek-ai/schemastery";
import type {
    AttendanceRecommendationClaimV1,
    KnownMeetingProtocolErrorCodeV1,
    MeetingAgentCatalogProjectionV1,
    MeetingAgentCatalogSnapshotV1,
    PublicAttendanceRecommendationV1
} from "./types.js";

const requiredString = () => Schema.string().required();
const requiredNumber = () => Schema.number().required();

function assertExactKeys(value: object, expected: readonly string[], label: string): void {
    const actual = Object.keys(value).sort();
    const required = [...expected].sort();
    if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
        throw new TypeError(`${label} has unexpected fields`);
    }
}

export const ProtocolVersionSchema = Schema.const(1).required();

const knownErrorCodes = [
    "INVALID_ARGUMENT",
    "MEETING_NOT_FOUND",
    "UNAUTHORIZED_CALLER",
    "INVALID_STATE_TRANSITION",
    "STALE_ATTEMPT",
    "STALE_MANAGER_ATTEMPT",
    "VERSION_CONFLICT",
    "IDEMPOTENCY_CONFLICT",
    "IMMUTABLE_MEETING",
    "ARCHIVED_MEETING",
    "SOURCE_MEETING_NOT_ARCHIVED",
    "ARCHIVE_MATERIAL_NOT_FOUND",
    "PARTICIPANT_NOT_DISPATCHABLE",
    "REQUIRED_SPEAKER_UNAVAILABLE",
    "MANAGER_PLAN_INVALID",
    "DELIVERY_RETRY_EXHAUSTED",
    "UNSUPPORTED_CAPABILITY",
    "AGENT_CATALOG_UNAVAILABLE",
    "AGENT_CATALOG_VERSION_UNSUPPORTED",
    "AGENT_CANDIDATE_NOT_FOUND",
    "AGENT_CANDIDATE_UNAVAILABLE",
    "ATTENDANCE_RECOMMENDATION_INVALID",
    "ATTENDANCE_RECOMMENDATION_STALE",
    "ATTENDANCE_RECOMMENDATION_NOT_PENDING",
    "PARTICIPANT_PROVISIONING_FAILED",
    "INTERNAL_ERROR"
] as const;

const agentRoleDefinitionIdSchema = Schema.union([
    "domain_architect",
    "runtime_engineer",
    "protocol_ui_engineer",
    "verification_reviewer",
    "github_research_analyst",
    "arxiv_research_analyst",
    "web_research_analyst",
    "meeting_scribe"
] as const).required();
const agentEvidenceScopeSchema = Schema.union([
    "repository",
    "github",
    "arxiv",
    "web"
] as const).required();
const availabilitySchema = Schema.union(["available", "unavailable"] as const).required();

const agentRoleDefinitionSchema = Schema.transform(
    Schema.object({
        roleDefinitionId: agentRoleDefinitionIdSchema,
        version: requiredString(),
        displayName: requiredString(),
        summary: requiredString(),
        expertiseTags: Schema.array(requiredString()).required(),
        evidenceScopes: Schema.array(agentEvidenceScopeSchema).required(),
        responsibilities: Schema.array(requiredString()).required(),
        nonResponsibilities: Schema.array(requiredString()).required()
    }),
    (value) => {
        assertExactKeys(
            value,
            [
                "roleDefinitionId",
                "version",
                "displayName",
                "summary",
                "expertiseTags",
                "evidenceScopes",
                "responsibilities",
                "nonResponsibilities"
            ],
            "AgentRoleDefinitionV1"
        );
        return value;
    }
);

const catalogSnapshotCandidateSchema = Schema.transform(
    Schema.object({
        candidateId: requiredString(),
        roleDefinitionId: agentRoleDefinitionIdSchema,
        roleDefinitionVersion: requiredString(),
        sourceMemberName: requiredString(),
        agentDefinitionId: requiredString(),
        availability: availabilitySchema
    }),
    (value) => {
        assertExactKeys(
            value,
            [
                "candidateId",
                "roleDefinitionId",
                "roleDefinitionVersion",
                "sourceMemberName",
                "agentDefinitionId",
                "availability"
            ],
            "MeetingAgentCatalogSnapshotV1.candidate"
        );
        return value;
    }
);

export const MeetingAgentCatalogSnapshotSchema: Schema<unknown, MeetingAgentCatalogSnapshotV1> =
    Schema.transform(
        Schema.object({
            protocolVersion: ProtocolVersionSchema,
            catalogId: requiredString(),
            catalogVersion: requiredString(),
            teamId: requiredString(),
            capturedAt: requiredNumber(),
            roles: Schema.array(agentRoleDefinitionSchema).required(),
            candidates: Schema.array(catalogSnapshotCandidateSchema).required()
        }),
        (value) => {
            assertExactKeys(
                value,
                [
                    "protocolVersion",
                    "catalogId",
                    "catalogVersion",
                    "teamId",
                    "capturedAt",
                    "roles",
                    "candidates"
                ],
                "MeetingAgentCatalogSnapshotV1"
            );
            return value as MeetingAgentCatalogSnapshotV1;
        }
    ) as Schema<unknown, MeetingAgentCatalogSnapshotV1>;

const meetingAgentCandidateSchema = Schema.transform(
    Schema.object({
        candidateId: requiredString(),
        roleDefinitionId: agentRoleDefinitionIdSchema,
        roleDefinitionVersion: requiredString(),
        displayName: requiredString(),
        summary: requiredString(),
        expertiseTags: Schema.array(requiredString()).required(),
        evidenceScopes: Schema.array(agentEvidenceScopeSchema).required(),
        responsibilities: Schema.array(requiredString()).required(),
        nonResponsibilities: Schema.array(requiredString()).required(),
        availability: availabilitySchema
    }),
    (value) => {
        assertExactKeys(
            value,
            [
                "candidateId",
                "roleDefinitionId",
                "roleDefinitionVersion",
                "displayName",
                "summary",
                "expertiseTags",
                "evidenceScopes",
                "responsibilities",
                "nonResponsibilities",
                "availability"
            ],
            "MeetingAgentCandidateV1"
        );
        return value;
    }
);

const managerResearchNeedSchema = Schema.transform(
    Schema.object({
        evidenceGapId: requiredString(),
        agendaItemId: requiredString(),
        question: requiredString(),
        requiredScopes: Schema.array(agentEvidenceScopeSchema).required(),
        existingEvidenceIds: Schema.array(requiredString()).required(),
        status: Schema.union(["open", "stale", "satisfied"] as const).required()
    }),
    (value) => {
        assertExactKeys(
            value,
            [
                "evidenceGapId",
                "agendaItemId",
                "question",
                "requiredScopes",
                "existingEvidenceIds",
                "status"
            ],
            "ManagerResearchNeedV1"
        );
        return value;
    }
);

export const MeetingAgentCatalogProjectionSchema: Schema<unknown, MeetingAgentCatalogProjectionV1> =
    Schema.transform(
        Schema.object({
            protocolVersion: ProtocolVersionSchema,
            catalogId: requiredString(),
            catalogVersion: requiredString(),
            candidates: Schema.array(meetingAgentCandidateSchema).required(),
            researchNeeds: Schema.array(managerResearchNeedSchema).required()
        }),
        (value) => {
            assertExactKeys(
                value,
                ["protocolVersion", "catalogId", "catalogVersion", "candidates", "researchNeeds"],
                "MeetingAgentCatalogProjectionV1"
            );
            return value as MeetingAgentCatalogProjectionV1;
        }
    ) as Schema<unknown, MeetingAgentCatalogProjectionV1>;

export const AttendanceRecommendationClaimSchema: Schema<unknown, AttendanceRecommendationClaimV1> =
    Schema.transform(
        Schema.object({
            candidateId: requiredString(),
            agendaItemId: requiredString(),
            rationale: requiredString(),
            expectedContribution: requiredString(),
            evidenceGapIds: Schema.array(requiredString()).required(),
            urgency: Schema.union([
                "current_agenda",
                "later_agenda",
                "follow_up"
            ] as const).required()
        }),
        (value) => {
            assertExactKeys(
                value,
                [
                    "candidateId",
                    "agendaItemId",
                    "rationale",
                    "expectedContribution",
                    "evidenceGapIds",
                    "urgency"
                ],
                "AttendanceRecommendationClaimV1"
            );
            return value as AttendanceRecommendationClaimV1;
        }
    ) as Schema<unknown, AttendanceRecommendationClaimV1>;

export const PublicAttendanceRecommendationSchema: Schema<
    unknown,
    PublicAttendanceRecommendationV1
> = Schema.transform(
    Schema.object({
        candidateId: requiredString(),
        agendaItemId: requiredString(),
        rationale: requiredString(),
        expectedContribution: requiredString(),
        evidenceGapIds: Schema.array(requiredString()).required(),
        urgency: Schema.union(["current_agenda", "later_agenda", "follow_up"] as const).required(),
        recommendationId: requiredString(),
        roleDefinitionId: agentRoleDefinitionIdSchema,
        displayName: requiredString(),
        status: Schema.union([
            "pending",
            "approved",
            "rejected",
            "expired",
            "cancelled"
        ] as const).required(),
        admissionStatus: Schema.union([
            "approved",
            "provisioning",
            "active",
            "failed",
            "cancelled"
        ] as const),
        failureCode: Schema.string()
    }),
    (value) => {
        const expected = [
            "candidateId",
            "agendaItemId",
            "rationale",
            "expectedContribution",
            "evidenceGapIds",
            "urgency",
            "recommendationId",
            "roleDefinitionId",
            "displayName",
            "status"
        ];
        if (Object.prototype.hasOwnProperty.call(value, "admissionStatus")) {
            expected.push("admissionStatus");
        }
        if (Object.prototype.hasOwnProperty.call(value, "failureCode")) {
            expected.push("failureCode");
        }
        assertExactKeys(value, expected, "PublicAttendanceRecommendationV1");
        return value as PublicAttendanceRecommendationV1;
    }
) as Schema<unknown, PublicAttendanceRecommendationV1>;

export const KnownMeetingProtocolErrorCodeSchema = Schema.union(knownErrorCodes).required();
export const MeetingProtocolErrorCodeSchema = Schema.string().required();

export function isKnownMeetingProtocolErrorCode(
    value: string
): value is KnownMeetingProtocolErrorCodeV1 {
    return (knownErrorCodes as readonly string[]).includes(value);
}

export const ProtocolMetaSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    meetingId: requiredString(),
    meetingVersion: requiredNumber()
});

export const ProtocolErrorSchema = Schema.object({
    protocolVersion: ProtocolVersionSchema,
    ok: Schema.const(false).required(),
    code: MeetingProtocolErrorCodeSchema,
    message: requiredString(),
    meetingId: Schema.string(),
    meetingVersion: Schema.number(),
    turnId: Schema.string(),
    stepId: Schema.string(),
    attemptId: Schema.string(),
    deliveryId: Schema.string(),
    participantId: Schema.string(),
    retryable: Schema.boolean().required()
});

export function createProtocolSuccessEnvelopeSchema<T>(resultSchema: Schema<T>) {
    return Schema.object({
        protocolVersion: ProtocolVersionSchema,
        ok: Schema.const(true).required(),
        meetingId: requiredString(),
        meetingVersion: requiredNumber(),
        result: resultSchema.required()
    });
}

export function validateProtocolError(value: unknown) {
    return ProtocolErrorSchema(value as Record<string, unknown>);
}

export function validateProtocolSuccessEnvelope<T>(resultSchema: Schema<T>, value: unknown) {
    const envelope = createProtocolSuccessEnvelopeSchema(resultSchema)(
        value as Record<string, unknown>
    );
    const result = envelope.result as Record<string, unknown>;
    for (const key of ["meetingId", "meetingVersion"] as const) {
        if (Object.prototype.hasOwnProperty.call(result, key) && result[key] !== envelope[key]) {
            throw new TypeError(`success envelope ${key} does not match result metadata`);
        }
    }
    return envelope;
}
