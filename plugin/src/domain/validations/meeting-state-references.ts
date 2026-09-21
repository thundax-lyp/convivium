import type { MeetingState } from "@/domain/meeting-state.js";
import {
    checkRefs,
    ids,
    indexById,
    ownUndefined,
    ref,
    type RecordValue,
    indexVersionOwners
} from "./meeting-state-helpers.js";

const fail = (path: string) => path;

function validateAgendaRoundsAndContributions(parsedState: MeetingState): string | undefined {
    const { objective, lifecycle } = parsedState;
    const identityById = indexById(parsedState.identities);
    const identityIds = new Set(identityById.keys());
    const agendaById = indexById(parsedState.agenda);
    const agendaIds = new Set(agendaById.keys());
    const outputIds = ids(objective.requiredOutputs);
    for (let i = 0; i < parsedState.agenda.length; i++) {
        const item = parsedState.agenda[i];
        const path = `$.agenda[${i}]`;
        for (const [key, ids] of [["requiredOutputIds", outputIds]] as const) {
            const p = checkRefs(item[key], ids, `${path}.${key}`);
            if (p) return fail(p);
        }
        if (ownUndefined(item, "ownerId", `${path}.ownerId`)) return fail(`${path}.ownerId`);
    }
    const activeAgendaIndexes = parsedState.agenda.flatMap((item, index) =>
        item.status === "active" ? [index] : []
    );
    if (activeAgendaIndexes.length > 1) return fail(`$.agenda[${activeAgendaIndexes[1]}].status`);
    if (
        !(["terminal", "archiving", "archived"] as readonly string[]).includes(
            lifecycle.status as string
        ) &&
        activeAgendaIndexes.length !== 1
    )
        return fail("$.agenda");
    for (let i = 0; i < parsedState.identities.length; i++) {
        const item = parsedState.identities[i];
        for (const key of ["agendaResponsibilityIds"] as const) {
            const p = checkRefs(item[key], agendaIds, `$.identities[${i}].${key}`);
            if (p) return fail(p);
        }
    }
    const rounds = parsedState.rounds;
    const managerPlanById = indexById(parsedState.managerPlans);
    const roundIds = new Set<string>();
    for (let i = 0; i < rounds.length; i++) {
        const item = rounds[i];
        const path = `$.rounds[${i}]`;
        const r = item;
        roundIds.add(r.id);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        const plan = managerPlanById.get(r.planId);
        if (
            !plan ||
            plan.agendaId !== r.agendaId ||
            plan.kind !== "open_round" ||
            plan.status !== "completed" ||
            plan.roundGoal === undefined ||
            plan.roundGoal.question !== r.roundGoal.question ||
            plan.roundGoal.evidenceGap !== r.roundGoal.evidenceGap ||
            plan.roundGoal.expectedOutput !== r.roundGoal.expectedOutput
        )
            return fail(`${path}.planId`);
        if (r.status === "open") {
            const agenda = agendaById.get(r.agendaId as string);
            if (!agenda || agenda.status !== "active") return fail(`${path}.agendaId`);
        }
    }
    const opportunityRequestIds = new Set<string>();
    for (let i = 0; i < parsedState.opportunityRequests.length; i++) {
        const request = parsedState.opportunityRequests[i];
        const path = `$.opportunityRequests[${i}]`;
        opportunityRequestIds.add(request.id);
        if (!ref(request.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        if (!ref(request.contributorId, identityIds)) return fail(`${path}.contributorId`);
    }
    const pendingHandKeys = new Set<string>();
    for (let i = 0; i < parsedState.pendingHandRaises.length; i++) {
        const hand = parsedState.pendingHandRaises[i];
        const path = `$.pendingHandRaises[${i}]`;
        const key = `${hand.roundId}\0${hand.contributorId}`;
        if (pendingHandKeys.has(key)) return fail(`${path}.contributorId`);
        pendingHandKeys.add(key);
        if (!ref(hand.roundId, roundIds)) return fail(`${path}.roundId`);
        if (!ref(hand.contributorId, identityIds)) return fail(`${path}.contributorId`);
    }
    const contributions = parsedState.contributions;
    const contributionIds = new Set<string>();
    const contributorRounds = new Set<string>();
    for (let i = 0; i < contributions.length; i++) {
        const item = contributions[i];
        const path = `$.contributions[${i}]`;
        const r = item;
        contributionIds.add(r.id);
        const contributorRound = `${r.contributorId}\0${r.roundId}`;
        if (contributorRounds.has(contributorRound)) return fail(`${path}.roundId`);
        contributorRounds.add(contributorRound);
        if (!ref(r.roundId, roundIds)) return fail(`${path}.roundId`);
        if (!ref(r.contributorId, identityIds)) return fail(`${path}.contributorId`);
        if (ownUndefined(r, "packageId", `${path}.packageId`)) return fail(`${path}.packageId`);
    }
    return undefined;
}

function validateEvidencePackages(parsedState: MeetingState): string | undefined {
    const identityIds = ids(parsedState.identities);
    const agendaIds = ids(parsedState.agenda);
    const rounds = parsedState.rounds;
    const roundById = indexById(rounds);
    const roundIds = ids(rounds);
    const contributions = parsedState.contributions;
    const contributionById = indexById(contributions);
    const contributionIds = ids(contributions);
    const packages = parsedState.evidencePackages;
    const versionOwnerById = new Map<string, (typeof packages)[number]>();
    const packageIds = new Set<string>();
    const versionIds = new Set<string>();
    for (let i = 0; i < packages.length; i++) {
        const item = packages[i];
        const path = `$.evidencePackages[${i}]`;
        const r = item;
        if (!ref(r.roundId, roundIds)) return fail(`${path}.roundId`);
        if (!ref(r.contributionId, contributionIds)) return fail(`${path}.contributionId`);
        if (!ref(r.authorId, identityIds)) return fail(`${path}.authorId`);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        const contribution = contributionById.get(r.contributionId as string);
        const round = roundById.get(r.roundId as string);
        if (!contribution || contribution.roundId !== r.roundId) return fail(`${path}.roundId`);
        if (!round || round.agendaId !== r.agendaId) return fail(`${path}.agendaId`);
        if (!contribution || contribution.contributorId !== r.authorId)
            return fail(`${path}.authorId`);
        packageIds.add(r.id as string);
        const packageVersionIds = new Set<string>();
        for (let j = 0; j < r.versions.length; j++) {
            const v = r.versions[j];
            const vp = `${path}.versions[${j}]`;
            const vr = v;
            if (vr.ordinal !== j + 1) return fail(`${vp}.ordinal`);
            const materialIds = new Set<string>();
            for (const material of vr.materials) {
                materialIds.add(material.id);
            }
            for (let k = 0; k < vr.claims.length; k++) {
                const claim = vr.claims[k];
                for (let m = 0; m < claim.materialIds.length; m++)
                    if (!materialIds.has(claim.materialIds[m]))
                        return fail(`${vp}.claims[${k}].materialIds[${m}]`);
            }
            if (versionIds.has(vr.id)) return fail(`${vp}.id`);
            versionIds.add(vr.id);
            packageVersionIds.add(vr.id);
            versionOwnerById.set(vr.id, item);
        }
        if (!packageVersionIds.has(r.currentVersionId as string))
            return fail(`${path}.currentVersionId`);
    }
    for (let i = 0; i < packages.length; i++) {
        const packageValue = packages[i] as unknown as RecordValue;
        if (!ref(packageValue.currentVersionId, versionIds))
            return fail(`$.evidencePackages[${i}].currentVersionId`);
        const contribution = contributionById.get(packageValue.contributionId as string);
        if (!contribution || contribution.packageId !== packageValue.id)
            return fail(`$.evidencePackages[${i}].contributionId`);
    }
    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i] as unknown as RecordValue;
        for (let j = 0; j < (round.contributionIds as readonly unknown[]).length; j++) {
            const contributionId = (round.contributionIds as readonly unknown[])[j];
            const contribution = contributionById.get(contributionId as string);
            if (!contribution || contribution.roundId !== round.id)
                return fail(`$.rounds[${i}].contributionIds[${j}]`);
        }
    }
    for (let i = 0; i < contributions.length; i++) {
        const contribution = contributions[i] as unknown as RecordValue;
        const round = roundById.get(contribution.roundId as string);
        if (!round || !(round.contributionIds as readonly unknown[]).includes(contribution.id))
            return fail(`$.contributions[${i}].roundId`);
    }
    return undefined;
}

