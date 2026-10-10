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
    type TimelineNode
} from "./projection.ts";
import type {
    MeetingFocusTarget,
    TimelineFilterState,
    TimelineLane,
    TimelineObjectRef,
    TimelineZoom
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
    nodes: readonly TimelineNode[];
    filters: TimelineFilterState;
    onChange(filters: TimelineFilterState): void;
}

export interface TimelineViewportProps extends TimelineProps {
    nodes: readonly TimelineNode[];
}

const lanes: readonly TimelineLane[] = ["captain", "manager", "contributor", "reviewer", "system"];

const zoomLevels: readonly TimelineZoom[] = [0.75, 1, 1.25, 1.5, 1.75, 2];

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
    return identity?.displayName ?? node.identityId;
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
    nodes,
    filters,
    onChange
}: TimelineFiltersProps): ReactElement => {
    const t = useMeetingTranslate();
    const identities = [
        ...new Set(nodes.flatMap((node) => (node.identityId ? [node.identityId] : [])))
    ];
    const kinds = [...new Set(nodes.map((node) => node.objectKind))];
    const statuses = [...new Set(nodes.flatMap((node) => (node.status ? [node.status] : [])))];
    const refs = [
        ...new Map(
            nodes
                .flatMap((node) => node.relatedObjects)
                .map((ref) => [`${ref.objectKind}:${ref.objectId}`, ref] as const)
        ).values()
    ];
    const refKey = (ref: TimelineObjectRef) => `${ref.objectKind}:${ref.objectId}`;
    return (
        <div>
            {filterGroup(
                t("panel.timeline.filter.identity"),
                identities,
                filters.identityIds,
                (id) => {
                    const lane = nodes.find((node) => node.identityId === id)?.lane ?? "system";
                    return `${t(`panel.timeline.lane.${lane}` as MeetingLocaleKey)}: ${id}`;
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
            {filterGroup(
                t("panel.timeline.filter.related"),
                refs.map(refKey),
                filters.relatedObjects.map(refKey),
                (key) => {
                    const ref = refs.find((item) => refKey(item) === key)!;
                    return `${label(`enum.timelineKind.${ref.objectKind}`, ref.objectKind, t)}: ${ref.objectId}`;
                },
                (key) => {
                    const keys = toggle(filters.relatedObjects.map(refKey), key);
                    onChange({
                        ...filters,
                        relatedObjects: refs.filter((ref) => keys.includes(refKey(ref)))
                    });
                }
            )}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                    onChange({
                        ...filters,
                        identityIds: [],
                        objectKinds: [],
                        statuses: [],
                        relatedObjects: []
                    })
                }
            >
                {t("panel.timeline.filter.clear")}
            </Button>
        </div>
    );
};

const isPrimaryNode = (node: TimelineNode): boolean => {
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
    return node.phase === "aborted" || node.status === "failed" || node.status === "blocked"
        ? "warning"
        : "normal";
};

export const MeetingPanelTimeline = (props: TimelineProps): ReactElement => {
    const { detail, filters, onFiltersChange } = props;
    const t = useMeetingTranslate();
    const [showDetails, setShowDetails] = useState(false);
    useEffect(() => setShowDetails(false), [detail.meetingId]);
    if (detail.lifecycle.status === "archived" && detail.archive?.status !== "complete") {
        return <p>{t("panel.state.archiveUnavailable")}</p>;
    }
    const allNodes = buildTimelineNodes(detail);
    const filtered = filterTimelineNodes(allNodes, filters);
    const nodes =
        showDetails ||
        filters.objectKinds.length > 0 ||
        filters.identityIds.length > 0 ||
        filters.statuses.length > 0 ||
        filters.relatedObjects.length > 0
            ? filtered
            : filtered.filter(isPrimaryNode);
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
            <TimelineFilters nodes={allNodes} filters={filters} onChange={onFiltersChange} />
            {nodes.length === 0 ? <p>{t("panel.timeline.empty")}</p> : null}
            <TimelineViewport {...props} nodes={nodes} />
        </section>
    );
};

export const TimelineViewport = ({
    detail,
    nodes,
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
        .at(-1)?.key;
    const dateFormatter = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "medium"
    });
    const nodeRefs = useRef(new Map<string, HTMLElement>());
    const [activeKey, setActiveKey] = useState(
        nodes.find((node) => !filters.collapsedLanes.includes(node.lane))?.key
    );
    const [focusMissing, setFocusMissing] = useState(false);
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
        const target = matches.at(-1);
        if (!target) {
            setFocusMissing(true);
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
            onFocusConsumed?.();
            return;
        }
        setFocusMissing(false);
        setActiveKey(target.key);
        element.scrollIntoView?.({ block: "nearest", inline: "center" });
        element.focus();
        onFocusConsumed?.();
    }, [focusTarget, nodes, filters, detail.meetingId, onFocusConsumed, onFiltersChange]);
    const zoomIndex = zoomLevels.indexOf(filters.zoom);
    const changeZoom = (delta: number) =>
        onFiltersChange({ ...filters, zoom: zoomLevels[zoomIndex + delta]! });
    const collapsed = filters.collapsedLanes;
    let alternatingIndex = 0;
    return (
        <div>
            {focusMissing ? <p role="status">{t("panel.state.focusMissing")}</p> : null}
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={zoomIndex === zoomLevels.length - 1}
                onClick={() => changeZoom(1)}
            >
                {t("panel.timeline.zoomIn")}
            </Button>
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={zoomIndex === 0}
                onClick={() => changeZoom(-1)}
            >
                {t("panel.timeline.zoomOut")}
            </Button>
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
                <div
                    className={styles.grid}
                    style={
                        {
                            "--meeting-timeline-gap": `${20 * filters.zoom}px`
                        } as React.CSSProperties
                    }
                >
                    {nodes
                        .filter((node) => !collapsed.includes(node.lane))
                        .map((node, index) => {
                            const side =
                                node.objectKind === "round" && node.phase === "opened"
                                    ? "left"
                                    : alternatingIndex++ % 2 === 0
                                      ? "left"
                                      : "right";
                            const content = resolveTimelineNodeContent(detail, node);
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
                                        label(`enum.timelinePhase.${node.phase}`, node.phase, t),
                                        dateFormatter.format(new Date(node.time)),
                                        statusLabel(node, t)
                                    ]
                                        .filter(Boolean)
                                        .join("; ")}
                                    className={styles.node}
                                >
                                    <p>{identity ? `${laneLabel}: ${identity}` : laneLabel}</p>
                                    <p>
                                        {label(
                                            `enum.timelineKind.${node.objectKind}`,
                                            node.objectKind,
                                            t
                                        )}
                                    </p>
                                    <p>
                                        {label(`enum.timelinePhase.${node.phase}`, node.phase, t)}
                                    </p>
                                    <time dateTime={new Date(node.time).toISOString()}>
                                        {dateFormatter.format(new Date(node.time))}
                                    </time>
                                    {node.status === undefined ? null : (
                                        <p>{statusLabel(node, t)}</p>
                                    )}
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
                                                text={contentTitle(node, content.title, t)}
                                                maxLines={3}
                                            />
                                            {content.detail === undefined ? null : (
                                                <details>
                                                    <summary>{t("panel.timeline.details")}</summary>
                                                    <p>
                                                        {node.objectKind ===
                                                        "identity_recommendation"
                                                            ? knownEnum(
                                                                  "recommendation",
                                                                  content.detail,
                                                                  t
                                                              )
                                                            : content.detail}
                                                    </p>
                                                </details>
                                            )}
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                </div>
            </div>
        </div>
    );
};
