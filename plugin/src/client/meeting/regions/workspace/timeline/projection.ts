import type { MeetingView, MeetingEventView } from "@/protocol/index.ts";
import type {
    TimelineFilterState,
    TimelineLane,
    TimelineObjectRef
} from "@/client/meeting/shared/index.ts";

export type TimelineObjectKind =
    | MeetingEventView["subject"]["kind"]
    | "lifecycle"
    | "round"
    | "opportunity_request"
    | "hand_raise"
    | "evidence_version"
    | "evidence_review"
    | "review_delivery"
    | "publication"
    | "formal_message"
    | "identity_recommendation"
    | "proposal_revision"
    | "position"
    | "decision_candidate"
    | "decision"
    | "completion_fact"
    | "risk_disposition"
    | "disposition_fact"
    | "manager_plan"
    | "task"
    | "termination"
    | "archive";

export interface TimelineNode {
    eventSeq?: number;
    meetingVersion?: number;
    eventKind?: MeetingEventView["kind"];
    eventData?: MeetingEventView["data"];
    key: string;
    objectKind: TimelineObjectKind;
    objectId: string;
    phase: string;
    time: number;
    lane: TimelineLane;
    identityId?: string;
    status?: string;
    relatedObjects: readonly TimelineObjectRef[];
}

export interface TimelineNodeContent {
    title: string;
    detail?: string;
}

const kinds: readonly TimelineObjectKind[] = [
    "lifecycle",
    "round",
    "opportunity_request",
    "hand_raise",
    "evidence_version",
    "evidence_review",
    "review_delivery",
    "publication",
    "formal_message",
    "identity_recommendation",
    "proposal_revision",
    "position",
    "decision_candidate",
    "decision",
    "completion_fact",
    "risk_disposition",
    "disposition_fact",
    "manager_plan",
    "task",
    "termination",
    "archive"
];

const relationFields: ReadonlyArray<readonly [string, string]> = [
    ["roundId", "round"],
    ["publicationId", "publication"],
    ["basedOnPublicationId", "publication"],
    ["baselinePublicationIds", "publication"],
    ["reviewId", "evidence_review"],
    ["finalReviewIds", "evidence_review"],
    ["versionId", "evidence_version"],
    ["finalVersionIds", "evidence_version"],
    ["evidenceIds", "evidence_version"],
    ["proposalRevisionId", "proposal_revision"],
    ["supersedesRevisionId", "proposal_revision"],
    ["positionIds", "position"],
    ["candidateId", "decision_candidate"],
    ["decisionIds", "decision"],
    ["replacesDecisionId", "decision"],
    ["issueId", "issue"],
    ["questionId", "question"],
    ["reassignedFromTaskId", "task"]
];

const relatedObjects = (source: object): TimelineObjectRef[] => {
    const record = source as Record<string, unknown>;
    return relationFields.flatMap(([field, objectKind]) => {
        const value = record[field];
        if (typeof value === "string") {
            return [{ objectKind, objectId: value }];
        }
        if (Array.isArray(value)) {
            return value
                .filter((id): id is string => typeof id === "string")
                .map((objectId) => ({ objectKind, objectId }));
        }
        return [];
    });
};

const actorLane = (view: MeetingView, identityId: string): TimelineLane => {
    const identities =
        view.lifecycle.status === "archived"
            ? (view.archive?.identityProvenance.map(({ identityId: id, roles }) => ({
                  id,
                  roles
              })) ?? [])
            : view.identities;
    const identity = identities.find(({ id }) => id === identityId);
    if (identity?.roles.length !== 1) {
        return "system";
    }
    const role = identity.roles[0];
    return role === "evidence_reviewer" ? "reviewer" : (role ?? "system");
};

