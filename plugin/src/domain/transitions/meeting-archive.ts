import type {
    ArchivePackage,
    ArchiveQuestionIssueDispositionFact,
    MeetingState,
    OpaqueId
} from "@/domain/meeting-state.js";
import { validateMeetingStateV1 } from "@/domain/meeting-state-validation.js";
import { rejectedTransitionV1, type MeetingTransitionResult } from "./result.js";

export interface StartMeetingArchiveInputV1 {
    archiveId: OpaqueId;
    actorId: OpaqueId;
    now: number;
    questionIssueDispositionFacts: readonly ArchiveQuestionIssueDispositionFact[];
}

export interface CompleteMeetingArchiveInput {
    actorId: OpaqueId;
    now: number;
    allSessionOwnershipClosed: boolean;
}

const identityProvenance = (state: MeetingState) =>
    state.identities.map((identity) => ({
        identityId: identity.id,
        displayName: identity.displayName,
        roles: identity.roles,
        ...(identity.definitionId === undefined
            ? {}
            : {
                  definitionId: identity.definitionId,
                  definitionVersion: identity.definitionVersion,
                  definitionHash: identity.definitionHash
              })
    }));

function materializeArchive(
    state: MeetingState,
    input: StartMeetingArchiveInputV1
): ArchivePackage {
    const termination = state.termination!;
    const unclosedContributions = termination.unclosedContributionIds.map((contributionId) => {
        const contribution = state.contributions.find((item) => item.id === contributionId)!;
        const round = state.rounds.find((item) => item.id === contribution.roundId)!;
        return {
            contributionId,
            contributorIdentityId: contribution.contributorId,
            agendaId: round.agendaId,
            status: contribution.status,
            ...(contribution.exitReason === undefined
                ? {}
                : { exitReason: contribution.exitReason })
        };
    });
    const evidenceBundles = state.publications.flatMap((publication) =>
        publication.finalVersionIds.map((versionId) => {
            const pkg = state.evidencePackages.find((candidate) =>
                candidate.versions.some((version) => version.id === versionId)
            )!;
            const version = pkg.versions.find((candidate) => candidate.id === versionId)!;
            const reviewId = publication.finalReviewIds.find(
                (candidate) =>
                    state.reviews.find((review) => review.id === candidate)?.versionId === versionId
            )!;
            return {
                packageId: pkg.id,
                authorIdentityId: pkg.authorId,
                agendaId: pkg.agendaId,
                version,
                review: state.reviews.find((review) => review.id === reviewId)!
            };
        })
    );
    return {
        id: input.archiveId,
        status: "complete",
        createdAt: input.now,
        publicSnapshotVersion: state.version,
        terminationId: termination.id,
        objective: structuredClone(state.objective),
        agenda: structuredClone(state.agenda),
        agendaCandidates: structuredClone(state.agendaCandidates),
        publications: structuredClone(state.publications),
        messages: structuredClone(state.messages),
        evidenceBundles: structuredClone(evidenceBundles),
        proposalRevisions: structuredClone(state.proposals),
        positions: structuredClone(state.positions),
        decisionCandidates: structuredClone(state.decisionCandidates),
        decisions: structuredClone(state.decisions),
        completionFacts: structuredClone(state.completionFacts),
        questions: structuredClone(state.questions),
        issues: structuredClone(state.issues),
        riskDispositions: structuredClone(state.riskDispositions),
        questionIssueDispositionFacts: structuredClone(
            [...input.questionIssueDispositionFacts].sort(
                (left, right) =>
                    left.occurredAt - right.occurredAt || left.factId.localeCompare(right.factId)
            )
        ),
        termination: structuredClone(termination),
        unresolvedQuestionIds: [...termination.unresolvedQuestionIds],
        unresolvedIssueIds: [...termination.unresolvedIssueIds],
        unresolvedItemIds: [
            ...termination.unresolvedQuestionIds,
            ...termination.unresolvedIssueIds
        ],
        unclosedContributions,
        identityProvenance: identityProvenance(state),
        exportMaterials: []
    };
}

export function startMeetingArchiveV1(
    state: MeetingState,
    input: StartMeetingArchiveInputV1
): MeetingTransitionResult {
    if (validateMeetingStateV1(state).kind === "invalid")
        return rejectedTransitionV1(state, "INVALID_ARGUMENT", "invalid meeting state");
    if (
        state.lifecycle.status !== "terminal" ||
        state.termination === undefined ||
        !input.archiveId.trim() ||
        !input.actorId.trim() ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0
    )
        return rejectedTransitionV1(state, "INVALID_STATE", "meeting is not ready for archiving");
    const next: MeetingState = {
        ...structuredClone(state),
        version: state.version + 1,
        updatedAt: input.now,
        lifecycle: { status: "archiving", changedAt: input.now, changedBy: input.actorId },
        archive: materializeArchive(state, input)
    };
    return {
        kind: "accepted",
        state: next,
        relatedIds: [input.archiveId, state.termination.id],
        effectRequests: []
    };
}

export function completeMeetingArchiveV1(
    state: MeetingState,
    input: CompleteMeetingArchiveInput
): MeetingTransitionResult {
    if (validateMeetingStateV1(state).kind === "invalid")
        return rejectedTransitionV1(state, "INVALID_ARGUMENT", "invalid meeting state");
    if (state.lifecycle.status !== "archiving" || state.archive?.status !== "complete")
        return rejectedTransitionV1(state, "INVALID_STATE", "meeting is not archiving");
    if (!input.allSessionOwnershipClosed)
        return rejectedTransitionV1(state, "PRECONDITION_FAILED", "session ownership remains open");
    if (!input.actorId.trim() || !Number.isSafeInteger(input.now) || input.now < 0)
        return rejectedTransitionV1(state, "INVALID_ARGUMENT", "invalid archive completion input");
    const next: MeetingState = {
        ...structuredClone(state),
        version: state.version + 1,
        updatedAt: input.now,
        lifecycle: { status: "archived", changedAt: input.now, changedBy: input.actorId }
    };
    return { kind: "accepted", state: next, relatedIds: [next.id], effectRequests: [] };
}
