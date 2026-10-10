import * as React from "react";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { Ellipsis, List, ListItem } from "@/client/meeting/components/index.ts";
import { knownEnum as known } from "@/client/meeting/shared/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { buildTimelineNodes } from "@/client/meeting/regions/workspace/timeline/index.ts";
import type { MeetingFocusTarget } from "@/client/meeting/shared/index.ts";
import styles from "./overview.module.css";

interface SectionProps {
    detail: MeetingView;
}

interface OverviewProps extends SectionProps {
    focusTarget?: MeetingFocusTarget;
    onFocusConsumed?(): void;
    onLocateInTimeline?(target: MeetingFocusTarget): void;
}

const Section = ({
    label,
    children,
    focusKey
}: {
    label: string;
    children: ReactNode;
    focusKey?: string;
}): ReactElement => {
    return (
        <section
            aria-label={label}
            data-overview-key={focusKey}
            tabIndex={focusKey ? -1 : undefined}
        >
            <h4>{label}</h4>
            {children}
        </section>
    );
};

const overviewKey = (kind: string, id: string): string => `${kind}:${id}`;

const agendaStatusIcon: Record<MeetingView["agenda"][number]["status"], string> = {
    pending: "⏳",
    active: "👉",
    blocked: "⚠️",
    completed: "✅",
    deferred: "⏸️",
    closed: "⏹️"
};

const objectiveStatusIcon: Record<
    | MeetingView["objective"]["requiredOutputs"][number]["status"]
    | MeetingView["objective"]["hardConstraints"][number]["status"],
    string
> = {
    pending: "⏳",
    satisfied: "✅",
    unsatisfied: "❌",
    violated: "❌"
};

const OverviewItem = ({
    kind,
    id,
    text,
    sign,
    maxLines,
    accessibleLabel
}: {
    kind: string;
    id: string;
    text: string;
    sign: ReactNode;
    maxLines?: number;
    accessibleLabel?: string;
}): ReactElement => (
    <ListItem
        className={styles.item}
        data-overview-key={overviewKey(kind, id)}
        tabIndex={-1}
        accessibleLabel={accessibleLabel}
    >
        <span className={styles.sign} aria-hidden="true">
            {sign}
        </span>
        <Ellipsis text={text} maxLines={maxLines} />
    </ListItem>
);

const OverviewObjective = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const archived =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete";
    const objective = archived ? detail.archive!.objective : detail.objective;
    const agenda = archived ? detail.archive!.agenda : detail.agenda;
    const objectiveItem = (
        item:
            | MeetingView["objective"]["requiredOutputs"][number]
            | MeetingView["objective"]["hardConstraints"][number]
    ): ReactElement => {
        const unclosed = archived && item.status === "pending";
        const status = unclosed
            ? t("panel.overview.unclosedAtTermination")
            : known("objectiveStatus", item.status, t);
        return (
            <OverviewItem
                key={item.id}
                kind="objective"
                id={item.id}
                accessibleLabel={`${item.text}: ${status}`}
                sign={`${unclosed ? "⚠️" : objectiveStatusIcon[item.status]}`}
                text={item.text}
            />
        );
    };
    return (
        <Section
            label={t("panel.overview.objective")}
            focusKey={overviewKey("lifecycle", detail.meetingId)}
        >
            <List
                items={agenda.map((item) => {
                    const unclosed = archived && ["active", "pending"].includes(item.status);
                    const status = unclosed
                        ? t("panel.overview.unclosedAtTermination")
                        : known("agenda", item.status, t);
                    return (
                        <OverviewItem
                            key={item.id}
                            kind="agenda"
                            id={item.id}
                            accessibleLabel={`${item.title}: ${status}`}
                            sign={`${unclosed ? "⚠️" : agendaStatusIcon[item.status]} ${status}`}
                            text={item.title}
                        />
                    );
                })}
            />
            <List items={objective.requiredOutputs.map(objectiveItem)} />
            <List items={objective.acceptanceCriteria.map(objectiveItem)} />
            <List items={objective.hardConstraints.map(objectiveItem)} />
        </Section>
    );
};

