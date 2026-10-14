import { captainActorIdFor } from "@/domain/index.ts";
import type { MeetingState } from "@/domain/index.ts";
import {
    checkRefs,
    ids,
    indexById,
    own,
    ownUndefined,
    ref,
    type RecordValue,
    indexVersionOwners
} from "./meeting-state-helpers.ts";

const fail = (path: string) => path;

const unsatisfiedIds = (targets: readonly { id: string; status: string }[]): Set<string> => {
    return new Set(targets.filter(({ status }) => status !== "satisfied").map(({ id }) => id));
};

const validateQuestions = (parsedState: MeetingState): string | undefined => {
    const { objective } = parsedState;
    const identityIds = ids(parsedState.identities);
    const agendaIds = ids(parsedState.agenda);
    const messageIds = ids(parsedState.messages);
    const outputIds = ids(objective.requiredOutputs);
    const criterionIds = ids(objective.acceptanceCriteria);
    const constraintIds = ids(objective.hardConstraints);
    const unsatisfiedOutputIds = unsatisfiedIds(objective.requiredOutputs);
    const unsatisfiedCriterionIds = unsatisfiedIds(objective.acceptanceCriteria);
    const unsatisfiedConstraintIds = unsatisfiedIds(objective.hardConstraints);
    const candidates = parsedState.agendaCandidates;
    for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i];
        const path = `$.agendaCandidates[${i}]`;
        if (ownUndefined(item, "sourceMessageId", `${path}.sourceMessageId`)) {
            return fail(`${path}.sourceMessageId`);
        }
        if (item.sourceMessageId !== undefined && !ref(item.sourceMessageId, messageIds)) {
            return fail(`${path}.sourceMessageId`);
        }
    }
    const questions = parsedState.questions;
    const questionIds = new Set<string>();
    for (let i = 0; i < questions.length; i++) {
        const item = questions[i];
        const path = `$.questions[${i}]`;
        questionIds.add(item.id);
        if (!ref(item.actorId, identityIds)) {
            return fail(`${path}.actorId`);
        }
        if (!ref(item.agendaId, agendaIds)) {
            return fail(`${path}.agendaId`);
        }
        for (const [key, targets] of [
            ["affectedOutputIds", outputIds],
            ["affectedCriterionIds", criterionIds],
            ["affectedConstraintIds", constraintIds]
        ] as const) {
            const p = checkRefs(item[key], targets, `${path}.${key}`);
            if (p) {
                return fail(p);
            }
        }
        const blockingQualified =
            item.affectedOutputIds.some((targetId) => unsatisfiedOutputIds.has(targetId)) ||
            item.affectedCriterionIds.some((targetId) => unsatisfiedCriterionIds.has(targetId)) ||
            item.affectedConstraintIds.some((targetId) => unsatisfiedConstraintIds.has(targetId));
        if (item.blocking && !blockingQualified) {
            return fail(`${path}.blocking`);
        }
        if (["answered", "withdrawn"].includes(item.status as string) && item.blocking) {
            return fail(`${path}.blocking`);
        }
    }
    return undefined;
};

