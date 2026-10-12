import * as React from "react";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { Button, Pill } from "@deepseek-ai/dsh-client-ui-primitives";
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
    isPrimaryTimelineNode,
    type TimelineMilestoneGroup,
    type TimelineNode
} from "./projection.ts";
import type {
    MeetingFocusTarget,
    TimelineFilterState,
    TimelineLane
} from "@/client/meeting/shared/index.ts";
import { Ellipsis } from "@/client/meeting/components/index.ts";
import styles from "./timeline.module.css";

export type TimelineDirection = "up" | "down" | "left" | "right";

export interface AdjacentTimelineInput {
    nodes: readonly TimelineNode[];
    currentKey: string;
    direction: TimelineDirection;
    collapsedLanes: readonly TimelineLane[];
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

const lanes: readonly TimelineLane[] = ["captain", "manager", "contributor", "reviewer", "system"];

export const findAdjacentTimelineKey = ({
    nodes,
    currentKey,
    direction,
    collapsedLanes
}: AdjacentTimelineInput): string | undefined => {
    const visible = nodes.filter((node) => !collapsedLanes.includes(node.lane));
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
    onToggle: (value: string) => void
): ReactElement => {
    return (
        <fieldset>
            <legend>{title}</legend>
            {values.map((value) => (
                <Pill
                    key={value}
                    active={selected.includes(value)}
                    aria-pressed={selected.includes(value)}
                    onClick={() => onToggle(value)}
                >
                    {display(value)}
                </Pill>
            ))}
        </fieldset>
    );
};

export const TimelineFilters = ({
    detail,
    nodes,
    filters,
    onChange,
    eventKinds,
    onEventKindsChange
}: TimelineFiltersProps): ReactElement => {
    const t = useMeetingTranslate();
    const identities = [
        ...new Set(nodes.flatMap((node) => (node.identityId ? [node.identityId] : [])))
    ];
    const kinds = [...new Set(nodes.map((node) => node.objectKind))];
    const statuses = [...new Set(nodes.flatMap((node) => (node.status ? [node.status] : [])))];
    return (
        <div>
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
                (kind) => onEventKindsChange(toggle(eventKinds, kind))
            )}
            {filterGroup(
                t("panel.timeline.filter.identity"),
                identities,
                filters.identityIds,
                (id) => {
                    const lane = nodes.find((node) => node.identityId === id)?.lane ?? "system";
                    const node = nodes.find((item) => item.identityId === id)!;
                    const name = identityName(detail, node);
                    const role = t(`panel.timeline.lane.${lane}` as MeetingLocaleKey);
                    return name ? `${role}: ${name}` : `${role} ${identities.indexOf(id) + 1}`;
                },
                (id) => onChange({ ...filters, identityIds: toggle(filters.identityIds, id) })
            )}
            {filterGroup(
                t("panel.timeline.filter.type"),
                kinds,
                filters.objectKinds,
                (kind) => label(`enum.timelineKind.${kind}`, kind, t),
                (kind) => onChange({ ...filters, objectKinds: toggle(filters.objectKinds, kind) })
            )}
            {filterGroup(
                t("panel.timeline.filter.status"),
                statuses,
                filters.statuses,
                (status) =>
                    [
                        ...new Set(
                            nodes
                                .filter((node) => node.status === status)
                                .map((node) => statusLabel(node, t))
                        )
                    ].join(" / "),
                (status) => onChange({ ...filters, statuses: toggle(filters.statuses, status) })
            )}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                    onEventKindsChange([]);
                    onChange({
                        ...filters,
                        identityIds: [],
                        objectKinds: [],
                        statuses: []
                    });
                }}
            >
                {t("panel.timeline.filter.clear")}
            </Button>
        </div>
    );
};