export const buildTimelineNodesFromLegacyView = (view: MeetingView): readonly TimelineNode[] => {
    const archived = view.lifecycle.status === "archived";
    if (archived && view.archive?.status !== "complete") {
        return [];
    }
    const archive = archived ? view.archive : undefined;
    const nodes: TimelineNode[] = [];
    const add = (
        kind: TimelineObjectKind,
        objectId: string,
        phase: string,
        time: number | undefined,
        source: object,
        lane: TimelineLane = "system",
        identityId?: string,
        status?: string
    ): void => {
        if (time === undefined) {
            return;
        }
        nodes.push({
            key: `${kind}:${objectId}:${phase}`,
            objectKind: kind,
            objectId,
            phase,
            time,
            lane,
            ...(identityId === undefined ? {} : { identityId }),
            ...(status === undefined ? {} : { status }),
            relatedObjects: relatedObjects(source)
        });
    };
    const actor = (
        kind: TimelineObjectKind,
        source: {
            id: string;
            actorId: string;
            createdAt: number;
        },
        status?: string
    ): void => {
        add(
            kind,
            source.id,
            "created",
            source.createdAt,
            source,
            actorLane(view, source.actorId),
            source.actorId,
            status
        );
    };
    const appendActiveNodes = (): void => {
        add(
            "lifecycle",
            view.meetingId,
            "changed",
            view.lifecycle.changedAt,
            view.lifecycle,
            "system",
            undefined,
            view.lifecycle.status
        );
        for (const round of view.rounds) {
            add(
                "round",
                round.id,
                "opened",
                round.openedAt,
                round,
                "system",
                undefined,
                round.status
            );
            add(
                "round",
                round.id,
                "aborted",
                round.abortedAt,
                round,
                "system",
                undefined,
                round.status
            );
            for (const raise of round.pendingHandRaises) {
                add(
                    "hand_raise",
                    `${raise.roundId}:${raise.contributorId}`,
                    "raised",
                    raise.raisedAt,
                    raise,
                    "contributor",
                    raise.contributorId
                );
            }
        }
        for (const request of view.opportunityRequests) {
            add(
                "opportunity_request",
                request.id,
                "requested",
                request.requestedAt,
                request,
                "contributor",
                request.contributorId
            );
        }
        for (const pkg of view.evidencePackages) {
            add(
                "evidence_version",
                pkg.currentVersion.id,
                "submitted",
                pkg.currentVersion.submittedAt,
                pkg.currentVersion,
                "contributor",
                pkg.authorId
            );
        }
        for (const review of view.evidenceReviews) {
            add(
                "evidence_review",
                review.id,
                "created",
                review.createdAt,
                review,
                "reviewer",
                review.reviewerId
            );
        }
        for (const delivery of view.reviewDeliveries) {
            add(
                "review_delivery",
                delivery.id,
                delivery.status,
                delivery.sentAt ?? delivery.failedAt,
                delivery,
                "system",
                undefined,
                delivery.status
            );
        }
        for (const recommendation of view.identityRecommendations ?? []) {
            add(
                "identity_recommendation",
                recommendation.id,
                "created",
                recommendation.createdAt,
                recommendation,
                "system",
                undefined,
                recommendation.status
            );
        }
        for (const candidate of view.outcomes.pendingDecisionCandidates ?? []) {
            actor("decision_candidate", candidate, candidate.outcome);
        }
        for (const plan of view.managerPlans) {
            add(
                "manager_plan",
                plan.id,
                "created",
                plan.createdAt,
                plan,
                "manager",
                plan.managerId,
                plan.status
            );
        }
        for (const task of view.tasks) {
            add("task", task.id, "started", task.startedAt, task, "system", undefined, task.status);
            add(
                "task",
                task.id,
                "completed",
                task.completedAt,
                task,
                "system",
                undefined,
                task.status
            );
        }
    };
    const appendArchiveNodes = (completeArchive: NonNullable<MeetingView["archive"]>): void => {
        for (const bundle of completeArchive.evidenceBundles) {
            add(
                "evidence_version",
                bundle.version.id,
                "submitted",
                bundle.version.submittedAt,
                bundle.version,
                "contributor",
                bundle.authorIdentityId
            );
            add(
                "evidence_review",
                bundle.review.id,
                "created",
                bundle.review.createdAt,
                bundle.review,
                "reviewer",
                bundle.review.reviewerId
            );
        }
        for (const revision of completeArchive.proposalRevisions) {
            actor("proposal_revision", revision);
        }
        for (const position of completeArchive.positions) {
            actor("position", position, position.stance);
        }
        for (const candidate of completeArchive.decisionCandidates) {
            actor("decision_candidate", candidate, candidate.outcome);
        }
        for (const fact of completeArchive.questionIssueDispositionFacts) {
            add(
                "disposition_fact",
                fact.factId,
                fact.kind,
                fact.occurredAt,
                fact.payload,
                actorLane(view, fact.actorId),
                fact.actorId,
                fact.payload.newStatus
            );
        }
        add(
            "archive",
            completeArchive.id,
            "created",
            completeArchive.createdAt,
            completeArchive,
            "system",
            undefined,
            completeArchive.status
        );
    };
    if (archive) {
        appendArchiveNodes(archive);
    } else {
        appendActiveNodes();
    }
    for (const publication of archive?.publications ?? view.publications) {
        add("publication", publication.id, "published", publication.publishedAt, publication);
    }
    for (const message of archive?.messages ?? view.messages) {
        actor("formal_message", message, message.kind);
    }
    for (const decision of archive?.decisions ?? view.outcomes.decisions) {
        actor("decision", decision, decision.status);
    }
    for (const fact of archive?.completionFacts ?? view.outcomes.completionFacts) {
        actor("completion_fact", fact, fact.status);
    }
    for (const risk of archive?.riskDispositions ?? view.outcomes.riskDispositions) {
        actor("risk_disposition", risk, risk.action);
    }
    const termination = archive?.termination ?? view.outcomes.termination;
    if (termination) {
        add(
            "termination",
            termination.id,
            "ended",
            termination.endedAt,
            termination,
            "system",
            undefined,
            termination.outcome
        );
    }
    return nodes.sort(
        (a, b) =>
            a.time - b.time ||
            kinds.indexOf(a.objectKind) - kinds.indexOf(b.objectKind) ||
            a.objectId.localeCompare(b.objectId) ||
            phaseOrder(a.phase) - phaseOrder(b.phase)
    );
};

