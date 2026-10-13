import * as React from "react";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import {
    knownEnum,
    zh,
    type MeetingLocaleKey,
    type MeetingTranslate
} from "@/client/meeting/shared/index.ts";
import {
    buildTimelineNodes,
    filterTimelineNodes,
    resolveTimelineNodeContent,
    groupTimelineMilestones,
    type TimelineMilestoneGroup,
    type TimelineNode
} from "./projection.ts";
import type { MeetingFocusTarget, TimelineFilterState } from "@/client/meeting/shared/index.ts";
import { Ellipsis } from "@/client/meeting/components/index.ts";
import styles from "./timeline.module.css";

export type TimelineDirection = "up" | "down" | "left" | "right";

export interface AdjacentTimelineInput {
    nodes: readonly TimelineNode[];
    currentKey: string;
    direction: TimelineDirection;
}

export interface TimelineProps {
    detail: MeetingView;
    filters: TimelineFilterState;
    viewportRevision: number;
    locale?: string;
    onFiltersChange(filters: TimelineFilterState): void;
    focusTarget?: MeetingFocusTarget;
    onFocusConsumed?(): void;
    onLocateInOverview?(target: MeetingFocusTarget): void;
}

export interface TimelineFiltersProps {
    detail: MeetingView;
    nodes: readonly TimelineNode[];
    filters: TimelineFilterState;
    onChange(filters: TimelineFilterState): void;
    eventKinds: readonly string[];
    onEventKindsChange(kinds: string[]): void;
}

export interface TimelineViewportProps extends TimelineProps {
    nodes: readonly TimelineNode[];
    groups: readonly TimelineMilestoneGroup[];
}

export const findAdjacentTimelineKey = ({
    nodes,
    currentKey,
    direction
}: AdjacentTimelineInput): string | undefined => {
    const visible = nodes;
    const index = visible.findIndex((node) => node.key === currentKey);
    if (index < 0) {
        return undefined;
    }
    return visible[index + (direction === "up" || direction === "left" ? -1 : 1)]?.key;
};

const label = (key: string, fallback: string, t: MeetingTranslate): string => {
    const localeKey = key as MeetingLocaleKey;
    return Object.hasOwn(zh, localeKey) ? t(localeKey) : fallback;
};

const statusLabel = (node: TimelineNode, t: MeetingTranslate): string => {
    if (node.status === undefined) {
        return "";
    }
    const group: Partial<Record<TimelineNode["objectKind"], string>> = {
        lifecycle: "lifecycle",
        round: "round",
        review_delivery: "reviewDelivery",
        identity_recommendation: "recommendation",
        position: "positionStance",
        decision_candidate: "decisionOutcome",
        decision: "decisionStatus",
        completion_fact: "completionStatus",
        risk_disposition: "riskAction",
        manager_plan: "managerPlanStatus",
        task: "task",
        termination: "terminationOutcome",
        archive: "archive"
    };
    const selectedGroup =
        node.objectKind === "disposition_fact"
            ? node.phase === "resolve_question"
                ? "questionStatus"
                : "issueStatus"
            : group[node.objectKind];
    return selectedGroup === undefined ? node.status : knownEnum(selectedGroup, node.status, t);
};

const contentTitle = (node: TimelineNode, title: string, t: MeetingTranslate): string => {
    const groups: Partial<Record<TimelineNode["objectKind"], string>> = {
        lifecycle: "lifecycle",
        review_delivery: "reviewDelivery",
        position: "positionStance",
        decision_candidate: "decisionOutcome",
        decision: "decisionOutcome",
        risk_disposition: "riskAction",
        manager_plan: "managerPlanKind",
        termination: "terminationOutcome",
        archive: "archive"
    };
    if (node.objectKind === "disposition_fact") {
        return knownEnum("timelinePhase", title, t);
    }
    const group = groups[node.objectKind];
    return group === undefined ? title : knownEnum(group, title, t);
};

const identityName = (detail: MeetingView, node: TimelineNode): string => {
    if (!node.identityId) {
        return "";
    }
    const identity =
        detail.lifecycle.status === "archived"
            ? detail.archive?.identityProvenance.find((item) => item.identityId === node.identityId)
            : detail.identities.find((item) => item.id === node.identityId);
    return identity?.displayName ?? "";
};

const toggle = (values: readonly string[], value: string): string[] => {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
};