const OverviewProgress = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const items: ReactElement[] = [];
    for (const round of detail.rounds) {
        items.push(
            <OverviewItem
                key={overviewKey("round", round.id)}
                kind="round"
                id={round.id}
                sign="•"
                text={`${round.roundGoal.question}: ${known("round", round.status, t)}`}
            />
        );
        for (const contributorId of round.invitedContributorIds ?? []) {
            const response = round.participationResponses?.find(
                (item) => item.contributorId === contributorId
            );
            items.push(
                <OverviewItem
                    key={`participation:${round.id}:${contributorId}`}
                    kind="participation"
                    id={`${round.id}:${contributorId}`}
                    sign="•"
                    text={`${contributorId}: ${t(
                        response
                            ? `enum.participation.${response.status}`
                            : "enum.participation.pending"
                    )}`}
                />
            );
        }
        for (const contribution of round.contributions) {
            items.push(
                <OverviewItem
                    key={`contribution:${contribution.id}`}
                    kind="contribution"
                    id={contribution.id}
                    sign="•"
                    text={`${contribution.id}: ${known("contribution", contribution.status, t)}${contribution.exitReason ? `: ${contribution.exitReason}` : ""}`}
                />
            );
        }
    }
    for (const request of detail.opportunityRequests) {
        items.push(
            <OverviewItem
                key={overviewKey("opportunity_request", request.id)}
                kind="opportunity_request"
                id={request.id}
                sign="•"
                text={request.purpose}
            />
        );
    }
    for (const plan of detail.managerPlans) {
        items.push(
            <OverviewItem
                key={overviewKey("manager_plan", plan.id)}
                kind="manager_plan"
                id={plan.id}
                sign="•"
                text={`${known("managerPlanKind", plan.kind, t)}: ${plan.blockingReason ?? plan.rationale}`}
            />
        );
    }
    for (const recommendation of detail.identityRecommendations ?? []) {
        items.push(
            <OverviewItem
                key={overviewKey("identity_recommendation", recommendation.id)}
                kind="identity_recommendation"
                id={recommendation.id}
                sign="•"
                text={`${recommendation.rationale}: ${known("recommendation", recommendation.status, t)}`}
            />
        );
    }
    for (const task of detail.tasks) {
        items.push(
            <OverviewItem
                key={overviewKey("task", task.id)}
                kind="task"
                id={task.id}
                sign="•"
                text={`${task.title}: ${known("task", task.status, t)}`}
            />
        );
    }
    return (
        <Section label={t("panel.overview.progress")}>
            <List items={items} />
        </Section>
    );
};

const OverviewOutcomes = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    const candidates =
        archive?.decisionCandidates ?? detail.outcomes.pendingDecisionCandidates ?? [];
    const decisions = archive?.decisions ?? detail.outcomes.decisions;
    const facts = archive?.completionFacts ?? detail.outcomes.completionFacts;
    return (
        <Section label={t("panel.overview.outcomes")}>
            <List
                items={[
                    ...candidates.map((item) => (
                        <OverviewItem
                            key={overviewKey("decision_candidate", item.id)}
                            kind="decision_candidate"
                            id={item.id}
                            sign="🔵"
                            text={`${item.id}: ${known("decisionOutcome", item.outcome, t)}: ${item.rationale}`}
                        />
                    )),
                    ...decisions.map((item) => (
                        <OverviewItem
                            key={overviewKey("decision", item.id)}
                            kind="decision"
                            id={item.id}
                            sign="🔵"
                            text={`${item.id}: ${known("decisionOutcome", item.outcome, t)}: ${known("decisionStatus", item.status, t)}: ${item.rationale}`}
                        />
                    )),
                    ...facts.map((item) => (
                        <OverviewItem
                            key={overviewKey("completion_fact", item.id)}
                            kind="completion_fact"
                            id={item.id}
                            sign="🔵"
                            text={`${item.statement}: ${known("completionStatus", item.status, t)}: ${item.rationale}`}
                        />
                    ))
                ]}
            />
        </Section>
    );
};