const eventActorLane = (view: MeetingView, event: MeetingEventView): TimelineLane => {
    if (event.actor.kind !== "identity") {
        return event.actor.kind === "captain" ? "captain" : "system";
    }
    const actorId = event.actor.actorId;
    const roles = view.identities.find((identity) => identity.id === actorId)?.roles ?? [];
    if (roles.length === 1) {
        return roles[0] === "evidence_reviewer" ? "reviewer" : roles[0]!;
    }
    const role =
        event.kind === "evidence_review.submitted"
            ? "evidence_reviewer"
            : [
                    "round.opened",
                    "round.published",
                    "manager_plan.recorded",
                    "identity.recommended"
                ].includes(event.kind)
              ? "manager"
              : [
                      "evidence.submitted",
                      "hand_raise.recorded",
                      "contribution.closed",
                      "round.participation_recorded"
                  ].includes(event.kind)
                ? "contributor"
                : undefined;
    return role === undefined || !roles.includes(role)
        ? "system"
        : role === "evidence_reviewer"
          ? "reviewer"
          : role;
};

export const buildTimelineNodesFromEvents = (view: MeetingView): readonly TimelineNode[] =>
    (view.timelineEvents ?? [])
        .map((event): TimelineNode => {
            const data = event.data;
            const status =
                "status" in data
                    ? data.status
                    : "to" in data
                      ? data.to
                      : "outcome" in data
                        ? data.outcome
                        : "disposition" in data
                          ? data.disposition
                          : undefined;
            return {
                key: `event:${event.eventSeq}`,
                eventSeq: event.eventSeq,
                meetingVersion: event.meetingVersion,
                eventKind: event.kind,
                eventData: structuredClone(data),
                objectKind: event.subject.kind,
                objectId: event.subject.id,
                phase: event.kind.split(".")[1]!,
                time: event.occurredAt,
                lane: eventActorLane(view, event),
                ...(event.actor.kind === "identity" ? { identityId: event.actor.actorId } : {}),
                ...(status === undefined ? {} : { status }),
                relatedObjects: event.relatedObjects.map((object) => ({
                    objectKind: object.kind,
                    objectId: object.id
                }))
            };
        })
        .sort((a, b) => a.time - b.time || a.eventSeq! - b.eventSeq!);