const filterGroup = (
    title: string,
    values: readonly string[],
    selected: readonly string[],
    display: (value: string) => string,
    onToggle: (value: string) => void,
    onClear: () => void
): ReactElement => (
    <div className={styles.filterRow} role="group" aria-label={title}>
        <button
            type="button"
            className={styles.filterLabel}
            aria-pressed={selected.length === 0}
            onClick={onClear}
        >
            {title}
        </button>
        <div className={styles.filterOptions}>
            {values.map((value) => (
                <button
                    type="button"
                    className={styles.filterOption}
                    key={value}
                    aria-pressed={selected.includes(value)}
                    onClick={() => onToggle(value)}
                >
                    {display(value)}
                </button>
            ))}
        </div>
    </div>
);

export const TimelineFilters = ({
    detail,
    nodes,
    filters,
    onChange,
    eventKinds,
    onEventKindsChange
}: TimelineFiltersProps): ReactElement => {
    const t = useMeetingTranslate();
    const [expanded, setExpanded] = useState(false);
    const additionalFiltersId = useId();
    const participants = [
        ...new Set(
            [...nodes]
                .sort(
                    (a, b) =>
                        ["captain", "manager", "contributor", "reviewer", "system"].indexOf(
                            a.lane
                        ) -
                        ["captain", "manager", "contributor", "reviewer", "system"].indexOf(b.lane)
                )
                .map((node) =>
                    node.identityId ? `identity:${node.identityId}` : `role:${node.lane}`
                )
        )
    ];
    const kinds = [...new Set(nodes.map((node) => node.objectKind))];
    return (
        <div className={styles.filters}>
            <div className={styles.filterHeader}>
                {filterGroup(
                    t("panel.timeline.filter.identity"),
                    participants,
                    filters.participantIds,
                    (key) => {
                        const node = nodes.find(
                            (item) =>
                                (item.identityId
                                    ? `identity:${item.identityId}`
                                    : `role:${item.lane}`) === key
                        )!;
                        const role = t(`panel.timeline.lane.${node.lane}` as MeetingLocaleKey);
                        if (
                            node.lane === "captain" ||
                            node.lane === "manager" ||
                            !node.identityId
                        ) {
                            return role;
                        }
                        const name = identityName(detail, node);
                        return name
                            ? node.lane === "contributor" || node.lane === "reviewer"
                                ? name
                                : `${role}: ${name}`
                            : `${role} ${participants.indexOf(key) + 1}`;
                    },
                    (key) =>
                        onChange({
                            ...filters,
                            participantIds: toggle(filters.participantIds, key)
                        }),
                    () => onChange({ ...filters, participantIds: [] })
                )}
                <div className={styles.filterActions}>
                    <button
                        type="button"
                        className={styles.filterLink}
                        aria-expanded={expanded}
                        aria-controls={additionalFiltersId}
                        onClick={() => setExpanded((current) => !current)}
                    >
                        {t(
                            expanded
                                ? "panel.timeline.filter.collapse"
                                : "panel.timeline.filter.expand"
                        )}
                    </button>
                </div>
            </div>
            <div id={additionalFiltersId} hidden={!expanded}>
                {filterGroup(
                    t("panel.timeline.filter.type"),
                    kinds,
                    filters.objectKinds,
                    (kind) => label(`enum.timelineKind.${kind}`, kind, t),
                    (kind) =>
                        onChange({ ...filters, objectKinds: toggle(filters.objectKinds, kind) }),
                    () => onChange({ ...filters, objectKinds: [] })
                )}
                {filterGroup(
                    t("panel.timeline.filter.event"),
                    [
                        ...new Set(
                            nodes.flatMap((node) =>
                                node.eventKind === undefined ? [] : [node.eventKind]
                            )
                        )
                    ],
                    eventKinds,
                    (kind) => label(`enum.timelineEvent.${kind}`, kind, t),
                    (kind) => onEventKindsChange(toggle(eventKinds, kind)),
                    () => onEventKindsChange([])
                )}
            </div>
        </div>
    );
};

const nodeEmphasis = (node: TimelineNode): string => {
    if (
        (node.objectKind === "round" && node.phase === "opened") ||
        node.objectKind === "termination" ||
        (node.objectKind === "archive" && node.status === "complete") ||
        (node.objectKind === "lifecycle" && node.status === "terminal")
    ) {
        return "milestone";
    }
    return node.phase === "aborted" ||
        node.phase === "failed" ||
        node.status === "failed" ||
        node.status === "blocked"
        ? "warning"
        : "normal";
};

