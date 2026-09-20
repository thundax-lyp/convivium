import type {
    EvidenceVersionV1,
    MeetingState,
    OpaqueId,
    TextWithReasonV1
} from "@/domain/index.js";
import { rejectedTransitionV1 as reject, type MeetingTransitionResultV1 } from "./result.js";

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
export interface SubmitEvidenceInputV1 {
    contributionId: OpaqueId;
    authorId: OpaqueId;
    evidence: EvidenceInputV1;
    packageId: OpaqueId;
    versionId: OpaqueId;
    now: number;
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
    const existingPackage =
        contribution.packageId === undefined
            ? undefined
            : state.evidencePackages.find((candidate) => candidate.id === contribution.packageId);
    const supplement = existingPackage !== undefined;
    if (
        (!supplement && contribution.status !== "preparing") ||
        (supplement &&
            (contribution.status === "under_review" ||
                contribution.supplementHand?.status !== "accepted" ||
                contribution.substantiveSupplementCount >= 2))
    )
        return reject(state, "INVALID_STATE", "contribution cannot register evidence");
    if (contribution.packageId !== undefined && existingPackage === undefined)
        return reject(state, "INVALID_STATE", "evidence package is missing");
    const currentVersion =
        existingPackage === undefined
            ? undefined
            : existingPackage.versions.find(
                  (candidate) => candidate.id === existingPackage.currentVersionId
              );
    if (existingPackage !== undefined && currentVersion === undefined)
        return reject(state, "INVALID_STATE", "current evidence version is missing");
    if (currentVersion === undefined) {
        const deadlines = [contribution.acceptedAt + state.limits.taskDeadlineMs];
        if (round.deadlineAt !== undefined) deadlines.push(round.deadlineAt);
        deadlines.push(
            ...state.tasks
                .filter(
                    (task) =>
                        task.assigneeId === input.authorId &&
                        task.agendaId === round.agendaId &&
                        (task.status === "open" || task.status === "claimed") &&
                        task.deadlineAt !== undefined
                )
                .map((task) => task.deadlineAt!)
        );
        if (deadlines.some((deadline) => !Number.isSafeInteger(deadline) || input.now >= deadline))
            return reject(state, "PRECONDITION_FAILED", "evidence deadline has passed");
    }
    if (currentVersion !== undefined) {
        const deadlines = [currentVersion.submittedAt + state.limits.taskDeadlineMs];
        if (round.deadlineAt !== undefined) deadlines.push(round.deadlineAt);
        const currentReview = state.reviews.find(
            (review) => review.versionId === currentVersion.id
        );
        const sent =
            currentReview === undefined
                ? undefined
                : state.reviewDeliveries.find(
                      (delivery) =>
                          delivery.reviewId === currentReview.id && delivery.status === "sent"
                  );
        if (sent?.sentAt !== undefined)
            deadlines.push(sent.sentAt + state.limits.responseDeadlineMs);
        deadlines.push(
            ...state.tasks
                .filter(
                    (task) =>
                        task.assigneeId === input.authorId &&
                        task.agendaId === round.agendaId &&
                        (task.status === "open" || task.status === "claimed") &&
                        task.deadlineAt !== undefined
                )
                .map((task) => task.deadlineAt!)
        );
        if (deadlines.some((deadline) => input.now >= deadline))
            return reject(state, "PRECONDITION_FAILED", "supplement deadline has passed");
    }
    const version: EvidenceVersionV1 = {
        ...input.evidence,
        id: input.versionId,
        ordinal: (currentVersion?.ordinal ?? 0) + 1,
        submittedAt: input.now
    };
    const packageValue =
        existingPackage === undefined
            ? {
                  id: input.packageId,
                  roundId: round.id,
                  contributionId: contribution.id,
                  authorId: contribution.contributorId,
                  agendaId: round.agendaId,
                  currentVersionId: version.id,
                  versions: [version]
              }
            : {
                  ...existingPackage,
                  currentVersionId: version.id,
                  versions: [...existingPackage.versions, version]
              };
    const {
        response: _response,
        supplementHand: _supplementHand,
        ...contributionWithoutOptional
    } = contribution;
    const nextContribution = {
        ...contributionWithoutOptional,
        packageId: packageValue.id,
        status: "under_review" as const,
        substantiveSupplementCount: supplement ? contribution.substantiveSupplementCount + 1 : 0
    };
    const next = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        contributions: state.contributions.map((candidate) =>
            candidate.id === contribution.id ? nextContribution : candidate
        ),
        evidencePackages: supplement
            ? state.evidencePackages.map((candidate) =>
                  candidate.id === packageValue.id ? packageValue : candidate
              )
            : [...state.evidencePackages, packageValue],
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
