import { createElement, type ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.js";
import { zh, type MeetingLocaleKey, type MeetingTranslate } from "./locales.js";
import {
    buildTimelineNodes,
    resolveTimelineNodeContent,
    type TimelineNode
} from "./meeting-timeline-projection.js";
import type { TimelineFilterState, TimelineLane } from "./meeting-workspace-state.js";

export interface TimelineProps {
    detail: MeetingView;
    filters: TimelineFilterState;
    viewportRevision: number;
    t: MeetingTranslate;
    onFiltersChange(filters: TimelineFilterState): void;
}

const lanes: readonly TimelineLane[] = ["captain", "manager", "contributor", "reviewer", "system"];

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

export function MeetingPanelTimeline({ detail, t }: TimelineProps): ReactElement {
    const unavailable =
        detail.lifecycle.status === "archived" && detail.archive?.status !== "complete";
    if (unavailable) return createElement("p", null, t("panel.state.archiveUnavailable"));
    const nodes = buildTimelineNodes(detail);
    const minWidth = 160 + nodes.length * 220 + Math.max(nodes.length - 1, 0) * 12;
    return createElement(
        "section",
        { "aria-label": t("panel.timeline.title") },
        createElement("p", null, t("panel.timeline.disclaimer")),
        nodes.length === 0 ? createElement("p", null, t("panel.timeline.empty")) : null,
        createElement(
            "div",
            {
                "aria-label": t("panel.timeline.aria.viewport"),
                style: { overflowX: "auto", maxWidth: "100%" }
            },
            createElement(
                "div",
                {
                    style: {
                        display: "grid",
                        gridTemplateColumns: `160px repeat(${nodes.length}, 220px)`,
                        gridTemplateRows: "repeat(5, minmax(100px, auto))",
                        columnGap: 12,
                        minWidth
                    }
                },
                ...lanes.map((lane, index) =>
                    createElement(
                        "div",
                        {
                            key: lane,
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
                            "data-testid": "timeline-node",
                            "data-node-key": node.key,
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
