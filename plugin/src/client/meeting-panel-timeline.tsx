import { createElement, useEffect, useRef, type ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.js";
import { zh, type MeetingLocaleKey, type MeetingTranslate } from "./locales.js";
import {
    buildTimelineNodes,
    filterTimelineNodes,
    resolveTimelineNodeContent,
    type TimelineNode
} from "./meeting-timeline-projection.js";
import type {
    TimelineFilterState,
    TimelineLane,
    TimelineObjectRef,
    TimelineZoom
} from "./meeting-workspace-state.js";

export interface TimelineProps {
    detail: MeetingView;
    filters: TimelineFilterState;
    viewportRevision: number;
    t: MeetingTranslate;
    onFiltersChange(filters: TimelineFilterState): void;
}

export interface TimelineFiltersProps {
    nodes: readonly TimelineNode[];
    filters: TimelineFilterState;
    t: MeetingTranslate;
    onChange(filters: TimelineFilterState): void;
}

export interface TimelineViewportProps extends TimelineProps {
    nodes: readonly TimelineNode[];
}

const lanes: readonly TimelineLane[] = ["captain", "manager", "contributor", "reviewer", "system"];
const zoomLevels: readonly TimelineZoom[] = [0.75, 1, 1.25, 1.5, 1.75, 2];

function label(key: string, fallback: string, t: MeetingTranslate): string {
    const localeKey = key as MeetingLocaleKey;
    return Object.hasOwn(zh, localeKey) ? t(localeKey) : fallback;
}

function identityName(detail: MeetingView, node: TimelineNode): string {
    if (!node.identityId) return "";
    const identity =
        detail.lifecycle.status === "archived"
            ? detail.archive?.identityProvenance.find((item) => item.identityId === node.identityId)
            : detail.identities.find((item) => item.id === node.identityId);
    return identity?.displayName ?? node.identityId;
}

function toggle(values: readonly string[], value: string): string[] {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function filterGroup(
    title: string,
    values: readonly string[],
    selected: readonly string[],
    display: (value: string) => string,
    onToggle: (value: string) => void
): ReactElement {
    return createElement(
        "fieldset",
        null,
        createElement("legend", null, title),
        ...values.map((value) =>
            createElement(
                "button",
                {
                    key: value,
                    type: "button",
                    "aria-pressed": selected.includes(value),
                    onClick: () => onToggle(value)
                },
                display(value)
            )
        )
    );
}

export function TimelineFilters({
    nodes,
    filters,
    t,
    onChange
}: TimelineFiltersProps): ReactElement {
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
    return createElement(
        "div",
        null,
        filterGroup(
            t("panel.timeline.filter.identity"),
            identities,
            filters.identityIds,
            (id) => {
                const lane = nodes.find((node) => node.identityId === id)?.lane ?? "system";
                return `${t(`panel.timeline.lane.${lane}` as MeetingLocaleKey)}: ${id}`;
            },
            (id) => onChange({ ...filters, identityIds: toggle(filters.identityIds, id) })
        ),
        filterGroup(
            t("panel.timeline.filter.type"),
            kinds,
            filters.objectKinds,
            (kind) => label(`enum.timelineKind.${kind}`, kind, t),
            (kind) => onChange({ ...filters, objectKinds: toggle(filters.objectKinds, kind) })
        ),
        filterGroup(
            t("panel.timeline.filter.status"),
            statuses,
            filters.statuses,
            (status) => status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " "),
            (status) => onChange({ ...filters, statuses: toggle(filters.statuses, status) })
        ),
        filterGroup(
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
        ),
        createElement(
            "button",
            {
                type: "button",
                onClick: () =>
                    onChange({
                        ...filters,
                        identityIds: [],
                        objectKinds: [],
                        statuses: [],
                        relatedObjects: []
                    })
            },
            t("panel.timeline.filter.clear")
        )
    );
}

export function MeetingPanelTimeline(props: TimelineProps): ReactElement {
    const { detail, filters, t, onFiltersChange } = props;
    if (detail.lifecycle.status === "archived" && detail.archive?.status !== "complete")
        return createElement("p", null, t("panel.state.archiveUnavailable"));
    const allNodes = buildTimelineNodes(detail);
    const nodes = filterTimelineNodes(allNodes, filters);
    return createElement(
        "section",
        { "aria-label": t("panel.timeline.title") },
        createElement("p", null, t("panel.timeline.disclaimer")),
        createElement(TimelineFilters, { nodes: allNodes, filters, t, onChange: onFiltersChange }),
        nodes.length === 0 ? createElement("p", null, t("panel.timeline.empty")) : null,
        createElement(TimelineViewport, { ...props, nodes })
    );
}

export function TimelineViewport({
    detail,
    nodes,
    filters,
    viewportRevision,
    t,
    onFiltersChange
}: TimelineViewportProps): ReactElement {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const latestRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (viewportRef.current) viewportRef.current.scrollLeft = 0;
    }, [viewportRevision]);
    const zoomIndex = zoomLevels.indexOf(filters.zoom);
    const gap = 12 * filters.zoom;
    const minWidth = 160 + nodes.length * 220 + Math.max(nodes.length - 1, 0) * gap;
    const changeZoom = (delta: number) =>
        onFiltersChange({ ...filters, zoom: zoomLevels[zoomIndex + delta]! });
    const collapsed = filters.collapsedLanes;
    return createElement(
        "div",
        null,
        createElement(
            "button",
            {
                type: "button",
                disabled: zoomIndex === zoomLevels.length - 1,
                onClick: () => changeZoom(1)
            },
            t("panel.timeline.zoomIn")
        ),
        createElement(
            "button",
            { type: "button", disabled: zoomIndex === 0, onClick: () => changeZoom(-1) },
            t("panel.timeline.zoomOut")
        ),
        createElement(
            "button",
            {
                type: "button",
                onClick: () =>
                    latestRef.current?.scrollIntoView?.({ block: "nearest", inline: "end" })
            },
            t("panel.timeline.latest")
        ),
        createElement(
            "div",
            {
                ref: viewportRef,
                "aria-label": t("panel.timeline.aria.viewport"),
                style: { overflowX: "auto", maxWidth: "100%" }
            },
            createElement(
                "div",
                {
                    style: {
                        display: "grid",
                        gridTemplateColumns: `160px repeat(${nodes.length}, 220px)`,
                        gridTemplateRows: lanes
                            .map((lane) =>
                                collapsed.includes(lane) ? "40px" : "minmax(100px, auto)"
                            )
                            .join(" "),
                        columnGap: gap,
                        minWidth
                    }
                },
                ...lanes.map((lane, index) =>
                    createElement(
                        "button",
                        {
                            key: lane,
                            type: "button",
                            "aria-label": `${t(collapsed.includes(lane) ? "panel.timeline.expand" : "panel.timeline.collapse")} ${t(`panel.timeline.lane.${lane}` as MeetingLocaleKey)}`,
                            onClick: () =>
                                onFiltersChange({
                                    ...filters,
                                    collapsedLanes: collapsed.includes(lane)
                                        ? collapsed.filter((value) => value !== lane)
                                        : [...collapsed, lane]
                                }),
                            style: { gridColumn: 1, gridRow: index + 1 }
                        },
                        t(`panel.timeline.lane.${lane}` as MeetingLocaleKey)
                    )
                ),
                ...nodes.map((node, index) => {
                    const content = resolveTimelineNodeContent(detail, node);
                    const laneLabel = t(`panel.timeline.lane.${node.lane}` as MeetingLocaleKey);
                    const identity = identityName(detail, node);
                    return createElement(
                        "article",
                        {
                            key: node.key,
                            ref: index === nodes.length - 1 ? latestRef : undefined,
                            "data-testid": "timeline-node",
                            "data-node-key": node.key,
                            hidden: collapsed.includes(node.lane),
                            "aria-label": t("panel.timeline.aria.node"),
                            style: {
                                gridRow: lanes.indexOf(node.lane) + 1,
                                gridColumn: index + 2,
                                minWidth: 220
                            }
                        },
                        createElement(
                            "p",
                            null,
                            identity ? `${laneLabel}: ${identity}` : laneLabel
                        ),
                        createElement(
                            "p",
                            null,
                            label(`enum.timelineKind.${node.objectKind}`, node.objectKind, t)
                        ),
                        createElement(
                            "p",
                            null,
                            label(`enum.timelinePhase.${node.phase}`, node.phase, t)
                        ),
                        createElement(
                            "time",
                            { dateTime: new Date(node.time).toISOString() },
                            new Date(node.time).toISOString()
                        ),
                        node.status === undefined ? null : createElement("p", null, node.status),
                        content === undefined
                            ? createElement("p", null, t("panel.state.focusMissing"))
                            : createElement(
                                  "div",
                                  null,
                                  createElement("p", null, content.title),
                                  content.detail === undefined
                                      ? null
                                      : createElement("p", null, content.detail)
                              )
                    );
                })
            )
        )
    );
}
