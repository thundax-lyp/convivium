import * as React from "react";
import { useEffect, useRef, useState, type ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.js";
import { Pill } from "@deepseek-ai/dsh-client-ui-primitives";
import { knownEnum as known, type MeetingTranslate } from "./locales.js";
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

const section = (label: string, ...content: ReactElement[]): ReactElement => {
    return (
        <section aria-label={label}>
            <h4>{label}</h4>
            {content}
        </section>
    );
};

const values = (items: readonly ReactElement[], t: MeetingTranslate): ReactElement => {
    return items.length === 0 ? <p>{t("common.none")}</p> : <ul>{items}</ul>;
};

export const OverviewObjective = ({ detail, t }: SectionProps): ReactElement => {
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
        <p>{objective.statement}</p>,
        <Pill>{lifecycleLabel(detail.lifecycle.status, t)}</Pill>,
        <p>{`${t("panel.summary.version")}: ${detail.version}`}</p>,
        values(
            agenda.map((item) => (
                <li key={item.id}>{`${item.title}: ${known("agenda", item.status, t)}`}</li>
            )),
            t
        ),
        values(
            objective.requiredOutputs.map((item) => (
                <li key={item.id}>{`${item.text}: ${known("objectiveStatus", item.status, t)}`}</li>
            )),
            t
        ),
        values(
            objective.acceptanceCriteria.map((item) => (
                <li key={item.id}>{`${item.text}: ${known("objectiveStatus", item.status, t)}`}</li>
            )),
            t
        ),
        values(
            objective.hardConstraints.map((item) => (
                <li key={item.id}>{`${item.text}: ${known("objectiveStatus", item.status, t)}`}</li>
            )),
            t
        ),
        <p>{known("riskLevel", objective.acceptableRiskLevel, t)}</p>
    );
};

export const OverviewProgress = ({ detail, t }: SectionProps): ReactElement => {
    const items: ReactElement[] = [];
    for (const round of detail.rounds) {
        items.push(
            <li
                key={`round:${round.id}`}
            >{`${round.roundGoal.question}: ${known("round", round.status, t)}`}</li>
        );
        for (const contribution of round.contributions)
            items.push(
                <li
                    key={`contribution:${contribution.id}`}
                >{`${contribution.id}: ${known("contribution", contribution.status, t)}${contribution.exitReason ? `: ${contribution.exitReason}` : ""}`}</li>
            );
    }
    for (const request of detail.opportunityRequests)
        items.push(<li key={`request:${request.id}`}>{request.purpose}</li>);
    for (const plan of detail.managerPlans)
        items.push(
            <li
                key={`plan:${plan.id}`}
            >{`${known("managerPlanKind", plan.kind, t)}: ${plan.blockingReason ?? plan.rationale}`}</li>
        );
    for (const recommendation of detail.identityRecommendations ?? [])
        items.push(
            <li
                key={`recommendation:${recommendation.id}`}
            >{`${recommendation.rationale}: ${known("recommendation", recommendation.status, t)}`}</li>
        );
    for (const task of detail.tasks)
        items.push(
            <li key={`task:${task.id}`}>{`${task.title}: ${known("task", task.status, t)}`}</li>
        );
    return section(t("panel.overview.progress"), values(items, t));
};

export const OverviewOutcomes = ({ detail, t }: SectionProps): ReactElement => {
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
                ...candidates.map((item) => (
                    <li
                        key={`candidate:${item.id}`}
                    >{`${item.id}: ${known("decisionOutcome", item.outcome, t)}: ${item.rationale}`}</li>
                )),
                ...decisions.map((item) => (
                    <li
                        key={`decision:${item.id}`}
                    >{`${item.id}: ${known("decisionOutcome", item.outcome, t)}: ${known("decisionStatus", item.status, t)}: ${item.rationale}`}</li>
                )),
                ...facts.map((item) => (
                    <li
                        key={`completion:${item.id}`}
                    >{`${item.statement}: ${known("completionStatus", item.status, t)}: ${item.rationale}`}</li>
                ))
            ],
            t
        )
    );
};

