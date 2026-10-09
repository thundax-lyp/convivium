import * as React from "react";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { List, ListItem } from "@/client/meeting/components/index.ts";
import { knownEnum as known } from "@/client/meeting/shared/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { buildTimelineNodes } from "@/client/meeting/regions/workspace/timeline/index.ts";
import type { MeetingFocusTarget } from "@/client/meeting/shared/index.ts";

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

const overviewItem = (kind: string, id: string, content: string): ReactElement => (
    <ListItem key={overviewKey(kind, id)} data-overview-key={overviewKey(kind, id)} tabIndex={-1}>
        {content}
    </ListItem>
);

const OverviewObjective = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const objective =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive.objective
            : detail.objective;
    const agenda =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive.agenda
            : detail.agenda;
    return (
        <Section
            label={t("panel.overview.objective")}
            focusKey={overviewKey("lifecycle", detail.meetingId)}
        >
            <List
                items={agenda.map((item) => (
                    <ListItem
                        key={item.id}
                    >{`${item.title}: ${known("agenda", item.status, t)}`}</ListItem>
                ))}
            />
            <List
                items={objective.requiredOutputs.map((item) => (
                    <ListItem
                        key={item.id}
                    >{`${item.text}: ${known("objectiveStatus", item.status, t)}`}</ListItem>
                ))}
            />
            <List
                items={objective.acceptanceCriteria.map((item) => (
                    <ListItem
                        key={item.id}
                    >{`${item.text}: ${known("objectiveStatus", item.status, t)}`}</ListItem>
                ))}
            />
            <List
                items={objective.hardConstraints.map((item) => (
                    <ListItem
                        key={item.id}
                    >{`${item.text}: ${known("objectiveStatus", item.status, t)}`}</ListItem>
                ))}
            />
            <p>{known("riskLevel", objective.acceptableRiskLevel, t)}</p>
        </Section>
    );
};

const OverviewProgress = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const items: ReactElement[] = [];
    for (const round of detail.rounds) {
        items.push(
            overviewItem(
                "round",
                round.id,
                `${round.roundGoal.question}: ${known("round", round.status, t)}`
            )
        );
        for (const contributorId of round.invitedContributorIds ?? []) {
            const response = round.participationResponses?.find(
                (item) => item.contributorId === contributorId
            );
            items.push(
                <ListItem key={`participation:${round.id}:${contributorId}`}>
                    {`${contributorId}: ${t(
                        response
                            ? `enum.participation.${response.status}`
                            : "enum.participation.pending"
                    )}`}
                </ListItem>
            );
        }
        for (const contribution of round.contributions) {
            items.push(
                <ListItem
                    key={`contribution:${contribution.id}`}
                >{`${contribution.id}: ${known("contribution", contribution.status, t)}${contribution.exitReason ? `: ${contribution.exitReason}` : ""}`}</ListItem>
            );
        }
    }
    for (const request of detail.opportunityRequests) {
        items.push(overviewItem("opportunity_request", request.id, request.purpose));
    }
    for (const plan of detail.managerPlans) {
        items.push(
            overviewItem(
                "manager_plan",
                plan.id,
                `${known("managerPlanKind", plan.kind, t)}: ${plan.blockingReason ?? plan.rationale}`
            )
        );
    }
    for (const recommendation of detail.identityRecommendations ?? []) {
        items.push(
            overviewItem(
                "identity_recommendation",
                recommendation.id,
                `${recommendation.rationale}: ${known("recommendation", recommendation.status, t)}`
            )
        );
    }
    for (const task of detail.tasks) {
        items.push(
            overviewItem("task", task.id, `${task.title}: ${known("task", task.status, t)}`)
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
                    ...candidates.map((item) =>
                        overviewItem(
                            "decision_candidate",
                            item.id,
                            `${item.id}: ${known("decisionOutcome", item.outcome, t)}: ${item.rationale}`
                        )
                    ),
                    ...decisions.map((item) =>
                        overviewItem(
                            "decision",
                            item.id,
                            `${item.id}: ${known("decisionOutcome", item.outcome, t)}: ${known("decisionStatus", item.status, t)}: ${item.rationale}`
                        )
                    ),
                    ...facts.map((item) =>
                        overviewItem(
                            "completion_fact",
                            item.id,
                            `${item.statement}: ${known("completionStatus", item.status, t)}: ${item.rationale}`
                        )
                    )
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
                        <ListItem
                            key={`question:${item.id}`}
                        >{`${item.text}: ${known("questionStatus", item.status, t)}`}</ListItem>
                    )),
                    ...issues.map((item) => (
                        <ListItem
                            key={`issue:${item.id}`}
                        >{`${item.description}: ${known("issueStatus", item.status, t)}: ${known("issueClassification", item.classification, t)}: ${item.rationale}`}</ListItem>
                    )),
                    ...risks.map((item) =>
                        overviewItem(
                            "risk_disposition",
                            item.id,
                            `${known("riskAction", item.action, t)}: ${item.scope}: ${item.rationale}`
                        )
                    )
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
                    ...(archive?.publications ?? detail.publications).map((item) =>
                        overviewItem(
                            "publication",
                            item.id,
                            `${item.id}: ${item.exitReasons.join("; ")}`
                        )
                    ),
                    ...(archive?.messages ?? detail.messages).map((item) =>
                        overviewItem("formal_message", item.id, `${item.kind}: ${item.body}`)
                    )
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
                    ...versions.map((item) =>
                        overviewItem(
                            "evidence_version",
                            item.id,
                            `${item.id}: ${item.observation}: ${item.interpretation}: ${item.method}`
                        )
                    ),
                    ...reviews.map((item) =>
                        overviewItem("evidence_review", item.id, `${item.id}: ${item.scope}`)
                    ),
                    ...(!archive
                        ? detail.reviewDeliveries.map((item) =>
                              overviewItem(
                                  "review_delivery",
                                  item.id,
                                  `${item.id}: ${known("reviewDelivery", item.status, t)}${item.failureReason ? `: ${item.failureReason}` : ""}`
                              )
                          )
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
                    items={detail.tasks.map((item) =>
                        overviewItem(
                            "task",
                            item.id,
                            `${item.id}: ${item.title}: ${known("task", item.status, t)}: ${known("authorization", item.authorizationStatus, t)}${(item.result ?? item.exitReason) ? `: ${item.result ?? item.exitReason}` : ""}`
                        )
                    )}
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