function validateRegistrationsAndReviews(parsedState: MeetingState): string | undefined {
    const identityById = indexById(parsedState.identities);
    const identityIds = new Set(identityById.keys());
    const roundById = indexById(parsedState.rounds);
    const contributions = parsedState.contributions;
    const registrations = parsedState.registrations;
    const reviews = parsedState.reviews;
    const versionOwnerById = indexVersionOwners(parsedState);
    const versionIds = new Set(versionOwnerById.keys());
    for (let i = 0; i < registrations.length; i++) {
        const r = registrations[i];
        const path = `$.registrations[${i}]`;
        if (!ref(r.versionId, versionIds)) return fail(`${path}.versionId`);
    }
    const reviewIds = new Set<string>();
    for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i];
        const path = `$.reviews[${i}]`;
        reviewIds.add(r.id as string);
        if (!ref(r.versionId, versionIds)) return fail(`${path}.versionId`);
        if (!ref(r.reviewerId, identityIds)) return fail(`${path}.reviewerId`);
        const reviewer = identityById.get(r.reviewerId as string);
        if (!reviewer || !reviewer.roles.includes("evidence_reviewer"))
            return fail(`${path}.reviewerId`);
        const owner = versionOwnerById.get(r.versionId);
        if (owner?.authorId === r.reviewerId) return fail(`${path}.reviewerId`);
    }
    const claimedRoundIds = new Set<string>();
    for (let i = 0; i < parsedState.reviewClaims.length; i++) {
        const claim = parsedState.reviewClaims[i];
        const path = `$.reviewClaims[${i}]`;
        if (claimedRoundIds.has(claim.roundId)) return fail(`${path}.roundId`);
        claimedRoundIds.add(claim.roundId);
        const round = roundById.get(claim.roundId);
        if (!round || round.status !== "open") return fail(`${path}.roundId`);
        if (claim.reviewerId !== parsedState.evidenceReviewerId) return fail(`${path}.reviewerId`);
        for (let j = 0; j < claim.versionIds.length; j++) {
            const versionId = claim.versionIds[j];
            const owner = versionOwnerById.get(versionId);
            if (
                !owner ||
                owner.roundId !== claim.roundId ||
                owner.currentVersionId !== versionId ||
                !registrations.some(
                    (registration) =>
                        registration.versionId === versionId && registration.status === "complete"
                ) ||
                reviews.some((review) => review.versionId === versionId)
            )
                return fail(`${path}.versionIds[${j}]`);
        }
    }
    for (let i = 0; i < contributions.length; i++) {
        const hand = (contributions[i] as unknown as RecordValue).supplementHand as unknown as
            RecordValue | undefined;
        if (hand && hand.status !== "pending" && hand.status !== "accepted")
            return fail(`$.contributions[${i}].supplementHand.status`);
    }
    return undefined;
}