export const OverviewOpenItems = ({ detail, t }: SectionProps): ReactElement => {
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
                ...questions.map((item) => (
                    <li
                        key={`question:${item.id}`}
                    >{`${item.text}: ${known("questionStatus", item.status, t)}`}</li>
                )),
                ...issues.map((item) => (
                    <li
                        key={`issue:${item.id}`}
                    >{`${item.description}: ${known("issueStatus", item.status, t)}: ${known("issueClassification", item.classification, t)}: ${item.rationale}`}</li>
                )),
                ...risks.map((item) => (
                    <li
                        key={`risk:${item.id}`}
                    >{`${known("riskAction", item.action, t)}: ${item.scope}: ${item.rationale}`}</li>
                ))
            ],
            t
        )
    );
};

export const OverviewTranscript = ({ detail, t }: SectionProps): ReactElement => {
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    return section(
        t("panel.overview.transcript"),
        values(
            [
                ...(archive?.publications ?? detail.publications).map((item) => (
                    <li
                        key={`publication:${item.id}`}
                    >{`${item.id}: ${item.exitReasons.join("; ")}`}</li>
                )),
                ...(archive?.messages ?? detail.messages).map((item) => (
                    <li key={`message:${item.id}`}>{`${item.kind}: ${item.body}`}</li>
                ))
            ],
            t
        )
    );
};

export const OverviewEvidence = ({ detail, t }: SectionProps): ReactElement => {
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
                ...versions.map((item) => (
                    <li
                        key={`version:${item.id}`}
                    >{`${item.id}: ${item.observation}: ${item.interpretation}: ${item.method}`}</li>
                )),
                ...reviews.map((item) => (
                    <li key={`review:${item.id}`}>{`${item.id}: ${item.scope}`}</li>
                )),
                ...(!archive
                    ? detail.reviewDeliveries.map((item) => (
                          <li
                              key={`delivery:${item.id}`}
                          >{`${item.id}: ${known("reviewDelivery", item.status, t)}${item.failureReason ? `: ${item.failureReason}` : ""}`}</li>
                      ))
                    : [])
            ],
            t
        )
    );
};

export const OverviewTechnical = ({ detail, t }: SectionProps): ReactElement => {
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    return section(
        t("panel.overview.technical"),
        <p>{detail.meetingId}</p>,
        archive ? (
            <p>{archive.id}</p>
        ) : (
            values(
                detail.tasks.map((item) => (
                    <li
                        key={item.id}
                    >{`${item.id}: ${item.title}: ${known("task", item.status, t)}: ${known("authorization", item.authorizationStatus, t)}${(item.result ?? item.exitReason) ? `: ${item.result ?? item.exitReason}` : ""}`}</li>
                )),
                t
            )
        )
    );
};

export const MeetingPanelOverview = (props: OverviewProps): ReactElement => {
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
    return (
        <div>
            <OverviewObjective {...props} />
            {props.detail.lifecycle.status === "archived" ? null : <OverviewProgress {...props} />}
            <OverviewOutcomes {...props} />
            <OverviewOpenItems {...props} />
            <OverviewTranscript {...props} />
            <OverviewEvidence {...props} />
            <OverviewTechnical {...props} />
            {focusMissing ? <p role="status">{t("panel.state.focusMissing")}</p> : null}
            {onLocateInTimeline ? (
                <nav aria-label={t("panel.mode.timeline")}>
                    {objects.map((node) => {
                        const name = `${t("panel.mode.timeline")}: ${known("timelineKind", node.objectKind, t)} ${node.objectId}`;
                        return (
                            <button
                                key={`${node.objectKind}:${node.objectId}`}
                                type="button"
                                aria-label={name}
                                ref={(element: HTMLButtonElement | null) => {
                                    const key = `${node.objectKind}:${node.objectId}`;
                                    if (element) buttons.current.set(key, element);
                                    else buttons.current.delete(key);
                                }}
                                onClick={() =>
                                    onLocateInTimeline({
                                        meetingId: detail.meetingId,
                                        objectKind: node.objectKind,
                                        objectId: node.objectId
                                    })
                                }
                            >
                                {name}
                            </button>
                        );
                    })}
                </nav>
            ) : null}
        </div>
    );
};