export const buildTimelineNodes = (view: MeetingView): readonly TimelineNode[] =>
    view.timelineEvents === undefined
        ? buildTimelineNodesFromLegacyView(view)
        : buildTimelineNodesFromEvents(view);

export interface TimelineMilestoneGroup {
    key: string;
    kind: "meeting_start" | "round" | "convergence" | "completion" | "closure" | "other";
    occurrence: number;
    title: string;
    status: "active" | "completed" | "aborted" | "blocked";
    startedAt: number;
    completedAt?: number;
    eventKeys: string[];
}

const roundEvents = new Set<MeetingEventView["kind"]>([
    "round.opened",
    "evidence.submitted",
    "evidence_review.submitted",
    "review_delivery.recorded",
    "round.published",
    "formal_message.published",
    "round.aborted",
    "contribution.failed",
    "hand_raise.recorded",
    "hand_raise.disposed",
    "round.participation_recorded",
    "contribution.closed",
    "evidence_review.claimed",
    "evidence_validation.failed"
]);
const convergenceEvents = new Set<MeetingEventView["kind"]>([
    "manager_plan.recorded",
    "question.disposed",
    "issue.disposed",
    "decision.recorded",
    "decision.changed",
    "risk.disposed"
]);

export const groupTimelineMilestones = (
    nodes: readonly TimelineNode[]
): readonly TimelineMilestoneGroup[] => {
    const groups: TimelineMilestoneGroup[] = [];
    const rounds = new Map<string, TimelineMilestoneGroup>();
    const publications = new Map<string, { roundId: string; meetingVersion: number }>();
    let convergence: TimelineMilestoneGroup | undefined;
    let completion: TimelineMilestoneGroup | undefined;
    let closure: TimelineMilestoneGroup | undefined;
    let other: TimelineMilestoneGroup | undefined;
    let occurrence = 0;
    let roundOccurrence = 0;
    const create = (
        kind: TimelineMilestoneGroup["kind"],
        key: string,
        instance: number,
        time: number
    ): TimelineMilestoneGroup => {
        const group: TimelineMilestoneGroup = {
            key,
            kind,
            occurrence: instance,
            title: kind,
            status: "active",
            startedAt: time,
            eventKeys: []
        };
        groups.push(group);
        return group;
    };
    const enterConvergence = (time: number): TimelineMilestoneGroup => {
        if (!convergence) {
            occurrence += 1;
            convergence = create(
                "convergence",
                `milestone:convergence:${occurrence}`,
                occurrence,
                time
            );
        }
        return convergence;
    };
    const close = (
        group: TimelineMilestoneGroup | undefined,
        status: TimelineMilestoneGroup["status"],
        time: number
    ): void => {
        if (group) {
            group.status = status;
            group.completedAt = time;
        }
    };
    const resolveRoundGroup = (node: TimelineNode): TimelineMilestoneGroup | undefined => {
        const kind = node.eventKind;
        let group: TimelineMilestoneGroup | undefined;
        const roundIds = [
            ...new Set([
                ...(node.objectKind === "round" ? [node.objectId] : []),
                ...node.relatedObjects
                    .filter((ref) => ref.objectKind === "round")
                    .map((ref) => ref.objectId)
            ])
        ];
        const candidate = roundIds.length === 1 ? rounds.get(roundIds[0]!) : undefined;
        const publicationIds = [
            ...new Set(
                node.relatedObjects
                    .filter((ref) => ref.objectKind === "publication")
                    .map((ref) => ref.objectId)
            )
        ];
        const publication =
            publicationIds.length === 1 ? publications.get(publicationIds[0]!) : undefined;
        if (candidate?.status === "active") {
            group = candidate;
            if (kind === "round.published" || kind === "round.aborted") {
                close(group, kind === "round.published" ? "completed" : "aborted", node.time);
                if (kind === "round.published" && node.meetingVersion !== undefined) {
                    publications.set(node.objectId, {
                        roundId: roundIds[0]!,
                        meetingVersion: node.meetingVersion
                    });
                }
            }
        } else if (
            kind === "formal_message.published" &&
            candidate?.status === "completed" &&
            publication?.roundId === roundIds[0] &&
            publication?.meetingVersion === node.meetingVersion
        ) {
            group = candidate;
        }

        return group;
    };
    for (const node of [...nodes].sort((a, b) => (a.eventSeq ?? 0) - (b.eventSeq ?? 0))) {
        const kind = node.eventKind;
        const data = node.eventData;
        if (kind === undefined || data === undefined) {
            continue;
        }
        let group: TimelineMilestoneGroup | undefined;
        if (kind === "meeting.created") {
            group = create("meeting_start", "milestone:meeting-start:1", 1, node.time);
            close(group, "completed", node.time);
        } else if (kind === "round.opened") {
            roundOccurrence += 1;
            group = create("round", `milestone:round:${node.objectId}`, roundOccurrence, node.time);
            rounds.set(node.objectId, group);
        } else if (roundEvents.has(kind)) {
            group = resolveRoundGroup(node);
        } else if (
            kind === "meeting.lifecycle_changed" &&
            "to" in data &&
            data.to === "converging"
        ) {
            group = enterConvergence(node.time);
        } else if (
            kind === "meeting.lifecycle_changed" &&
            "from" in data &&
            data.from === "converging" &&
            data.to !== "converging"
        ) {
            group = completion ?? convergence;
            const status = data.to === "paused" ? "blocked" : "completed";
            close(convergence, status, node.time);
            close(completion, status, node.time);
            convergence = undefined;
            completion = undefined;
        } else if (convergenceEvents.has(kind)) {
            group = enterConvergence(node.time);
        } else if (kind === "completion_fact.recorded" || kind === "completion_fact.changed") {
            enterConvergence(node.time);
            completion ??= create(
                "completion",
                `milestone:completion:${occurrence}`,
                occurrence,
                node.time
            );
            group = completion;
        } else if (kind === "meeting.ended") {
            const status =
                "outcome" in data && data.outcome === "completed" ? "completed" : "aborted";
            close(convergence, status, node.time);
            close(completion, status, node.time);
            convergence = undefined;
            completion = undefined;
            closure = create("closure", "milestone:closure:1", 1, node.time);
            group = closure;
        } else if (kind === "archive.started" || kind === "archive.completed") {
            group = closure;
            if (kind === "archive.completed") {
                close(closure, "completed", node.time);
            }
        }
        if (group === undefined) {
            other ??= create("other", "milestone:other:1", 1, node.time);
            group = other;
        }
        group.startedAt =
            group.eventKeys.length === 0 ? node.time : Math.min(group.startedAt, node.time);
        group.eventKeys.push(node.key);
    }
    return groups
        .filter((group) => group.eventKeys.length > 0)
        .sort((a, b) => a.startedAt - b.startedAt);
};