export const MeetingPanelTimeline = (props: TimelineProps): ReactElement => {
    const { detail, filters, onFiltersChange } = props;
    const t = useMeetingTranslate();
    const [eventKinds, setEventKinds] = useState<string[]>([]);
    useEffect(() => {
        setEventKinds([]);
    }, [detail.meetingId]);
    const allNodes = buildTimelineNodes(detail);
    const groups = groupTimelineMilestones(allNodes);
    const filtered = filterTimelineNodes(allNodes, filters).filter(
        (node) =>
            eventKinds.length === 0 ||
            (node.eventKind !== undefined && eventKinds.includes(node.eventKind))
    );
    const visibleKeys = new Set(filtered.map((node) => node.key));
    const nodes = groups.flatMap((group) =>
        allNodes.filter((node) => group.eventKeys.includes(node.key) && visibleKeys.has(node.key))
    );
    return (
        <section aria-label={t("panel.timeline.title")}>
            <TimelineFilters
                detail={props.detail}
                nodes={allNodes}
                filters={filters}
                onChange={onFiltersChange}
                eventKinds={eventKinds}
                onEventKindsChange={setEventKinds}
            />
            {nodes.length === 0 ? <p>{t("panel.timeline.empty")}</p> : null}
            <TimelineViewport {...props} nodes={nodes} groups={groups} />
        </section>
    );
};

interface TimelineNodeContentProps {
    detail: MeetingView;
    node: TimelineNode;
    dateFormatter: Intl.DateTimeFormat;
    onLocateInOverview?: TimelineProps["onLocateInOverview"];
}

const TimelineNodeContent = ({
    detail,
    node,
    dateFormatter,
    onLocateInOverview
}: TimelineNodeContentProps): ReactElement => {
    const t = useMeetingTranslate();
    const content = resolveTimelineNodeContent(detail, node);
    const laneLabel = t(`panel.timeline.lane.${node.lane}` as MeetingLocaleKey);
    const identity = identityName(detail, node);
    return (
        <>
            <p>{identity ? `${laneLabel}: ${identity}` : laneLabel}</p>
            <p>{label(`enum.timelineKind.${node.objectKind}`, node.objectKind, t)}</p>
            <p>
                {label(
                    node.eventKind === undefined
                        ? `enum.timelinePhase.${node.phase}`
                        : `enum.timelineEvent.${node.eventKind}`,
                    node.eventKind ?? node.phase,
                    t
                )}
            </p>
            <time dateTime={new Date(node.time).toISOString()}>
                {dateFormatter.format(new Date(node.time))}
            </time>
            {node.status === undefined ? null : <p>{statusLabel(node, t)}</p>}
            {onLocateInOverview ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        onLocateInOverview({
                            meetingId: detail.meetingId,
                            objectKind: node.objectKind,
                            objectId: node.objectId
                        })
                    }
                >
                    {t("panel.mode.overview")}
                </Button>
            ) : null}
            {content === undefined ? (
                <p>{t("panel.state.focusMissing")}</p>
            ) : (
                <div>
                    <Ellipsis
                        text={
                            content.title === node.objectId
                                ? label(`enum.timelineKind.${node.objectKind}`, node.objectKind, t)
                                : contentTitle(node, content.title, t)
                        }
                        maxLines={3}
                    />
                    {content.detail === undefined || content.detail === node.objectId ? null : (
                        <details>
                            <summary>{t("panel.timeline.details")}</summary>
                            <p>
                                {node.objectKind === "identity_recommendation"
                                    ? knownEnum("recommendation", content.detail, t)
                                    : content.detail}
                            </p>
                        </details>
                    )}
                </div>
            )}
        </>
    );
};