function validateDeliveriesAndPublications(parsedState: MeetingState): string | undefined {
    const identityIds = ids(parsedState.identities);
    const rounds = parsedState.rounds;
    const roundById = indexById(rounds);
    const reviews = parsedState.reviews;
    const reviewById = indexById(reviews);
    const reviewIds = ids(reviews);
    const versionOwnerById = indexVersionOwners(parsedState);
    const versionIds = new Set(versionOwnerById.keys());
    const deliveries = parsedState.reviewDeliveries;
    for (let i = 0; i < deliveries.length; i++) {
        const r = deliveries[i];
        const path = `$.reviewDeliveries[${i}]`;
        if (!ref(r.reviewId, reviewIds)) return fail(`${path}.reviewId`);
        if (!ref(r.authorId, identityIds)) return fail(`${path}.authorId`);
        const review = reviewById.get(r.reviewId);
        const ownerPackage = review && versionOwnerById.get(review.versionId);
        if (ownerPackage && ownerPackage.authorId !== r.authorId) return fail(`${path}.authorId`);
    }
    const publications = parsedState.publications;
    const publicationById = indexById(publications);
    const publicationIds = new Set<string>();
    for (let i = 0; i < publications.length; i++) {
        const r = publications[i];
        const path = `$.publications[${i}]`;
        publicationIds.add(r.id as string);
        const round = roundById.get(r.roundId as string);
        if (!round || round.status !== "published" || round.publicationId !== r.id)
            return fail(`${path}.roundId`);
        for (const [key, ids] of [
            ["finalVersionIds", versionIds],
            ["finalReviewIds", reviewIds]
        ] as const) {
            const p = checkRefs(r[key], ids, `${path}.${key}`);
            if (p) return fail(p);
        }
    }
    for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i] as unknown as RecordValue;
        if (r.status === "published") {
            const publication = publicationById.get(r.publicationId as string);
            if (!publication || publication.roundId !== r.id)
                return fail(`$.rounds[${i}].publicationId`);
        }
    }
    const publishedVersionIds = new Set<string>();
    for (let i = 0; i < publications.length; i++) {
        const publication = publications[i] as unknown as RecordValue;
        const round = roundById.get(publication.roundId as string);
        for (let j = 0; j < (publication.finalVersionIds as readonly unknown[]).length; j++) {
            const versionId = (publication.finalVersionIds as readonly unknown[])[j];
            const owner = versionOwnerById.get(versionId as string);
            if (!owner || owner.roundId !== publication.roundId || round === undefined)
                return fail(`$.publications[${i}].finalVersionIds[${j}]`);
            publishedVersionIds.add(versionId as string);
        }
        for (let j = 0; j < (publication.finalReviewIds as readonly unknown[]).length; j++) {
            const reviewId = (publication.finalReviewIds as readonly unknown[])[j];
            const review = reviewById.get(reviewId as string);
            const owner = review && versionOwnerById.get(review.versionId);
            if (!review || !owner || owner.roundId !== publication.roundId)
                return fail(`$.publications[${i}].finalReviewIds[${j}]`);
        }
    }
    return undefined;
}