const OverviewOpenItems = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    const questions = archive?.questions ?? detail.questions;
    const issues = archive?.issues ?? detail.issues;
    const risks = archive?.riskDispositions ?? detail.outcomes.riskDispositions;
    return (
        <Section label={t("panel.overview.openItems")}>
            <List
                items={[
                    ...questions.map((item) => (
                        <OverviewItem
                            key={overviewKey("question", item.id)}
                            kind="question"
                            id={item.id}
                            sign="🔘"
                            text={`${item.text}: ${known("questionStatus", item.status, t)}`}
                        />
                    )),
                    ...issues.map((item) => (
                        <OverviewItem
                            key={overviewKey("issue", item.id)}
                            kind="issue"
                            id={item.id}
                            sign="🔘"
                            text={`${item.description}: ${known("issueStatus", item.status, t)}: ${known("issueClassification", item.classification, t)}: ${item.rationale}`}
                        />
                    )),
                    ...risks.map((item) => (
                        <OverviewItem
                            key={overviewKey("risk_disposition", item.id)}
                            kind="risk_disposition"
                            id={item.id}
                            sign="🔘"
                            text={`${known("riskAction", item.action, t)}: ${item.scope}: ${item.rationale}`}
                        />
                    ))
                ]}
            />
        </Section>
    );
};

const OverviewTranscript = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    return (
        <Section label={t("panel.overview.transcript")}>
            <List
                items={[
                    ...(archive?.publications ?? detail.publications).map((item) => (
                        <OverviewItem
                            key={overviewKey("publication", item.id)}
                            kind="publication"
                            id={item.id}
                            sign="•"
                            text={`${item.id}: ${item.exitReasons.join("; ")}`}
                            maxLines={3}
                        />
                    )),
                    ...(archive?.messages ?? detail.messages).map((item) => (
                        <OverviewItem
                            key={overviewKey("formal_message", item.id)}
                            kind="formal_message"
                            id={item.id}
                            sign="•"
                            text={`${item.kind}: ${item.body}`}
                            maxLines={3}
                        />
                    ))
                ]}
            />
        </Section>
    );
};

const OverviewEvidence = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
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
    return (
        <Section label={t("panel.overview.evidence")}>
            <List
                items={[
                    ...versions.map((item) => (
                        <OverviewItem
                            key={overviewKey("evidence_version", item.id)}
                            kind="evidence_version"
                            id={item.id}
                            sign="•"
                            text={`${item.id}: ${item.observation}: ${item.interpretation}: ${item.method}`}
                        />
                    )),
                    ...reviews.map((item) => (
                        <OverviewItem
                            key={overviewKey("evidence_review", item.id)}
                            kind="evidence_review"
                            id={item.id}
                            sign="•"
                            text={`${item.id}: ${item.scope}`}
                        />
                    )),
                    ...(!archive
                        ? detail.reviewDeliveries.map((item) => (
                              <OverviewItem
                                  key={overviewKey("review_delivery", item.id)}
                                  kind="review_delivery"
                                  id={item.id}
                                  sign="•"
                                  text={`${item.id}: ${known("reviewDelivery", item.status, t)}${item.failureReason ? `: ${item.failureReason}` : ""}`}
                              />
                          ))
                        : [])
                ]}
            />
        </Section>
    );
};

