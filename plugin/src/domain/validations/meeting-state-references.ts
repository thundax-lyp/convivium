import type { MeetingState } from "@/domain/index.ts";
import {
    checkRefs,
    ids,
    indexById,
    ownUndefined,
    ref,
    type RecordValue,
    indexVersionOwners
} from "./meeting-state-helpers.ts";

const fail = (path: string) => path;

const validateAgendaRoundsAndContributions = (parsedState: MeetingState): string | undefined => {
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
            if (p) {
                return fail(p);
            }
        }
        if (ownUndefined(item, "ownerId", `${path}.ownerId`)) {
            return fail(`${path}.ownerId`);
        }
    }
    const activeAgendaIndexes = parsedState.agenda.flatMap((item, index) =>
        item.status === "active" ? [index] : []
    );
    if (activeAgendaIndexes.length > 1) {
        return fail(`$.agenda[${activeAgendaIndexes[1]}].status`);
    }
    if (
        !(["terminal", "archiving", "archived"] as readonly string[]).includes(
            lifecycle.status as string
        ) &&
        activeAgendaIndexes.length !== 1
    ) {
        return fail("$.agenda");
    }
    for (let i = 0; i < parsedState.identities.length; i++) {
        const item = parsedState.identities[i];
        for (const key of ["agendaResponsibilityIds"] as const) {
            const p = checkRefs(item[key], agendaIds, `$.identities[${i}].${key}`);
            if (p) {
                return fail(p);
            }
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
        if (!ref(r.agendaId, agendaIds)) {
            return fail(`${path}.agendaId`);
        }
        const invalidInvite = checkRefs(
            r.invitedContributorIds,
            identityIds,
            `${path}.invitedContributorIds`
        );
        if (invalidInvite) {
            return fail(invalidInvite);
        }
        const plan = managerPlanById.get(r.planId);
        if (
            !plan ||
            plan.agendaId !== r.agendaId ||
            plan.kind !== "open_round" ||
            plan.status !== "completed" ||
            plan.roundGoal === undefined ||
            plan.roundGoal.question !== r.roundGoal.question ||
            plan.roundGoal.evidenceGap !== r.roundGoal.evidenceGap ||
            plan.roundGoal.expectedOutput !== r.roundGoal.expectedOutput ||
            JSON.stringify(plan.roundGoal.researchObjectIds) !==
                JSON.stringify(r.roundGoal.researchObjectIds)
        ) {
            return fail(`${path}.planId`);
        }
        if (r.status === "open") {
            const agenda = agendaById.get(r.agendaId as string);
            if (!agenda || agenda.status !== "active") {
                return fail(`${path}.agendaId`);
            }
        }
    }
    const pendingHandKeys = new Set<string>();
    for (let i = 0; i < parsedState.pendingHandRaises.length; i++) {
        const hand = parsedState.pendingHandRaises[i];
        const path = `$.pendingHandRaises[${i}]`;
        const key = `${hand.roundId}\0${hand.contributorId}`;
        if (pendingHandKeys.has(key)) {
            return fail(`${path}.contributorId`);
        }
        pendingHandKeys.add(key);
        if (!ref(hand.roundId, roundIds)) {
            return fail(`${path}.roundId`);
        }
        if (!ref(hand.contributorId, identityIds)) {
            return fail(`${path}.contributorId`);
        }
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
        if (contributorRounds.has(contributorRound)) {
            return fail(`${path}.roundId`);
        }
        contributorRounds.add(contributorRound);
        if (!ref(r.roundId, roundIds)) {
            return fail(`${path}.roundId`);
        }
        if (!ref(r.contributorId, identityIds)) {
            return fail(`${path}.contributorId`);
        }
        if (ownUndefined(r, "packageId", `${path}.packageId`)) {
            return fail(`${path}.packageId`);
        }
    }
    return undefined;
};