function validateDiscussionRecords(parsedState: MeetingState): string | undefined {
    const identityIds = ids(parsedState.identities);
    const agendaIds = ids(parsedState.agenda);
    const publicationIds = ids(parsedState.publications);
    const publishedVersionIds = new Set(
        parsedState.publications.flatMap((item) => item.finalVersionIds)
    );
    const messages = parsedState.messages;
    const messageIds = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
        const r = messages[i];
        const path = `$.messages[${i}]`;
        messageIds.add(r.id as string);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        if (!ref(r.publicationId, publicationIds)) return fail(`${path}.publicationId`);
    }
    const proposals = parsedState.proposals;
    const proposalIds = new Set<string>();
    for (let i = 0; i < proposals.length; i++) {
        const r = proposals[i];
        const path = `$.proposals[${i}]`;
        proposalIds.add(r.id as string);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        if (!ref(r.agendaId, agendaIds)) return fail(`${path}.agendaId`);
        const evidencePath = checkRefs(r.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (evidencePath) return fail(evidencePath);
    }
    const positions = parsedState.positions;
    const positionById = indexById(positions);
    const positionIds = new Set<string>();
    for (let i = 0; i < positions.length; i++) {
        const r = positions[i];
        const path = `$.positions[${i}]`;
        positionIds.add(r.id as string);
        if (!ref(r.proposalRevisionId, proposalIds)) return fail(`${path}.proposalRevisionId`);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        const evidencePath = checkRefs(r.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (evidencePath) return fail(evidencePath);
    }
    const decisionCandidates = parsedState.decisionCandidates;
    const decisionCandidateIds = new Set<string>();
    for (let i = 0; i < decisionCandidates.length; i++) {
        const r = decisionCandidates[i];
        const path = `$.decisionCandidates[${i}]`;
        decisionCandidateIds.add(r.id as string);
        if (!ref(r.proposalRevisionId, proposalIds)) return fail(`${path}.proposalRevisionId`);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        const evidencePath = checkRefs(r.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (evidencePath) return fail(evidencePath);
        for (let j = 0; j < r.positionIds.length; j++) {
            const position = positionById.get(r.positionIds[j]);
            if (!position || position.proposalRevisionId !== r.proposalRevisionId)
                return fail(`${path}.positionIds[${j}]`);
        }
    }
    return undefined;
}

function validateDecisions(parsedState: MeetingState): string | undefined {
    const identityIds = ids(parsedState.identities);
    const proposals = parsedState.proposals;
    const proposalIds = ids(proposals);
    const decisionCandidates = parsedState.decisionCandidates;
    const decisionCandidateIds = ids(decisionCandidates);
    const publishedVersionIds = new Set(
        parsedState.publications.flatMap((item) => item.finalVersionIds)
    );
    const decisions = parsedState.decisions;
    const decisionIds = new Set<string>();
    for (let i = 0; i < decisions.length; i++) {
        const r = decisions[i];
        const path = `$.decisions[${i}]`;
        decisionIds.add(r.id as string);
        if (!ref(r.candidateId, decisionCandidateIds)) return fail(`${path}.candidateId`);
        if (!ref(r.proposalRevisionId, proposalIds)) return fail(`${path}.proposalRevisionId`);
        if (!ref(r.actorId, identityIds)) return fail(`${path}.actorId`);
        const evidencePath = checkRefs(r.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (evidencePath) return fail(evidencePath);
        if (ownUndefined(r, "replacesDecisionId", `${path}.replacesDecisionId`))
            return fail(`${path}.replacesDecisionId`);
        if (r.replacesDecisionId !== undefined && !decisionIds.has(r.replacesDecisionId as string))
            return fail(`${path}.replacesDecisionId`);
        if (r.replacesDecisionId === r.id) return fail(`${path}.replacesDecisionId`);
    }
    const acceptedByRevision = new Set<string>();
    const decidedCandidates = new Set<string>();
    const replacementCounts = new Map<string, number>();
    for (let i = 0; i < decisions.length; i++) {
        const d = decisions[i];
        if (decidedCandidates.has(d.candidateId)) return fail(`$.decisions[${i}].candidateId`);
        decidedCandidates.add(d.candidateId);
        if (d.status === "accepted") {
            if (acceptedByRevision.has(d.proposalRevisionId))
                return fail(`$.decisions[${i}].proposalRevisionId`);
            acceptedByRevision.add(d.proposalRevisionId);
        }
        if (d.replacesDecisionId !== undefined) {
            const previous = decisions.findIndex((x) => x.id === d.replacesDecisionId);
            if (previous < 0 || previous >= i || decisions[previous].status !== "superseded")
                return fail(`$.decisions[${i}].replacesDecisionId`);
            const previousRevision = proposals.find(
                (revision) => revision.id === decisions[previous].proposalRevisionId
            );
            const replacementRevision = proposals.find(
                (revision) => revision.id === d.proposalRevisionId
            );
            if (
                !previousRevision ||
                !replacementRevision ||
                previousRevision.proposalId !== replacementRevision.proposalId
            )
                return fail(`$.decisions[${i}].replacesDecisionId`);
            replacementCounts.set(
                d.replacesDecisionId,
                (replacementCounts.get(d.replacesDecisionId) ?? 0) + 1
            );
        }
    }
    for (let i = 0; i < decisions.length; i++)
        if (decisions[i].status === "superseded" && replacementCounts.get(decisions[i].id) !== 1)
            return fail(`$.decisions[${i}].status`);
    return undefined;
}

function validateSequencesAndBaselines(parsedState: MeetingState): string | undefined {
    const rounds = parsedState.rounds;
    const contributions = parsedState.contributions;
    const contributionIds = ids(contributions);
    const packageIds = ids(parsedState.evidencePackages);
    const publications = parsedState.publications;
    const publicationIds = ids(publications);
    const messages = parsedState.messages;
    const reviews = parsedState.reviews;
    const roundById = indexById(rounds);
    const versionOwnerById = indexVersionOwners(parsedState);
    const proposals = parsedState.proposals;
    const decisionCandidates = parsedState.decisionCandidates;
    const decisionCandidateById = indexById(decisionCandidates);
    const decisions = parsedState.decisions;
    for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i] as unknown as RecordValue;
        const path = `$.rounds[${i}]`;
        for (let j = 0; j < (r.contributionIds as readonly unknown[]).length; j++)
            if (!ref((r.contributionIds as readonly unknown[])[j], contributionIds))
                return fail(`${path}.contributionIds[${j}]`);
        for (let j = 0; j < (r.publicBaselinePublicationIds as readonly unknown[]).length; j++)
            if (!ref((r.publicBaselinePublicationIds as readonly unknown[])[j], publicationIds))
                return fail(`${path}.publicBaselinePublicationIds[${j}]`);
    }
    for (let i = 0; i < contributions.length; i++) {
        const r = contributions[i] as unknown as RecordValue;
        const path = `$.contributions[${i}]`;
        if (r.packageId !== undefined && !packageIds.has(r.packageId as string))
            return fail(`${path}.packageId`);
    }
    for (let i = 0; i < publications.length; i++) {
        const r = publications[i] as unknown as RecordValue;
        const path = `$.publications[${i}]`;
        if (
            i > 0 &&
            ((publications[i - 1] as unknown as RecordValue).seq as number) >= (r.seq as number)
        )
            return fail(`${path}.seq`);
    }
    for (let i = 0; i < messages.length; i++) {
        const r = messages[i] as unknown as RecordValue;
        const path = `$.messages[${i}]`;
        if (
            i > 0 &&
            ((messages[i - 1] as unknown as RecordValue).seq as number) >= (r.seq as number)
        )
            return fail(`${path}.seq`);
    }
    for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i] as unknown as RecordValue;
        const path = `$.reviews[${i}]`;
        const ownerPackage = versionOwnerById.get(r.versionId as string);
        const round = ownerPackage && roundById.get(ownerPackage.roundId);
        if (round) {
            const baseline = r.baselinePublicationIds as readonly unknown[];
            if (JSON.stringify(baseline) !== JSON.stringify(round.publicBaselinePublicationIds))
                return fail(`${path}.baselinePublicationIds`);
        }
    }
    const proposalGroups = new Map<string, { ordinal: number; id: string }>();
    for (let i = 0; i < proposals.length; i++) {
        const r = proposals[i] as unknown as RecordValue;
        const path = `$.proposals[${i}]`;
        const previous = proposalGroups.get(r.proposalId as string);
        if ((r.ordinal as number) !== (previous?.ordinal ?? 0) + 1) return fail(`${path}.ordinal`);
        proposalGroups.set(r.proposalId as string, {
            ordinal: r.ordinal as number,
            id: r.id as string
        });
        if ((r.ordinal as number) === 1 && r.supersedesRevisionId !== undefined)
            return fail(`${path}.supersedesRevisionId`);
        if ((r.ordinal as number) > 1 && r.supersedesRevisionId !== previous?.id)
            return fail(`${path}.supersedesRevisionId`);
    }
    for (let i = 0; i < decisions.length; i++) {
        const r = decisions[i];
        const candidate = decisionCandidateById.get(r.candidateId);
        if (candidate && r.proposalRevisionId !== candidate.proposalRevisionId)
            return fail(`$.decisions[${i}].proposalRevisionId`);
        if (candidate && r.actorId !== candidate.actorId) return fail(`$.decisions[${i}].actorId`);
        if (candidate && JSON.stringify(r.evidenceIds) !== JSON.stringify(candidate.evidenceIds))
            return fail(`$.decisions[${i}].evidenceIds`);
        if (candidate && JSON.stringify(r.positionIds) !== JSON.stringify(candidate.positionIds))
            return fail(`$.decisions[${i}].positionIds`);
    }
    return undefined;
}

export function validateMeetingStateReferences(parsedState: MeetingState): string | undefined {
    return (
        validateAgendaRoundsAndContributions(parsedState) ??
        validateEvidencePackages(parsedState) ??
        validateRegistrationsAndReviews(parsedState) ??
        validateDeliveriesAndPublications(parsedState) ??
        validateDiscussionRecords(parsedState) ??
        validateDecisions(parsedState) ??
        validateSequencesAndBaselines(parsedState)
    );
}