const validateIssues = (parsedState: MeetingState): string | undefined => {
    const { objective } = parsedState;
    const identityIds = ids(parsedState.identities);
    const agendaIds = ids(parsedState.agenda);
    const outputIds = ids(objective.requiredOutputs);
    const criterionIds = ids(objective.acceptanceCriteria);
    const constraintIds = ids(objective.hardConstraints);
    const unsatisfiedOutputIds = unsatisfiedIds(objective.requiredOutputs);
    const unsatisfiedCriterionIds = unsatisfiedIds(objective.acceptanceCriteria);
    const unsatisfiedConstraintIds = unsatisfiedIds(objective.hardConstraints);
    const riskDispositions = parsedState.riskDispositions;
    const issues = parsedState.issues;
    const issueIds = new Set<string>();
    for (let i = 0; i < issues.length; i++) {
        const item = issues[i];
        const path = `$.issues[${i}]`;
        issueIds.add(item.id);
        if (!ref(item.actorId, identityIds)) {
            return fail(`${path}.actorId`);
        }
        if (!agendaIds.has(item.agendaId as string)) {
            return fail(`${path}.agendaId`);
        }
        for (const key of [
            "affectedOutputIds",
            "affectedCriterionIds",
            "affectedConstraintIds"
        ] as const) {
            const targets =
                key === "affectedOutputIds"
                    ? outputIds
                    : key === "affectedCriterionIds"
                      ? criterionIds
                      : constraintIds;
            const p = checkRefs(item[key], targets, `${path}.${key}`);
            if (p) {
                return fail(p);
            }
        }
        if (
            item.classification === "accepted_risk" &&
            !riskDispositions.some(
                (disposition) => disposition.issueId === item.id && disposition.action === "accept"
            )
        ) {
            return fail(`${path}.classification`);
        }
        if (
            item.status === "open" &&
            (item.classification === "blocking" ? item.blocking !== true : item.blocking !== false)
        ) {
            return fail(`${path}.blocking`);
        }
        if (
            item.riskLevel === "high" &&
            (item.status === "open" || item.status === "deferred") &&
            item.classification !== "accepted_risk" &&
            item.blocking !== true
        ) {
            return fail(`${path}.blocking`);
        }
        if (["resolved", "out_of_scope"].includes(item.status as string) && item.blocking) {
            return fail(`${path}.blocking`);
        }
        if (item.blocking && item.riskLevel !== "high") {
            const outputQualified = item.affectedOutputIds.some((id) =>
                unsatisfiedOutputIds.has(id)
            );
            const criterionQualified = item.affectedCriterionIds.some((id) =>
                unsatisfiedCriterionIds.has(id)
            );
            const constraintQualified = item.affectedConstraintIds.some((id) =>
                unsatisfiedConstraintIds.has(id)
            );
            if (!outputQualified && !criterionQualified && !constraintQualified) {
                return fail(`${path}.blocking`);
            }
        }
        const lastDisposition = [...riskDispositions]
            .reverse()
            .find((disposition) => disposition.issueId === item.id);
        if (lastDisposition && (item.status === "open" || item.status === "deferred")) {
            const expectedAccepted = lastDisposition.action === "accept";
            if (
                expectedAccepted !== (item.classification === "accepted_risk") ||
                expectedAccepted === item.blocking
            ) {
                return fail(`${path}.classification`);
            }
        }
    }
    return undefined;
};

const validatePlansAndRisk = (parsedState: MeetingState): string | undefined => {
    const identityById = indexById(parsedState.identities);
    const identityIds = new Set(identityById.keys());
    const agendaIds = ids(parsedState.agenda);
    const publications = parsedState.publications;
    const publicationIds = ids(publications);
    const publishedVersionIds = new Set(publications.flatMap((item) => item.finalVersionIds));
    const roundById = indexById(parsedState.rounds);
    const riskDispositions = parsedState.riskDispositions;
    const plans = parsedState.managerPlans;
    const activePlanAgendas = new Set<string>();
    for (let i = 0; i < plans.length; i++) {
        const item = plans[i];
        const path = `$.managerPlans[${i}]`;
        if (!ref(item.agendaId, agendaIds)) {
            return fail(`${path}.agendaId`);
        }
        if (!ref(item.managerId, identityIds)) {
            return fail(`${path}.managerId`);
        }
        const manager = identityById.get(item.managerId);
        if (!manager || !manager.roles.includes("manager")) {
            return fail(`${path}.managerId`);
        }
        if (item.status === "active") {
            if (activePlanAgendas.has(item.agendaId as string)) {
                return fail(`${path}.agendaId`);
            }
            activePlanAgendas.add(item.agendaId as string);
        }
        if (ownUndefined(item, "blockingReason", `${path}.blockingReason`)) {
            return fail(`${path}.blockingReason`);
        }
        if (ownUndefined(item, "basedOnPublicationId", `${path}.basedOnPublicationId`)) {
            return fail(`${path}.basedOnPublicationId`);
        }
        if (
            item.basedOnPublicationId !== undefined &&
            !ref(item.basedOnPublicationId, publicationIds)
        ) {
            return fail(`${path}.basedOnPublicationId`);
        }
        if (item.basedOnPublicationId !== undefined) {
            const publication = publications.find(({ id }) => id === item.basedOnPublicationId);
            const round = publication && roundById.get(publication.roundId);
            if (!round || round.agendaId !== item.agendaId) {
                return fail(`${path}.basedOnPublicationId`);
            }
        }
    }
    const issueIdsForRefs = ids(parsedState.issues);
    for (let i = 0; i < riskDispositions.length; i++) {
        const item = riskDispositions[i];
        const path = `$.riskDispositions[${i}]`;
        if (!ref(item.issueId, issueIdsForRefs)) {
            return fail(`${path}.issueId`);
        }
        const p = checkRefs(item.evidenceIds, publishedVersionIds, `${path}.evidenceIds`);
        if (p) {
            return fail(p);
        }
    }
    return undefined;
};