const OverviewTechnical = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    return (
        <Section label={t("panel.overview.technical")}>
            <p>{detail.meetingId}</p>
            {archive ? (
                <p data-overview-key={overviewKey("archive", archive.id)} tabIndex={-1}>
                    {archive.id}
                </p>
            ) : (
                <List
                    items={detail.tasks.map((item) => (
                        <OverviewItem
                            key={overviewKey("task", item.id)}
                            kind="task"
                            id={item.id}
                            sign="•"
                            text={`${item.id}: ${item.title}: ${known("task", item.status, t)}: ${known("authorization", item.authorizationStatus, t)}${(item.result ?? item.exitReason) ? `: ${item.result ?? item.exitReason}` : ""}`}
                        />
                    ))}
                />
            )}
        </Section>
    );
};

export const MeetingPanelOverview = (props: OverviewProps): ReactElement => {
    const { detail, focusTarget, onFocusConsumed, onLocateInTimeline } = props;
    const t = useMeetingTranslate();
    const overview = useRef<HTMLDivElement>(null);
    const [focusMissing, setFocusMissing] = useState(false);
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    const displayed = new Set<string>([overviewKey("lifecycle", detail.meetingId)]);
    const addDisplayed = (kind: string, items: readonly { id: string }[]) => {
        for (const item of items) {
            displayed.add(overviewKey(kind, item.id));
        }
    };
    if (archive) {
        displayed.add(overviewKey("archive", archive.id));
    } else {
        addDisplayed("round", detail.rounds);
        addDisplayed("opportunity_request", detail.opportunityRequests);
        addDisplayed("manager_plan", detail.managerPlans);
        addDisplayed("identity_recommendation", detail.identityRecommendations ?? []);
        addDisplayed("task", detail.tasks);
        addDisplayed("review_delivery", detail.reviewDeliveries);
    }
    addDisplayed(
        "decision_candidate",
        archive?.decisionCandidates ?? detail.outcomes.pendingDecisionCandidates ?? []
    );
    addDisplayed("decision", archive?.decisions ?? detail.outcomes.decisions);
    addDisplayed("completion_fact", archive?.completionFacts ?? detail.outcomes.completionFacts);
    addDisplayed("risk_disposition", archive?.riskDispositions ?? detail.outcomes.riskDispositions);
    addDisplayed("publication", archive?.publications ?? detail.publications);
    addDisplayed("formal_message", archive?.messages ?? detail.messages);
    addDisplayed(
        "evidence_version",
        archive
            ? archive.evidenceBundles.map(({ version }) => version)
            : detail.evidencePackages.map(({ currentVersion }) => currentVersion)
    );
    addDisplayed(
        "evidence_review",
        archive ? archive.evidenceBundles.map(({ review }) => review) : detail.evidenceReviews
    );
    const objects = [
        ...new Map(
            buildTimelineNodes(detail)
                .filter((node) => displayed.has(overviewKey(node.objectKind, node.objectId)))
                .map((node) => [`${node.objectKind}:${node.objectId}`, node] as const)
        ).values()
    ];
    useEffect(() => {
        if (!focusTarget) {
            return;
        }
        const item =
            focusTarget.meetingId === detail.meetingId
                ? Array.from(
                      overview.current?.querySelectorAll<HTMLElement>("[data-overview-key]") ?? []
                  ).find(
                      (element) =>
                          element.dataset.overviewKey ===
                          overviewKey(focusTarget.objectKind, focusTarget.objectId)
                  )
                : undefined;
        if (!item) {
            setFocusMissing(true);
        } else {
            setFocusMissing(false);
            item.scrollIntoView?.({ block: "nearest", inline: "center" });
            item.focus();
        }
        onFocusConsumed?.();
    }, [focusTarget, detail.meetingId, onFocusConsumed]);
    return (
        <div ref={overview}>
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
                            <Button
                                key={`${node.objectKind}:${node.objectId}`}
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label={name}
                                onClick={() =>
                                    onLocateInTimeline({
                                        meetingId: detail.meetingId,
                                        objectKind: node.objectKind,
                                        objectId: node.objectId
                                    })
                                }
                            >
                                {name}
                            </Button>
                        );
                    })}
                </nav>
            ) : null}
        </div>
    );
};