const isPrimaryNode = (node: TimelineNode): boolean => {
    if (node.eventKind !== undefined) {
        return isPrimaryTimelineNode(node);
    }
    switch (node.objectKind) {
        case "opportunity_request":
        case "hand_raise":
        case "formal_message":
        case "identity_recommendation":
        case "proposal_revision":
        case "position":
        case "decision_candidate":
        case "manager_plan":
            return false;
        case "review_delivery":
            return node.status === "failed";
        case "task":
            return false;
        default:
            return true;
    }
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
    const [showDetails, setShowDetails] = useState(false);
    const [eventKinds, setEventKinds] = useState<string[]>([]);
    useEffect(() => {
        setShowDetails(false);
        setEventKinds([]);
    }, [detail.meetingId]);
    const allNodes = buildTimelineNodes(detail);
    const groups = groupTimelineMilestones(allNodes);
    const filtered = filterTimelineNodes(allNodes, filters).filter(
        (node) =>
            eventKinds.length === 0 ||
            (node.eventKind !== undefined && eventKinds.includes(node.eventKind))
    );
    const visible =
        showDetails ||
        eventKinds.length > 0 ||
        filters.objectKinds.length > 0 ||
        filters.identityIds.length > 0 ||
        filters.statuses.length > 0
            ? filtered
            : filtered.filter(isPrimaryNode);
    const visibleKeys = new Set(visible.map((node) => node.key));
    const nodes = groups.flatMap((group) =>
        allNodes.filter((node) => group.eventKeys.includes(node.key) && visibleKeys.has(node.key))
    );
    return (
        <section aria-label={t("panel.timeline.title")}>
            <p>{t("panel.timeline.disclaimer")}</p>
            <label className={styles.detailToggle}>
                <input
                    type="checkbox"
                    checked={showDetails}
                    onChange={(event) => setShowDetails(event.target.checked)}
                />
                {t("panel.timeline.showDetails")}
            </label>
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
    const latestVisibleKey = nodes
        .filter((node) => !filters.collapsedLanes.includes(node.lane))
        .reduce<TimelineNode | undefined>(
            (latest, node) =>
                latest === undefined ||
                node.time > latest.time ||
                (node.time === latest.time && (node.eventSeq ?? 0) >= (latest.eventSeq ?? 0))
                    ? node
                    : latest,
            undefined
        )?.key;
    const dateFormatter = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "medium"
    });
    const nodeRefs = useRef(new Map<string, HTMLElement>());
    const [activeKey, setActiveKey] = useState(
        nodes.find((node) => !filters.collapsedLanes.includes(node.lane))?.key
    );
    const [focusMissing, setFocusMissing] = useState(false);
    const consumedFocus = useRef<MeetingFocusTarget | undefined>(undefined);
    useEffect(() => {
        if (viewportRef.current) {
            viewportRef.current.scrollTop = 0;
        }
    }, [viewportRevision]);
    useEffect(() => {
        if (
            activeKey &&
            nodes.some(
                (node) => node.key === activeKey && !filters.collapsedLanes.includes(node.lane)
            )
        ) {
            return;
        }
        setActiveKey(nodes.find((node) => !filters.collapsedLanes.includes(node.lane))?.key);
    }, [nodes, filters.collapsedLanes, activeKey]);
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
        if (filters.collapsedLanes.includes(target.lane)) {
            onFiltersChange({
                ...filters,
                collapsedLanes: filters.collapsedLanes.filter((lane) => lane !== target.lane)
            });
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
    const collapsed = filters.collapsedLanes;
    const blocks = groups
        .map((group) => ({
            group,
            nodes: nodes.filter((node) => group.eventKeys.includes(node.key))
        }))
        .filter((block) => block.nodes.some((node) => !collapsed.includes(node.lane)));
    let alternatingIndex = 0;
    return (
        <div>
            {focusMissing ? <p role="status">{t("panel.state.focusMissing")}</p> : null}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                    (latestVisibleKey === undefined
                        ? undefined
                        : nodeRefs.current.get(latestVisibleKey)
                    )?.scrollIntoView?.({ block: "nearest", inline: "end" })
                }
            >
                {t("panel.timeline.latest")}
            </Button>
            <div
                ref={viewportRef}
                aria-label={t("panel.timeline.aria.viewport")}
                className={styles.viewport}
            >
                <div className={styles.roles}>
                    {lanes.map((lane) => (
                        <Button
                            key={lane}
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`${t(collapsed.includes(lane) ? "panel.timeline.expand" : "panel.timeline.collapse")} ${t(`panel.timeline.lane.${lane}` as MeetingLocaleKey)}`}
                            onClick={() =>
                                onFiltersChange({
                                    ...filters,
                                    collapsedLanes: collapsed.includes(lane)
                                        ? collapsed.filter((value) => value !== lane)
                                        : [...collapsed, lane]
                                })
                            }
                            aria-pressed={collapsed.includes(lane)}
                        >
                            {t(`panel.timeline.lane.${lane}` as MeetingLocaleKey)}
                        </Button>
                    ))}
                </div>
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
                            {members
                                .filter((node) => !collapsed.includes(node.lane))
                                .map((node, index) => {
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
                                            hidden={collapsed.includes(node.lane)}
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
                                                    direction,
                                                    collapsedLanes: collapsed
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
