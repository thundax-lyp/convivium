import type {
    EvidenceVersionV1,
    MeetingState,
    OpaqueId,
    TextWithReasonV1
} from "@/domain/index.js";
import { rejectedTransitionV1 as reject, type MeetingTransitionResultV1 } from "./result-v1.js";

export interface EvidenceInputV1 {
    observation: string;
    interpretation: string;
    method: string;
    falsifiers: readonly TextWithReasonV1[];
    uncertainties: readonly TextWithReasonV1[];
    limitations: readonly TextWithReasonV1[];
    claims: readonly {
        id: OpaqueId;
        statement: string;
        materialIds: readonly OpaqueId[];
        qualification: string;
    }[];
    materials: readonly {
        id: OpaqueId;
        kind: EvidenceVersionV1["materials"][number]["kind"];
        originator: string;
        originalSource: string;
        sourcePublishedAt: string;
        acquiredAt: string;
        version: string;
        locator: string;
        location: string;
        verificationConditions: string;
        limitations: string;
        sharedDependencies: readonly string[];
        reason?: string;
    }[];
}
type DraftInput = {
    contributionId: OpaqueId;
    managerId: OpaqueId;
    evidenceHash: string;
    disposition: "accepted" | "rejected" | "deferred";
    missingFields: readonly import("./result-v1.js").EvidenceFieldNameV1[];
    rationale: string;
    approvalId: OpaqueId;
    now: number;
};
export interface SubmitEvidenceInputV1 {
    contributionId: OpaqueId;
    authorId: OpaqueId;
    evidence: EvidenceInputV1;
    packageId: OpaqueId;
    versionId: OpaqueId;
    now: number;
}
function validHash(hash: string) {
    return /^[0-9a-f]{64}$/.test(hash);
}
function validText(value: string) {
    return value.trim().length > 0;
}
function validInput(evidence: EvidenceInputV1) {
    if (![evidence.observation, evidence.interpretation, evidence.method].every(validText))
        return false;
    if (
        ![
            evidence.falsifiers,
            evidence.uncertainties,
            evidence.limitations,
            evidence.claims,
            evidence.materials
        ].every((items) => items.length > 0)
    )
        return false;
    if (
        evidence.falsifiers
            .concat(evidence.uncertainties, evidence.limitations)
            .some(
                (item) =>
                    !validText(item.value) ||
                    ((item.value === "无" || item.value === "未知") && !item.reason?.trim())
            )
    )
        return false;
    const materialIds = new Set(evidence.materials.map((material) => material.id));
    if (
        evidence.claims.some(
            (claim) =>
                !validText(claim.id) ||
                !validText(claim.statement) ||
                !validText(claim.qualification) ||
                claim.materialIds.length === 0 ||
                claim.materialIds.some((id) => !materialIds.has(id))
        )
    )
        return false;
    return evidence.materials.every(
        (material) =>
            [
                material.id,
                material.originator,
                material.originalSource,
                material.sourcePublishedAt,
                material.acquiredAt,
                material.version,
                material.locator,
                material.location,
                material.verificationConditions,
                material.limitations
            ].every(validText) &&
            (!["unknown", "not_applicable"].includes(material.kind) || !!material.reason?.trim()) &&
            (!(
                material.originator === "未知" ||
                material.sourcePublishedAt === "未知" ||
                material.sourcePublishedAt === "不适用" ||
                material.acquiredAt === "未知" ||
                material.acquiredAt === "不适用"
            ) ||
                !!material.reason?.trim())
    );
}