export const isPrimaryTimelineNode = (node: TimelineNode): boolean => {
    if (node.eventKind === undefined) {
        return true;
    }
    if (
        node.eventKind === "contribution.failed" ||
        node.eventKind === "evidence_validation.failed" ||
        node.status === "failed"
    ) {
        return true;
    }
    return (
        ![
            "formal_message.published",
            "hand_raise.recorded",
            "hand_raise.disposed",
            "round.participation_recorded",
            "contribution.closed",
            "evidence_review.claimed",
            "manager_plan.recorded",
            "identity.recommended",
            "identity.admission_recorded"
        ].includes(node.eventKind) &&
        !(node.eventKind === "review_delivery.recorded" && node.status === "sent")
    );
};

const phaseOrder = (phase: string): number => {
    return phase === "opened" || phase === "started" ? 0 : 1;
};

const unique = <T>(items: readonly T[], predicate: (item: T) => boolean): T | undefined => {
    const matches = items.filter(predicate);
    return matches.length === 1 ? matches[0] : undefined;
};

export const filterTimelineNodes = (
    nodes: readonly TimelineNode[],
    filters: TimelineFilterState
): readonly TimelineNode[] => {
    return nodes.filter(
        (node) =>
            (filters.identityIds.length === 0 ||
                (node.identityId !== undefined && filters.identityIds.includes(node.identityId))) &&
            (filters.objectKinds.length === 0 || filters.objectKinds.includes(node.objectKind)) &&
            (filters.statuses.length === 0 ||
                (node.status !== undefined && filters.statuses.includes(node.status))) &&
            (filters.relatedObjects.length === 0 ||
                filters.relatedObjects.some((ref) =>
                    node.relatedObjects.some(
                        (related) =>
                            related.objectKind === ref.objectKind &&
                            related.objectId === ref.objectId
                    )
                ))
    );
};