export const TimelineViewport = ({
    detail,
    nodes,
    groups,
    filters,
    viewportRevision,
    locale = navigator.language,
    onFiltersChange,
    focusTarget,
    onFocusConsumed,
    onLocateInOverview
}: TimelineViewportProps): ReactElement => {
    const t = useMeetingTranslate();
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const dateFormatter = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "medium"
    });
    const nodeRefs = useRef(new Map<string, HTMLElement>());
    const [activeKey, setActiveKey] = useState(nodes[0]?.key);
    const [focusMissing, setFocusMissing] = useState(false);
    const consumedFocus = useRef<MeetingFocusTarget | undefined>(undefined);
    useEffect(() => {
        if (viewportRef.current) {
            viewportRef.current.scrollTop = 0;
        }
    }, [viewportRevision]);
    useEffect(() => {
        if (activeKey && nodes.some((node) => node.key === activeKey)) {
            return;
        }
        setActiveKey(nodes[0]?.key);
    }, [nodes, activeKey]);
    useEffect(() => {
        if (!focusTarget) {
            consumedFocus.current = undefined;
            return;
        }
        if (consumedFocus.current === focusTarget) {
            return;
        }
        const matches =
            focusTarget.meetingId === detail.meetingId
                ? nodes.filter(
                      (node) =>
                          node.objectKind === focusTarget.objectKind &&
                          node.objectId === focusTarget.objectId
                  )
                : [];
        const target = matches
            .sort((a, b) => a.time - b.time || (a.eventSeq ?? 0) - (b.eventSeq ?? 0))
            .at(-1);
        if (!target) {
            setFocusMissing(true);
            consumedFocus.current = focusTarget;
            onFocusConsumed?.();
            return;
        }
        const element = nodeRefs.current.get(target.key);
        if (!element) {
            setFocusMissing(true);
            consumedFocus.current = focusTarget;
            onFocusConsumed?.();
            return;
        }
        setFocusMissing(false);
        setActiveKey(target.key);
        element.scrollIntoView?.({ block: "nearest", inline: "center" });
        element.focus();
        consumedFocus.current = focusTarget;
        onFocusConsumed?.();
    }, [focusTarget, nodes, filters, detail.meetingId, onFocusConsumed, onFiltersChange]);
    const blocks = groups
        .map((group) => ({
            group,
            nodes: nodes.filter((node) => group.eventKeys.includes(node.key))
        }))
        .filter((block) => block.nodes.length > 0);
    let alternatingIndex = 0;
    return (
        <div>
            {focusMissing ? <p role="status">{t("panel.state.focusMissing")}</p> : null}
            <div
                ref={viewportRef}
                aria-label={t("panel.timeline.aria.viewport")}
                className={styles.viewport}
            >
                {blocks.map(({ group, nodes: members }) => (
                    <section
                        key={group.key}
                        className={styles.group}
                        data-group-key={group.key}
                        data-group-status={group.status}
                        data-group-occurrence={group.occurrence}
                        data-started-at={group.startedAt}
                        data-completed-at={group.completedAt}
                    >
                        <h3>
                            {t(`panel.timeline.group.${group.kind}`)} · {group.occurrence} ·{" "}
                            {t(`panel.timeline.groupStatus.${group.status}`)}
                        </h3>
                        <div className={styles.grid}>
                            {members.map((node, index) => {
                                const side =
                                    node.objectKind === "round" && node.phase === "opened"
                                        ? "left"
                                        : alternatingIndex++ % 2 === 0
                                          ? "left"
                                          : "right";
                                const laneLabel = t(
                                    `panel.timeline.lane.${node.lane}` as MeetingLocaleKey
                                );
                                const identity = identityName(detail, node);
                                return (
                                    <article
                                        key={node.key}
                                        ref={(element: HTMLElement | null) => {
                                            if (element) {
                                                nodeRefs.current.set(node.key, element);
                                            } else {
                                                nodeRefs.current.delete(node.key);
                                            }
                                        }}
                                        data-testid="timeline-node"
                                        data-node-key={node.key}
                                        style={{ gridRow: index + 1 }}
                                        data-side={side}
                                        data-emphasis={nodeEmphasis(node)}
                                        tabIndex={activeKey === node.key ? 0 : -1}
                                        onFocus={() => setActiveKey(node.key)}
                                        onKeyDown={(event: React.KeyboardEvent) => {
                                            const direction = {
                                                ArrowUp: "up",
                                                ArrowDown: "down",
                                                ArrowLeft: "left",
                                                ArrowRight: "right"
                                            }[event.key] as TimelineDirection | undefined;
                                            if (!direction) {
                                                return;
                                            }
                                            event.preventDefault();
                                            const next = findAdjacentTimelineKey({
                                                nodes,
                                                currentKey: node.key,
                                                direction
                                            });
                                            if (next) {
                                                nodeRefs.current.get(next)?.focus();
                                            }
                                        }}
                                        aria-label={[
                                            t("panel.timeline.aria.node"),
                                            laneLabel,
                                            identity,
                                            label(
                                                `enum.timelineKind.${node.objectKind}`,
                                                node.objectKind,
                                                t
                                            ),
                                            label(
                                                node.eventKind === undefined
                                                    ? `enum.timelinePhase.${node.phase}`
                                                    : `enum.timelineEvent.${node.eventKind}`,
                                                node.eventKind ?? node.phase,
                                                t
                                            ),
                                            dateFormatter.format(new Date(node.time)),
                                            statusLabel(node, t)
                                        ]
                                            .filter(Boolean)
                                            .join("; ")}
                                        className={styles.node}
                                    >
                                        <TimelineNodeContent
                                            detail={detail}
                                            node={node}
                                            dateFormatter={dateFormatter}
                                            onLocateInOverview={onLocateInOverview}
                                        />
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
};
