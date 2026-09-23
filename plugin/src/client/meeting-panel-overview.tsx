import { createElement, type ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.js";
import { zh, type MeetingLocaleKey, type MeetingTranslate } from "./locales.js";
import { lifecycleLabel } from "./meeting-panel-sections.js";

export interface SectionProps {
    detail: MeetingView;
    t: MeetingTranslate;
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

export function MeetingPanelOverview(props: SectionProps): ReactElement {
    return createElement(
        "div",
        null,
        createElement(OverviewObjective, props),
        props.detail.lifecycle.status === "archived"
            ? null
            : createElement(OverviewProgress, props),
        createElement(OverviewOutcomes, props)
    );
}