type TimelineArchive = NonNullable<MeetingView["archive"]>;

const resolveEarlyContent = (
    view: MeetingView,
    node: TimelineNode,
    archive: TimelineArchive | undefined
): TimelineNodeContent | undefined => {
    const id = node.objectId;
    switch (node.objectKind) {
        case "lifecycle":
            return archive || id !== view.meetingId
                ? undefined
                : { title: view.lifecycle.status, detail: view.lifecycle.reason };
        case "round": {
            const item = archive ? undefined : unique(view.rounds, (x) => x.id === id);
            return (
                item && {
                    title: item.roundGoal.question,
                    detail: item.abortReason ?? item.roundGoal.evidenceGap
                }
            );
        }
        case "opportunity_request": {
            const item = archive ? undefined : unique(view.opportunityRequests, (x) => x.id === id);
            return item && { title: item.purpose };
        }
        case "hand_raise": {
            const item = archive
                ? undefined
                : unique(
                      view.rounds.flatMap((x) => x.pendingHandRaises),
                      (x) => `${x.roundId}:${x.contributorId}` === id
                  );
            return item && { title: item.purpose };
        }
        case "evidence_version": {
            const item = unique(
                archive
                    ? archive.evidenceBundles.map((x) => x.version)
                    : view.evidencePackages.map((x) => x.currentVersion),
                (x) => x.id === id
            );
            return item && { title: item.observation, detail: item.interpretation };
        }
        case "evidence_review": {
            const item = unique(
                archive ? archive.evidenceBundles.map((x) => x.review) : view.evidenceReviews,
                (x) => x.id === id
            );
            return item && { title: item.scope };
        }
        case "review_delivery": {
            const item = archive ? undefined : unique(view.reviewDeliveries, (x) => x.id === id);
            return item && { title: item.failureReason ?? item.status };
        }
        case "publication": {
            const item = unique(archive?.publications ?? view.publications, (x) => x.id === id);
            return item && { title: item.id, detail: item.exitReasons.join("; ") || undefined };
        }
        case "formal_message": {
            const item = unique(archive?.messages ?? view.messages, (x) => x.id === id);
            return item && { title: item.kind, detail: item.body };
        }
    }
    return undefined;
};