export function reviewEvidenceDraftV1(
    state: MeetingState,
    input: DraftInput
): MeetingTransitionResultV1 {
    if (
        input.contributionId.trim() === "" ||
        input.managerId.trim() === "" ||
        input.approvalId.trim() === "" ||
        !validHash(input.evidenceHash) ||
        !validText(input.rationale) ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0
    )
        return reject(state, "INVALID_ARGUMENT", "invalid format disposition");
    const contribution = state.contributions.find(
        (candidate) => candidate.id === input.contributionId
    );
    if (!contribution) return reject(state, "NOT_FOUND", "contribution not found");
    const round = state.rounds.find((candidate) => candidate.id === contribution.roundId);
    if (!round) return reject(state, "NOT_FOUND", "round not found");
    const managerIdentity = state.identities.find((candidate) => candidate.id === input.managerId);
    if (!managerIdentity || !managerIdentity.roles.includes("manager"))
        return reject(state, "UNAUTHORIZED", "identity is not a manager");
    if (contribution.status === "under_review")
        return reject(state, "INVALID_STATE", "current version is under review");
    if (contribution.status !== "preparing" && contribution.supplementHand?.status !== "accepted")
        return reject(state, "INVALID_STATE", "contribution is not ready for format review");
    if (input.disposition === "accepted" && input.missingFields.length > 0)
        return reject(state, "INVALID_ARGUMENT", "accepted disposition cannot have missing fields");
    if (input.disposition === "rejected" && input.missingFields.length === 0)
        return reject(state, "INVALID_ARGUMENT", "rejected disposition requires missing fields");
    const approval = {
        id: input.approvalId,
        contributionId: contribution.id,
        managerId: input.managerId,
        evidenceHash: input.evidenceHash,
        approvedAt: input.now
    };
    const nextContribution =
        input.disposition === "accepted"
            ? contribution
            : { ...contribution, status: "format_correction" as const, supplementHand: undefined };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        contributions: state.contributions.map((candidate) =>
            candidate.id === contribution.id ? nextContribution : candidate
        ),
        formatApprovals:
            input.disposition === "accepted"
                ? [
                      ...state.formatApprovals.filter(
                          (candidate) => candidate.contributionId !== contribution.id
                      ),
                      approval
                  ]
                : state.formatApprovals.filter(
                      (candidate) => candidate.contributionId !== contribution.id
                  )
    };
    return {
        kind: "accepted",
        state: next,
        relatedIds: [contribution.id, ...(input.disposition === "accepted" ? [approval.id] : [])],
        effectRequests: [
            {
                kind: "agent_notice",
                noticeKind: "format_disposition",
                recipientId: contribution.contributorId,
                agendaId: round.agendaId,
                contributionId: contribution.id,
                evidenceHash: input.evidenceHash,
                disposition: input.disposition,
                reason: input.rationale,
                missingFields: input.missingFields
            }
        ]
    };
}

export function submitEvidenceV1(
    state: MeetingState,
    input: SubmitEvidenceInputV1
): MeetingTransitionResultV1 {
    if (
        input.contributionId.trim() === "" ||
        input.authorId.trim() === "" ||
        input.versionId.trim() === "" ||
        input.packageId.trim() === "" ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0 ||
        !validInput(input.evidence)
    )
        return reject(state, "INVALID_ARGUMENT", "invalid evidence input");
    const contribution = state.contributions.find(
        (candidate) => candidate.id === input.contributionId
    );
    if (!contribution) return reject(state, "NOT_FOUND", "contribution not found");
    if (contribution.contributorId !== input.authorId)
        return reject(state, "UNAUTHORIZED", "identity is not contribution author");
    const round = state.rounds.find((candidate) => candidate.id === contribution.roundId);
    if (!round) return reject(state, "NOT_FOUND", "round not found");
    if (contribution.status !== "preparing")
        return reject(state, "INVALID_STATE", "contribution is not preparing");
    if (contribution.packageId !== undefined)
        return reject(state, "INVALID_STATE", "contribution already has evidence");
    const version: EvidenceVersionV1 = {
        ...input.evidence,
        id: input.versionId,
        ordinal: 1,
        submittedAt: input.now
    };
    const packageValue = {
        id: input.packageId,
        roundId: round.id,
        contributionId: contribution.id,
        authorId: contribution.contributorId,
        agendaId: round.agendaId,
        currentVersionId: version.id,
        versions: [version]
    };
    const nextContribution = {
        ...contribution,
        packageId: packageValue.id,
        status: "under_review" as const,
        substantiveSupplementCount: 0,
        response: undefined
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        contributions: state.contributions.map((candidate) =>
            candidate.id === contribution.id ? nextContribution : candidate
        ),
        evidencePackages: [...state.evidencePackages, packageValue],
        registrations: [
            ...state.registrations,
            {
                id: `registration-${input.versionId}`,
                versionId: version.id,
                status: "complete" as const,
                createdAt: input.now
            }
        ]
    };
    return {
        kind: "accepted",
        state: next,
        relatedIds: [packageValue.id, version.id, `registration-${input.versionId}`],
        effectRequests: [
            {
                kind: "agent_notice",
                noticeKind: "review_request",
                recipientId: state.evidenceReviewerId,
                agendaId: round.agendaId,
                versionId: version.id
            }
        ]
    };
}