const validateEvidencePackages = (parsedState: MeetingState): string | undefined => {
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
        if (!ref(r.roundId, roundIds)) {
            return fail(`${path}.roundId`);
        }
        if (!ref(r.contributionId, contributionIds)) {
            return fail(`${path}.contributionId`);
        }
        if (!ref(r.authorId, identityIds)) {
            return fail(`${path}.authorId`);
        }
        if (!ref(r.agendaId, agendaIds)) {
            return fail(`${path}.agendaId`);
        }
        const contribution = contributionById.get(r.contributionId as string);
        const round = roundById.get(r.roundId as string);
        if (!contribution || contribution.roundId !== r.roundId) {
            return fail(`${path}.roundId`);
        }
        if (!round || round.agendaId !== r.agendaId) {
            return fail(`${path}.agendaId`);
        }
        if (!contribution || contribution.contributorId !== r.authorId) {
            return fail(`${path}.authorId`);
        }
        packageIds.add(r.id as string);
        const packageVersionIds = new Set<string>();
        for (let j = 0; j < r.versions.length; j++) {
            const v = r.versions[j];
            const vp = `${path}.versions[${j}]`;
            const vr = v;
            if (vr.ordinal !== j + 1) {
                return fail(`${vp}.ordinal`);
            }
            const materialIds = new Set<string>();
            for (const material of vr.materials) {
                materialIds.add(material.id);
            }
            for (let k = 0; k < vr.claims.length; k++) {
                const claim = vr.claims[k];
                for (let m = 0; m < claim.materialIds.length; m++) {
                    if (!materialIds.has(claim.materialIds[m])) {
                        return fail(`${vp}.claims[${k}].materialIds[${m}]`);
                    }
                }
            }
            if (versionIds.has(vr.id)) {
                return fail(`${vp}.id`);
            }
            versionIds.add(vr.id);
            packageVersionIds.add(vr.id);
            versionOwnerById.set(vr.id, item);
        }
        if (!packageVersionIds.has(r.currentVersionId as string)) {
            return fail(`${path}.currentVersionId`);
        }
    }
    for (let i = 0; i < packages.length; i++) {
        const packageValue = packages[i] as unknown as RecordValue;
        if (!ref(packageValue.currentVersionId, versionIds)) {
            return fail(`$.evidencePackages[${i}].currentVersionId`);
        }
        const contribution = contributionById.get(packageValue.contributionId as string);
        if (!contribution || contribution.packageId !== packageValue.id) {
            return fail(`$.evidencePackages[${i}].contributionId`);
        }
    }
    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i] as unknown as RecordValue;
        for (let j = 0; j < (round.contributionIds as readonly unknown[]).length; j++) {
            const contributionId = (round.contributionIds as readonly unknown[])[j];
            const contribution = contributionById.get(contributionId as string);
            if (!contribution || contribution.roundId !== round.id) {
                return fail(`$.rounds[${i}].contributionIds[${j}]`);
            }
        }
    }
    for (let i = 0; i < contributions.length; i++) {
        const contribution = contributions[i] as unknown as RecordValue;
        const round = roundById.get(contribution.roundId as string);
        if (!round || !(round.contributionIds as readonly unknown[]).includes(contribution.id)) {
            return fail(`$.contributions[${i}].roundId`);
        }
    }
    return undefined;
};