const resolveMiddleContent = (
    view: MeetingView,
    node: TimelineNode,
    archive: TimelineArchive | undefined
): TimelineNodeContent | undefined => {
    const id = node.objectId;
    switch (node.objectKind) {
        case "identity_recommendation": {
            const item = archive
                ? undefined
                : unique(view.identityRecommendations ?? [], (x) => x.id === id);
            return item && { title: item.rationale, detail: item.status };
        }
        case "proposal_revision": {
            const item = unique(archive?.proposalRevisions ?? [], (x) => x.id === id);
            return item && { title: item.summary, detail: item.body };
        }
        case "position": {
            const item = unique(archive?.positions ?? [], (x) => x.id === id);
            return item && { title: item.stance, detail: item.rationale };
        }
        case "decision_candidate": {
            const item = unique(
                archive?.decisionCandidates ?? view.outcomes.pendingDecisionCandidates ?? [],
                (x) => x.id === id
            );
            return item && { title: item.outcome, detail: item.rationale };
        }
        case "decision": {
            const item = unique(archive?.decisions ?? view.outcomes.decisions, (x) => x.id === id);
            return item && { title: item.outcome, detail: item.rationale };
        }
        case "completion_fact": {
            const item = unique(
                archive?.completionFacts ?? view.outcomes.completionFacts,
                (x) => x.id === id
            );
            return item && { title: item.statement, detail: item.rationale };
        }
        case "risk_disposition": {
            const item = unique(
                archive?.riskDispositions ?? view.outcomes.riskDispositions,
                (x) => x.id === id
            );
            return item && { title: item.action, detail: item.rationale };
        }
    }
    return undefined;
};

const resolveLateContent = (
    view: MeetingView,
    node: TimelineNode,
    archive: TimelineArchive | undefined
): TimelineNodeContent | undefined => {
    const id = node.objectId;
    switch (node.objectKind) {
        case "disposition_fact": {
            const item = unique(
                archive?.questionIssueDispositionFacts ?? [],
                (x) => x.factId === id
            );
            return item && { title: item.kind, detail: item.payload.rationale };
        }
        case "manager_plan": {
            const item = archive ? undefined : unique(view.managerPlans, (x) => x.id === id);
            return item && { title: item.kind, detail: item.blockingReason ?? item.rationale };
        }
        case "task": {
            const item = archive ? undefined : unique(view.tasks, (x) => x.id === id);
            return item && { title: item.title, detail: item.result ?? item.exitReason };
        }
        case "termination": {
            const item = archive?.termination ?? view.outcomes.termination;
            return item?.id === id ? { title: item.outcome, detail: item.reason } : undefined;
        }
        case "archive":
            return archive?.id === id ? { title: archive.status, detail: archive.id } : undefined;
    }
    return undefined;
};

export const resolveTimelineNodeContent = (
    view: MeetingView,
    node: TimelineNode
): TimelineNodeContent | undefined => {
    if (node.eventData !== undefined) {
        const data = node.eventData;
        const immutable =
            "summary" in data
                ? data.summary
                : "statement" in data
                  ? data.statement
                  : "rationale" in data
                    ? data.rationale
                    : "reason" in data
                      ? data.reason
                      : "scope" in data
                        ? data.scope
                        : "failureSummary" in data
                          ? data.failureSummary
                          : "failureReason" in data
                            ? data.failureReason
                            : "purpose" in data
                              ? data.purpose
                              : "messageKind" in data
                                ? data.messageKind
                                : (node.status ?? node.objectId);
        const archive = view.lifecycle.status === "archived" ? view.archive : undefined;
        const supplement =
            resolveEarlyContent(view, node, archive) ??
            resolveMiddleContent(view, node, archive) ??
            resolveLateContent(view, node, archive);
        return {
            title: immutable ?? node.objectId,
            ...(supplement?.detail === undefined ? {} : { detail: supplement.detail })
        };
    }
    const archive =
        view.lifecycle.status === "archived" && view.archive?.status === "complete"
            ? view.archive
            : undefined;
    if (view.lifecycle.status === "archived" && !archive) {
        return undefined;
    }
    return (
        resolveEarlyContent(view, node, archive) ??
        resolveMiddleContent(view, node, archive) ??
        resolveLateContent(view, node, archive)
    );
};
