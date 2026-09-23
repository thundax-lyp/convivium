import { createElement, useEffect, useRef, useState, type ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.js";
import { zh, type MeetingLocaleKey, type MeetingTranslate } from "./locales.js";
import { lifecycleLabel } from "./meeting-panel-sections.js";
import { buildTimelineNodes } from "./meeting-timeline-projection.js";
import type { MeetingFocusTarget } from "./meeting-workspace-state.js";

export interface SectionProps {
    detail: MeetingView;
    t: MeetingTranslate;
}

export interface OverviewProps extends SectionProps {
    focusTarget?: MeetingFocusTarget;
    onFocusConsumed?(): void;
    onLocateInTimeline?(target: MeetingFocusTarget): void;
}

function section(label: string, ...content: ReactElement[]): ReactElement {
    return createElement(
        "section",
        { "aria-label": label },
        createElement("h4", null, label),
        ...content
    );
}

function values(items: readonly ReactElement[], t: MeetingTranslate): ReactElement {
    return items.length === 0
        ? createElement("p", null, t("common.none"))
        : createElement("ul", null, ...items);
}

function known(group: string, value: string, t: MeetingTranslate): string {
    const key = `enum.${group}.${value}` as MeetingLocaleKey;
    return Object.hasOwn(zh, key) ? t(key) : value;
}

export function OverviewObjective({ detail, t }: SectionProps): ReactElement {
    const objective =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive.objective
            : detail.objective;
    const agenda =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive.agenda
            : detail.agenda;
    return section(
        t("panel.overview.objective"),
        createElement("p", null, objective.statement),
        createElement("p", null, lifecycleLabel(detail.lifecycle.status, t)),
        createElement("p", null, `${t("panel.summary.version")}: ${detail.version}`),
        values(
            agenda.map((item) =>
                createElement(
                    "li",
                    { key: item.id },
                    `${item.title}: ${known("agenda", item.status, t)}`
                )
            ),
            t
        ),
        values(
            objective.requiredOutputs.map((item) =>
                createElement("li", { key: item.id }, `${item.text}: ${item.status}`)
            ),
            t
        ),
        values(
            objective.acceptanceCriteria.map((item) =>
                createElement("li", { key: item.id }, `${item.text}: ${item.status}`)
            ),
            t
        ),
        values(
            objective.hardConstraints.map((item) =>
                createElement("li", { key: item.id }, `${item.text}: ${item.status}`)
            ),
            t
        ),
        createElement("p", null, objective.acceptableRiskLevel)
    );
}

export function OverviewProgress({ detail, t }: SectionProps): ReactElement {
    const items: ReactElement[] = [];
    for (const round of detail.rounds) {
        items.push(
            createElement(
                "li",
                { key: `round:${round.id}` },
                `${round.roundGoal.question}: ${known("round", round.status, t)}`
            )
        );
        for (const contribution of round.contributions)
            items.push(
                createElement(
                    "li",
                    { key: `contribution:${contribution.id}` },
                    `${contribution.id}: ${known("contribution", contribution.status, t)}${contribution.exitReason ? `: ${contribution.exitReason}` : ""}`
                )
            );
    }
    for (const request of detail.opportunityRequests)
        items.push(createElement("li", { key: `request:${request.id}` }, request.purpose));
    for (const plan of detail.managerPlans)
        items.push(
            createElement(
                "li",
                { key: `plan:${plan.id}` },
                `${plan.kind}: ${plan.blockingReason ?? plan.rationale}`
            )
        );
    for (const recommendation of detail.identityRecommendations ?? [])
        items.push(
            createElement(
                "li",
                { key: `recommendation:${recommendation.id}` },
                `${recommendation.rationale}: ${known("recommendation", recommendation.status, t)}`
            )
        );
    for (const task of detail.tasks)
        items.push(
            createElement(
                "li",
                { key: `task:${task.id}` },
                `${task.title}: ${known("task", task.status, t)}`
            )
        );
    return section(t("panel.overview.progress"), values(items, t));
}

export function OverviewOutcomes({ detail, t }: SectionProps): ReactElement {
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    const candidates =
        archive?.decisionCandidates ?? detail.outcomes.pendingDecisionCandidates ?? [];
    const decisions = archive?.decisions ?? detail.outcomes.decisions;
    const facts = archive?.completionFacts ?? detail.outcomes.completionFacts;
    return section(
        t("panel.overview.outcomes"),
        values(
            [
                ...candidates.map((item) =>
                    createElement(
                        "li",
                        { key: `candidate:${item.id}` },
                        `${item.id}: ${known("decisionOutcome", item.outcome, t)}: ${item.rationale}`
                    )
                ),
                ...decisions.map((item) =>
                    createElement(
                        "li",
                        { key: `decision:${item.id}` },
                        `${item.id}: ${known("decisionOutcome", item.outcome, t)}: ${known("decisionStatus", item.status, t)}: ${item.rationale}`
                    )
                ),
                ...facts.map((item) =>
                    createElement(
                        "li",
                        { key: `completion:${item.id}` },
                        `${item.statement}: ${known("completionStatus", item.status, t)}: ${item.rationale}`
                    )
                )
            ],
            t
        )
    );
}

export function OverviewOpenItems({ detail, t }: SectionProps): ReactElement {
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    const questions = archive?.questions ?? detail.questions;
    const issues = archive?.issues ?? detail.issues;
    const risks = archive?.riskDispositions ?? detail.outcomes.riskDispositions;
    return section(
        t("panel.overview.openItems"),
        values(
            [
                ...questions.map((item) =>
                    createElement(
                        "li",
                        { key: `question:${item.id}` },
                        `${item.text}: ${known("questionStatus", item.status, t)}`
                    )
                ),
                ...issues.map((item) =>
                    createElement(
                        "li",
                        { key: `issue:${item.id}` },
                        `${item.description}: ${known("issueStatus", item.status, t)}: ${known("issueClassification", item.classification, t)}: ${item.rationale}`
                    )
                ),
                ...risks.map((item) =>
                    createElement(
                        "li",
                        { key: `risk:${item.id}` },
                        `${known("riskAction", item.action, t)}: ${item.scope}: ${item.rationale}`
                    )
                )
            ],
            t
        )
    );
}

export function OverviewTranscript({ detail, t }: SectionProps): ReactElement {
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    return section(
        t("panel.overview.transcript"),
        values(
            [
                ...(archive?.publications ?? detail.publications).map((item) =>
                    createElement(
                        "li",
                        { key: `publication:${item.id}` },
                        `${item.id}: ${item.exitReasons.join("; ")}`
                    )
                ),
                ...(archive?.messages ?? detail.messages).map((item) =>
                    createElement("li", { key: `message:${item.id}` }, `${item.kind}: ${item.body}`)
                )
            ],
            t
        )
    );
}

export function OverviewEvidence({ detail, t }: SectionProps): ReactElement {
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    const versions = archive
        ? archive.evidenceBundles.map((bundle) => bundle.version)
        : detail.evidencePackages.map((pkg) => pkg.currentVersion);
    const reviews = archive
        ? archive.evidenceBundles.map((bundle) => bundle.review)
        : detail.evidenceReviews;
    return section(
        t("panel.overview.evidence"),
        values(
            [
                ...versions.map((item) =>
                    createElement(
                        "li",
                        { key: `version:${item.id}` },
                        `${item.id}: ${item.observation}: ${item.interpretation}: ${item.method}`
                    )
                ),
                ...reviews.map((item) =>
                    createElement("li", { key: `review:${item.id}` }, `${item.id}: ${item.scope}`)
                ),
                ...(!archive
                    ? detail.reviewDeliveries.map((item) =>
                          createElement(
                              "li",
                              { key: `delivery:${item.id}` },
                              `${item.id}: ${known("reviewDelivery", item.status, t)}${item.failureReason ? `: ${item.failureReason}` : ""}`
                          )
                      )
                    : [])
            ],
            t
        )
    );
}

export function OverviewTechnical({ detail, t }: SectionProps): ReactElement {
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    return section(
        t("panel.overview.technical"),
        createElement("p", null, detail.meetingId),
        archive
            ? createElement("p", null, archive.id)
            : values(
                  detail.tasks.map((item) =>
                      createElement(
                          "li",
                          { key: item.id },
                          `${item.id}: ${item.title}: ${known("task", item.status, t)}: ${known("authorization", item.authorizationStatus, t)}${(item.result ?? item.exitReason) ? `: ${item.result ?? item.exitReason}` : ""}`
                      )
                  ),
                  t
              )
    );
}

export function MeetingPanelOverview(props: OverviewProps): ReactElement {
    const { detail, t, focusTarget, onFocusConsumed, onLocateInTimeline } = props;
    const buttons = useRef(new Map<string, HTMLButtonElement>());
    const [focusMissing, setFocusMissing] = useState(false);
    const objects = [
        ...new Map(
            buildTimelineNodes(detail).map(
                (node) => [`${node.objectKind}:${node.objectId}`, node] as const
            )
        ).values()
    ];
    useEffect(() => {
        if (!focusTarget) return;
        const button =
            focusTarget.meetingId === detail.meetingId
                ? buttons.current.get(`${focusTarget.objectKind}:${focusTarget.objectId}`)
                : undefined;
        if (!button) setFocusMissing(true);
        else {
            setFocusMissing(false);
            button.scrollIntoView?.({ block: "nearest", inline: "center" });
            button.focus();
        }
        onFocusConsumed?.();
    }, [focusTarget, detail.meetingId, onFocusConsumed]);
    return createElement(
        "div",
        null,
        createElement(OverviewObjective, props),
        props.detail.lifecycle.status === "archived"
            ? null
            : createElement(OverviewProgress, props),
        createElement(OverviewOutcomes, props),
        createElement(OverviewOpenItems, props),
        createElement(OverviewTranscript, props),
        createElement(OverviewEvidence, props),
        createElement(OverviewTechnical, props),
        focusMissing ? createElement("p", { role: "status" }, t("panel.state.focusMissing")) : null,
        onLocateInTimeline
            ? createElement(
                  "nav",
                  { "aria-label": t("panel.mode.timeline") },
                  ...objects.map((node) => {
                      const name = `${t("panel.mode.timeline")}: ${known("timelineKind", node.objectKind, t)} ${node.objectId}`;
                      return createElement(
                          "button",
                          {
                              key: `${node.objectKind}:${node.objectId}`,
                              type: "button",
                              "aria-label": name,
                              ref: (element: HTMLButtonElement | null) => {
                                  const key = `${node.objectKind}:${node.objectId}`;
                                  if (element) buttons.current.set(key, element);
                                  else buttons.current.delete(key);
                              },
                              onClick: () =>
                                  onLocateInTimeline({
                                      meetingId: detail.meetingId,
                                      objectKind: node.objectKind,
                                      objectId: node.objectId
                                  })
                          },
                          name
                      );
                  })
              )
            : null
    );
}