const validateRegistrationsAndReviews = (parsedState: MeetingState): string | undefined => {
    const identityById = indexById(parsedState.identities);
    const identityIds = new Set(identityById.keys());
    const roundById = indexById(parsedState.rounds);
    const registrations = parsedState.registrations;
    const reviews = parsedState.reviews;
    const versionOwnerById = indexVersionOwners(parsedState);
    const versionIds = new Set(versionOwnerById.keys());
    for (let i = 0; i < registrations.length; i++) {
        const r = registrations[i];
        const path = `$.registrations[${i}]`;
        if (!ref(r.versionId, versionIds)) {
            return fail(`${path}.versionId`);
        }
    }
    const reviewIds = new Set<string>();
    for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i];
        const path = `$.reviews[${i}]`;
        reviewIds.add(r.id as string);
        if (!ref(r.versionId, versionIds)) {
            return fail(`${path}.versionId`);
        }
        if (!ref(r.reviewerId, identityIds)) {
            return fail(`${path}.reviewerId`);
        }
        const reviewer = identityById.get(r.reviewerId as string);
        if (!reviewer || !reviewer.roles.includes("evidence_reviewer")) {
            return fail(`${path}.reviewerId`);
        }
        const owner = versionOwnerById.get(r.versionId);
        if (owner?.authorId === r.reviewerId) {
            return fail(`${path}.reviewerId`);
        }
        const version = owner?.versions.find((candidate) => candidate.id === r.versionId);
        if (version?.status !== "validated") {
            return fail(`${path}.versionId`);
        }
    }
    for (let i = 0; i < parsedState.evidencePackages.length; i++) {
        const pkg = parsedState.evidencePackages[i];
        for (let j = 0; j < pkg.versions.length; j++) {
            const version = pkg.versions[j];
            const path = `$.evidencePackages[${i}].versions[${j}].status`;
            if (
                (version.status === "validated") !==
                reviews.some((review) => review.versionId === version.id)
            ) {
                return fail(path);
            }
            if (
                (version.status === "validating") !==
                parsedState.reviewClaims.some((claim) => claim.versionId === version.id)
            ) {
                return fail(path);
            }
            if (version.status === "validation_failed" && version.failureCount === 0) {
                return fail(path);
            }
        }
    }
    const claimedVersionIds = new Set<string>();
    for (let i = 0; i < parsedState.reviewClaims.length; i++) {
        const claim = parsedState.reviewClaims[i];
        const path = `$.reviewClaims[${i}]`;
        if (claimedVersionIds.has(claim.versionId)) {
            return fail(`${path}.versionId`);
        }
        claimedVersionIds.add(claim.versionId);
        const round = roundById.get(claim.roundId);
        if (!round || round.status !== "open") {
            return fail(`${path}.roundId`);
        }
        if (claim.reviewerId !== parsedState.evidenceReviewerId) {
            return fail(`${path}.reviewerId`);
        }
        const owner = versionOwnerById.get(claim.versionId);
        const version = owner?.versions.find((candidate) => candidate.id === claim.versionId);
        if (
            !owner ||
            owner.roundId !== claim.roundId ||
            owner.currentVersionId !== claim.versionId ||
            version?.status !== "validating" ||
            !registrations.some(
                (registration) =>
                    registration.versionId === claim.versionId && registration.status === "complete"
            ) ||
            reviews.some((review) => review.versionId === claim.versionId)
        ) {
            return fail(`${path}.versionId`);
        }
    }
    return undefined;
};

const validateDeliveriesAndPublications = (parsedState: MeetingState): string | undefined => {
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
        if (!ref(r.reviewId, reviewIds)) {
            return fail(`${path}.reviewId`);
        }
        if (!ref(r.authorId, identityIds)) {
            return fail(`${path}.authorId`);
        }
        const review = reviewById.get(r.reviewId);
        const ownerPackage = review && versionOwnerById.get(review.versionId);
        if (ownerPackage && ownerPackage.authorId !== r.authorId) {
            return fail(`${path}.authorId`);
        }
    }
    const publications = parsedState.publications;
    const contributionById = indexById(parsedState.contributions);
    const publicationById = indexById(publications);
    const publicationIds = new Set<string>();
    for (let i = 0; i < publications.length; i++) {
        const r = publications[i];
        const path = `$.publications[${i}]`;
        publicationIds.add(r.id as string);
        const round = roundById.get(r.roundId as string);
        if (!round || round.status !== "published" || round.publicationId !== r.id) {
            return fail(`${path}.roundId`);
        }
        const expectedFailures = round.contributionIds.flatMap((contributionId) => {
            const contribution = contributionById.get(contributionId);
            return contribution?.failure === undefined
                ? []
                : [{ contributionId, failure: contribution.failure }];
        });
        if (
            (r.contributionFailures === undefined && expectedFailures.length > 0) ||
            (r.contributionFailures !== undefined &&
                JSON.stringify(r.contributionFailures) !== JSON.stringify(expectedFailures))
        ) {
            return fail(`${path}.contributionFailures`);
        }
        for (const [key, ids] of [
            ["finalVersionIds", versionIds],
            ["finalReviewIds", reviewIds]
        ] as const) {
            const p = checkRefs(r[key], ids, `${path}.${key}`);
            if (p) {
                return fail(p);
            }
        }
    }
    for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i] as unknown as RecordValue;
        if (r.status === "published") {
            const publication = publicationById.get(r.publicationId as string);
            if (!publication || publication.roundId !== r.id) {
                return fail(`$.rounds[${i}].publicationId`);
            }
        }
    }
    const publishedVersionIds = new Set<string>();
    for (let i = 0; i < publications.length; i++) {
        const publication = publications[i] as unknown as RecordValue;
        const round = roundById.get(publication.roundId as string);
        for (let j = 0; j < (publication.finalVersionIds as readonly unknown[]).length; j++) {
            const versionId = (publication.finalVersionIds as readonly unknown[])[j];
            const owner = versionOwnerById.get(versionId as string);
            if (!owner || owner.roundId !== publication.roundId || round === undefined) {
                return fail(`$.publications[${i}].finalVersionIds[${j}]`);
            }
            publishedVersionIds.add(versionId as string);
        }
        for (let j = 0; j < (publication.finalReviewIds as readonly unknown[]).length; j++) {
            const reviewId = (publication.finalReviewIds as readonly unknown[])[j];
            const review = reviewById.get(reviewId as string);
            const owner = review && versionOwnerById.get(review.versionId);
            if (!review || !owner || owner.roundId !== publication.roundId) {
                return fail(`$.publications[${i}].finalReviewIds[${j}]`);
            }
        }
    }
    return undefined;
};

