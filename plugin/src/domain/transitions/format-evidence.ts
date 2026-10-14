import type { EvidenceVersion, MeetingState, OpaqueId, TextWithReason } from "@/domain/index.ts";
import { rejectedTransition as reject, type MeetingTransitionResult } from "./result.ts";

export interface EvidenceInput {
    summary: string;
    observation: string;
    interpretation: string;
    method: string;
    falsifiers: readonly TextWithReason[];
    uncertainties: readonly TextWithReason[];
    limitations: readonly TextWithReason[];
    claims: readonly {
        id: OpaqueId;
        statement: string;
        materialIds: readonly OpaqueId[];
        qualification: string;
    }[];
    materials: readonly {
        id: OpaqueId;
        kind: EvidenceVersion["materials"][number]["kind"];
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
export interface SubmitEvidenceInput {
    contributionId: OpaqueId;
    authorId: OpaqueId;
    evidence: EvidenceInput;
    packageId: OpaqueId;
    versionId: OpaqueId;
    now: number;
}
const validText = (value: string) => {
    return typeof value === "string" && value.trim().length > 0;
};
const validInput = (evidence: EvidenceInput) => {
    if (
        ![evidence.summary, evidence.observation, evidence.interpretation, evidence.method].every(
            validText
        )
    ) {
        return false;
    }
    if (
        ![
            evidence.falsifiers,
            evidence.uncertainties,
            evidence.limitations,
            evidence.claims,
            evidence.materials
        ].every((items) => items.length > 0)
    ) {
        return false;
    }
    if (
        evidence.falsifiers
            .concat(evidence.uncertainties, evidence.limitations)
            .some(
                (item) =>
                    !validText(item.value) ||
                    ((item.value === "无" || item.value === "未知") && !item.reason?.trim())
            )
    ) {
        return false;
    }
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
    ) {
        return false;
    }
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
};

export const submitEvidence = (
    state: MeetingState,
    input: SubmitEvidenceInput
): MeetingTransitionResult => {
    if (
        input.contributionId.trim() === "" ||
        input.authorId.trim() === "" ||
        input.versionId.trim() === "" ||
        input.packageId.trim() === "" ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0 ||
        !validInput(input.evidence)
    ) {
        return reject(state, "INVALID_ARGUMENT", "invalid evidence input");
    }
    const contribution = state.contributions.find(
        (candidate) => candidate.id === input.contributionId
    );
    if (!contribution) {
        return reject(state, "NOT_FOUND", "contribution not found");
    }
    if (contribution.contributorId !== input.authorId) {
        return reject(state, "UNAUTHORIZED", "identity is not contribution author");
    }
    const round = state.rounds.find((candidate) => candidate.id === contribution.roundId);
    if (!round) {
        return reject(state, "NOT_FOUND", "round not found");
    }
    if (contribution.status !== "preparing" || contribution.packageId !== undefined) {
        return reject(state, "INVALID_STATE", "contribution cannot register evidence");
    }
    const deadlines = [contribution.acceptedAt + state.limits.taskDeadlineMs];
    if (round.deadlineAt !== undefined) {
        deadlines.push(round.deadlineAt);
    }
    if (deadlines.some((deadline) => !Number.isSafeInteger(deadline) || input.now >= deadline)) {
        return reject(state, "PRECONDITION_FAILED", "evidence deadline has passed");
    }
    const version: EvidenceVersion = {
        ...input.evidence,
        id: input.versionId,
        ordinal: 1,
        submittedAt: input.now,
        status: "submitted",
        failureCount: 0
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
        status: "under_review" as const
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
};