const validateCompletionFacts = (parsedState: MeetingState): string | undefined => {
    const publishedVersionIds = new Set(
        parsedState.publications.flatMap((item) => item.finalVersionIds)
    );
    const outputIds = ids(parsedState.objective.requiredOutputs);
    const criterionIds = ids(parsedState.objective.acceptanceCriteria);
    const completionFactIds = ids(parsedState.completionFacts);
    const facts = parsedState.completionFacts;
    const supersededFactIds = new Set<string>();
    for (let i = 0; i < facts.length; i++) {
        const item = facts[i];
        const path = `$.completionFacts[${i}]`;
        if (!ref(item.outputId, outputIds)) {
            return fail(`${path}.outputId`);
        }
        if (item.criterionId !== undefined && !ref(item.criterionId, criterionIds)) {
            return fail(`${path}.criterionId`);
        }
        if (item.actorId !== captainActorIdFor(parsedState.id)) {
            return fail(`${path}.actorId`);
        }
        for (const [key, values] of [["evidenceIds", publishedVersionIds]] as const) {
            const p = checkRefs(item[key], values, `${path}.${key}`);
            if (p) {
                return fail(p);
            }
        }
        if (
            item.supersedesFactId !== undefined &&
            !completionFactIds.has(item.supersedesFactId as string)
        ) {
            return fail(`${path}.supersedesFactId`);
        }
        if (item.supersedesFactId !== undefined) {
            const previous = facts.findIndex((x) => x.id === item.supersedesFactId);
            if (previous < 0 || previous >= i || facts[previous].status !== "superseded") {
                return fail(`${path}.supersedesFactId`);
            }
            if (supersededFactIds.has(item.supersedesFactId as string)) {
                return fail(`${path}.supersedesFactId`);
            }
            supersededFactIds.add(item.supersedesFactId as string);
        }
    }
    return undefined;
};

const validateEffectiveCompletion = (parsedState: MeetingState): string | undefined => {
    const identityById = indexById(parsedState.identities);
    const publications = parsedState.publications;
    const reviews = parsedState.reviews;
    const deliveries = parsedState.reviewDeliveries;
    const versionOwnerById = indexVersionOwners(parsedState);
    const facts = parsedState.completionFacts;
    const effectiveFact = (fact: (typeof facts)[number]) => {
        if (fact.status !== "active") {
            return false;
        }
        return fact.evidenceIds.every((versionId) => {
            const owner = [...versionOwnerById.entries()].find(([, packageValue]) =>
                packageValue.versions.some((v) => v.id === versionId)
            );
            if (!owner) {
                return false;
            }
            const reviewer = identityById.get(parsedState.evidenceReviewerId as string);
            if (!reviewer || reviewer.id === owner[1].authorId) {
                return false;
            }
            const matchingReviews = reviews.filter(
                (candidate) =>
                    candidate.versionId === versionId && candidate.reviewerId === reviewer.id
            );
            return (
                matchingReviews.length === 1 &&
                publications.some(
                    (publication) =>
                        publication.finalVersionIds.includes(versionId) &&
                        publication.finalReviewIds.includes(matchingReviews[0].id)
                ) &&
                deliveries.some(
                    (delivery) =>
                        delivery.reviewId === matchingReviews[0].id && delivery.status === "sent"
                )
            );
        });
    };
    const effectiveFacts = facts.filter(effectiveFact);
    for (const [key, targets] of [
        ["requiredOutputs", parsedState.objective.requiredOutputs],
        ["acceptanceCriteria", parsedState.objective.acceptanceCriteria]
    ] as const) {
        for (let i = 0; i < targets.length; i++) {
            const satisfied = effectiveFacts.some((fact) =>
                key === "requiredOutputs"
                    ? fact.outputId === targets[i].id
                    : fact.criterionId === targets[i].id
            );
            if ((targets[i].status === "satisfied") !== satisfied) {
                return fail(`$.objective.${key}[${i}].status`);
            }
        }
    }
    return undefined;
};