const validateSequencesAndBaselines = (parsedState: MeetingState): string | undefined => {
    const rounds = parsedState.rounds;
    const contributions = parsedState.contributions;
    const contributionIds = ids(contributions);
    const packageIds = ids(parsedState.evidencePackages);
    const publications = parsedState.publications;
    const publicationIds = ids(publications);
    const messages = parsedState.messages;
    const identityIds = ids(parsedState.identities);
    const agendaIds = ids(parsedState.agenda);
    const reviews = parsedState.reviews;
    const roundById = indexById(rounds);
    const versionOwnerById = indexVersionOwners(parsedState);
    for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i] as unknown as RecordValue;
        const path = `$.rounds[${i}]`;
        for (let j = 0; j < (r.contributionIds as readonly unknown[]).length; j++) {
            if (!ref((r.contributionIds as readonly unknown[])[j], contributionIds)) {
                return fail(`${path}.contributionIds[${j}]`);
            }
        }
        for (let j = 0; j < (r.publicBaselinePublicationIds as readonly unknown[]).length; j++) {
            if (!ref((r.publicBaselinePublicationIds as readonly unknown[])[j], publicationIds)) {
                return fail(`${path}.publicBaselinePublicationIds[${j}]`);
            }
        }
    }
    for (let i = 0; i < contributions.length; i++) {
        const r = contributions[i] as unknown as RecordValue;
        const path = `$.contributions[${i}]`;
        if (r.packageId !== undefined && !packageIds.has(r.packageId as string)) {
            return fail(`${path}.packageId`);
        }
    }
    for (let i = 0; i < publications.length; i++) {
        const r = publications[i] as unknown as RecordValue;
        const path = `$.publications[${i}]`;
        if (
            i > 0 &&
            ((publications[i - 1] as unknown as RecordValue).seq as number) >= (r.seq as number)
        ) {
            return fail(`${path}.seq`);
        }
    }
    for (let i = 0; i < messages.length; i++) {
        const r = messages[i] as unknown as RecordValue;
        const path = `$.messages[${i}]`;
        for (const [key, targets] of [
            ["actorId", identityIds],
            ["agendaId", agendaIds],
            ["publicationId", publicationIds]
        ] as const) {
            if (!ref(r[key], targets)) {
                return fail(`${path}.${key}`);
            }
        }
        if (
            i > 0 &&
            ((messages[i - 1] as unknown as RecordValue).seq as number) >= (r.seq as number)
        ) {
            return fail(`${path}.seq`);
        }
    }
    for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i] as unknown as RecordValue;
        const path = `$.reviews[${i}]`;
        const ownerPackage = versionOwnerById.get(r.versionId as string);
        const round = ownerPackage && roundById.get(ownerPackage.roundId);
        if (round) {
            const baseline = r.baselinePublicationIds as readonly unknown[];
            if (JSON.stringify(baseline) !== JSON.stringify(round.publicBaselinePublicationIds)) {
                return fail(`${path}.baselinePublicationIds`);
            }
        }
    }
    return undefined;
};

export const validateMeetingStateReferences = (parsedState: MeetingState): string | undefined => {
    return (
        validateAgendaRoundsAndContributions(parsedState) ??
        validateEvidencePackages(parsedState) ??
        validateRegistrationsAndReviews(parsedState) ??
        validateDeliveriesAndPublications(parsedState) ??
        validateSequencesAndBaselines(parsedState)
    );
};
