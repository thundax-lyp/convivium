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
    | "hand_raise"
    | "evidence_version"
    | "evidence_review"
    | "review_delivery"
    | "publication"
    | "formal_message"
    | "identity_recommendation"
    | "completion_fact"
    | "risk_disposition"
    | "disposition_fact"
    | "manager_plan"
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
    buildTimelineNodesFromEvents(view);

export interface TimelineMilestoneGroup {
    key: string;
    kind: "meeting_start" | "round" | "completion" | "closure";
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
const coordinationEvents = new Set<MeetingEventView["kind"]>([
    "manager_plan.recorded",
    "question.disposed",
    "issue.disposed",
    "risk.disposed"
]);

export const groupTimelineMilestones = (
    nodes: readonly TimelineNode[]
): readonly TimelineMilestoneGroup[] => {
    const groups: TimelineMilestoneGroup[] = [];
    const rounds = new Map<string, TimelineMilestoneGroup>();
    const publications = new Map<string, { roundId: string; meetingVersion: number }>();
    let completion: TimelineMilestoneGroup | undefined;
    let closure: TimelineMilestoneGroup | undefined;
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
        if (
            candidate &&
            (candidate.status === "active" || (kind !== undefined && coordinationEvents.has(kind)))
        ) {
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
            "from" in data &&
            data.from === "converging" &&
            data.to !== "converging"
        ) {
            group = completion;
            if (data.to !== "terminal") {
                const status = data.to === "paused" ? "blocked" : "completed";
                close(completion, status, node.time);
                completion = undefined;
            }
        } else if (coordinationEvents.has(kind)) {
            group = resolveRoundGroup(node);
        } else if (kind === "completion_fact.recorded" || kind === "completion_fact.changed") {
            if (!completion) {
                occurrence += 1;
            }
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
            close(completion, status, node.time);
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
            continue;
        }
        group.startedAt =
            group.eventKeys.length === 0 ? node.time : Math.min(group.startedAt, node.time);
        group.eventKeys.push(node.key);
    }
    return groups
        .filter((group) => group.eventKeys.length > 0)
        .sort((a, b) =>
            a.kind === "meeting_start" && b.kind !== "meeting_start"
                ? -1
                : b.kind === "meeting_start" && a.kind !== "meeting_start"
                  ? 1
                  : a.startedAt - b.startedAt
        );
};

export const buildTimelineBlocks = (
    nodes: readonly TimelineNode[],
    groups: readonly TimelineMilestoneGroup[]
): {
    key: string;
    group?: TimelineMilestoneGroup;
    members: { node: TimelineNode; side: "left" | "right" }[];
}[] => {
    const assigned = new Set(groups.flatMap((group) => group.eventKeys));
    const blocks = [
        ...groups.map((group) => ({
            key: group.key,
            group,
            time: group.startedAt,
            nodes: nodes.filter((node) => group.eventKeys.includes(node.key))
        })),
        ...nodes
            .filter((node) => !assigned.has(node.key))
            .map((node) => ({ key: node.key, group: undefined, time: node.time, nodes: [node] }))
    ]
        .filter((block) => block.nodes.length > 0)
        .sort((a, b) =>
            a.group?.kind === "meeting_start" && b.group?.kind !== "meeting_start"
                ? -1
                : b.group?.kind === "meeting_start" && a.group?.kind !== "meeting_start"
                  ? 1
                  : a.time - b.time
        );
    let index = 0;
    return blocks.map((block) => {
        if (block.group) {
            index = 0;
        }
        return {
            key: block.key,
            ...(block.group ? { group: block.group } : {}),
            members: block.nodes.map((node) => ({
                node,
                side: index++ % 2 === 0 ? ("left" as const) : ("right" as const)
            }))
        };
    });
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
            (filters.participantIds.length === 0 ||
                filters.participantIds.includes(
                    node.identityId ? `identity:${node.identityId}` : `role:${node.lane}`
                )) &&
            (filters.objectKinds.length === 0 || filters.objectKinds.includes(node.objectKind))
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