const validateTerminalRecords = (
    value: RecordValue,
    parsedState: MeetingState
): string | undefined => {
    const { lifecycle } = parsedState;
    const completionFactIds = ids(parsedState.completionFacts);
    const questionIds = ids(parsedState.questions);
    const issueIds = ids(parsedState.issues);
    const contributionIds = ids(parsedState.contributions);
    const publicationIds = ids(parsedState.publications);
    const contributionById = indexById(parsedState.contributions);
    const rounds = parsedState.rounds;
    const roundById = indexById(rounds);
    const versionOwnerById = indexVersionOwners(parsedState);
    const reviewIds = ids(parsedState.reviews);
    if (own(value, "termination")) {
        const termination = parsedState.termination!;
        for (const [values, refs, path] of [
            [termination.completionFactIds, completionFactIds, "$.termination.completionFactIds"],
            [termination.unresolvedQuestionIds, questionIds, "$.termination.unresolvedQuestionIds"],
            [termination.unresolvedIssueIds, issueIds, "$.termination.unresolvedIssueIds"],
            [
                termination.unclosedContributionIds,
                contributionIds,
                "$.termination.unclosedContributionIds"
            ]
        ] as const) {
            const p = checkRefs(values, refs, path);
            if (p) {
                return fail(p);
            }
        }
    }
    if (own(value, "archive")) {
        const archive = parsedState.archive!;
        if (archive.termination.id !== archive.terminationId) {
            return fail("$.archive.terminationId");
        }
        if (JSON.stringify(archive.termination) !== JSON.stringify(parsedState.termination)) {
            return fail("$.archive.termination");
        }
        for (const [values, refs, path] of [
            [archive.publications.map((item) => item.id), publicationIds, "$.archive.publications"],
            [
                archive.completionFacts.map((item) => item.id),
                completionFactIds,
                "$.archive.completionFacts"
            ],
            [archive.questions.map((item) => item.id), questionIds, "$.archive.questions"],
            [archive.issues.map((item) => item.id), issueIds, "$.archive.issues"]
        ] as const) {
            const p = checkRefs(values, refs, path);
            if (p) {
                return fail(p);
            }
        }
        if (
            JSON.stringify(archive.unresolvedItemIds) !==
            JSON.stringify([
                ...archive.termination.unresolvedQuestionIds,
                ...archive.termination.unresolvedIssueIds
            ])
        ) {
            return fail("$.archive.unresolvedItemIds");
        }
        if (
            archive.unclosedContributions.length !==
            archive.termination.unclosedContributionIds.length
        ) {
            return fail("$.archive.unclosedContributions");
        }
        for (let i = 0; i < archive.unclosedContributions.length; i++) {
            const contribution = archive.unclosedContributions[i];
            if (contribution.contributionId !== archive.termination.unclosedContributionIds[i]) {
                return fail(`$.archive.unclosedContributions[${i}].contributionId`);
            }
            const source = contributionById.get(contribution.contributionId);
            if (
                source === undefined ||
                source.contributorId !== contribution.contributorIdentityId ||
                source.roundId !==
                    rounds.find((round) => round.contributionIds.includes(source.id))?.id ||
                roundById.get(source.roundId)?.agendaId !== contribution.agendaId
            ) {
                return fail(`$.archive.unclosedContributions[${i}]`);
            }
        }
        for (let i = 0; i < archive.evidenceBundles.length; i++) {
            const bundle = archive.evidenceBundles[i];
            const owner = versionOwnerById.get(bundle.version.id);
            if (
                owner === undefined ||
                owner.id !== bundle.packageId ||
                owner.authorId !== bundle.authorIdentityId ||
                owner.agendaId !== bundle.agendaId ||
                bundle.review.versionId !== bundle.version.id ||
                !reviewIds.has(bundle.review.id)
            ) {
                return fail(`$.archive.evidenceBundles[${i}]`);
            }
        }
    }
    const terminal = ["terminal", "archiving", "archived"].includes(lifecycle.status as string);
    if (terminal && !own(value, "termination")) {
        return fail("$.termination");
    }
    if (["archiving", "archived"].includes(lifecycle.status as string) && !own(value, "archive")) {
        return fail("$.archive");
    }
    if (own(value, "archive")) {
        const archive = value.archive as RecordValue;
        const termination = value.termination as RecordValue | undefined;
        if (!termination || archive.terminationId !== termination.id) {
            return fail("$.archive.terminationId");
        }
        if ((archive.publicSnapshotVersion as number) > (value.version as number)) {
            return fail("$.archive.publicSnapshotVersion");
        }
        if (!["archiving", "archived"].includes(lifecycle.status as string)) {
            return fail("$.archive");
        }
    }
    if (!terminal && own(value, "termination")) {
        return fail("$.termination");
    }
    if (
        ["archiving", "archived"].includes(lifecycle.status as string) &&
        (value.archive as RecordValue).status !== "complete"
    ) {
        return fail("$.archive.status");
    }
    return undefined;
};

export const validateMeetingStateOutcomes = (
    value: RecordValue,
    parsedState: MeetingState
): string | undefined => {
    return (
        validateQuestions(parsedState) ??
        validateIssues(parsedState) ??
        validatePlansAndRisk(parsedState) ??
        validateCompletionFacts(parsedState) ??
        validateEffectiveCompletion(parsedState) ??
        validateTerminalRecords(value, parsedState)
    );
};
