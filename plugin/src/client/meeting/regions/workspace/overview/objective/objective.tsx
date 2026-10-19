import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { List } from "@/client/meeting/components/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { knownEnum as known } from "@/client/meeting/shared/index.ts";
import {
    OverviewItem,
    Section
} from "@/client/meeting/regions/workspace/overview/components/index.ts";

type ObjectiveTarget =
    | MeetingView["objective"]["requiredOutputs"][number]
    | MeetingView["objective"]["acceptanceCriteria"][number]
    | MeetingView["objective"]["hardConstraints"][number];

export const OverviewObjective = ({ detail }: { detail: MeetingView }): ReactElement => {
    const t = useMeetingTranslate();
    const statusIcon: Record<ObjectiveTarget["status"], string> = {
        pending: "⏳",
        satisfied: "✅",
        unsatisfied: "❌",
        violated: "🚫"
    };
    const objective =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive.objective
            : detail.objective;
    const objectiveItem = (item: ObjectiveTarget): ReactElement => (
        <OverviewItem
            key={item.id}
            kind="objective"
            id={item.id}
            text={item.text}
            sign={statusIcon[item.status]}
            accessibleLabel={`${item.text}: ${known("objectiveStatus", item.status, t)}`}
        />
    );
    const planning = objective.researchPlanning;
    if (planning) {
        const plan = planning.status === "accepted" ? planning.plan : undefined;
        return (
            <Section
                label={t("panel.overview.objective")}
                focusKey={`lifecycle:${detail.meetingId}`}
            >
                {!plan && (
                    <p role="status">
                        {t(
                            planning.status === "failed"
                                ? "panel.research.failed"
                                : "panel.research.pending"
                        )}
                    </p>
                )}
                {planning.status === "failed" && (
                    <>
                        <p>{planning.reason}</p>
                        {planning.attempts.map((attempt, index) => (
                            <details key={index}>
                                <summary>
                                    {t("panel.research.candidate", { number: index + 1 })}
                                </summary>
                                <pre>{attempt.draft}</pre>
                            </details>
                        ))}
                    </>
                )}
                {plan && (
                    <>
                        <List
                            items={plan.researchObjects.map((object) => (
                                <li
                                    key={object.id}
                                    data-overview-key={`objective:research-${object.id}`}
                                >
                                    <details>
                                        <summary>
                                            <span
                                                aria-label={known(
                                                    "objectiveStatus",
                                                    objective.requiredOutputs.find(
                                                        (target) =>
                                                            target.id === `research-${object.id}`
                                                    )?.status ?? "pending",
                                                    t
                                                )}
                                            >
                                                {
                                                    statusIcon[
                                                        objective.requiredOutputs.find(
                                                            (target) =>
                                                                target.id ===
                                                                `research-${object.id}`
                                                        )?.status ?? "pending"
                                                    ]
                                                }
                                            </span>
                                            <strong>
                                                {object.id} · {object.name}
                                            </strong>
                                        </summary>
                                        <p>{object.discussionGoal}</p>
                                        <p>
                                            {t("panel.research.includes")}{" "}
                                            {object.includes.join("；")}
                                        </p>
                                        {object.excludes.length > 0 && (
                                            <p>
                                                {t("panel.research.excludes")}{" "}
                                                {object.excludes.join("；")}
                                            </p>
                                        )}
                                        <p>
                                            {t("panel.research.boundary")}{" "}
                                            {object.boundaryWithOthers}
                                        </p>
                                        {object.dependencyInputs.length > 0 && (
                                            <p>
                                                {t("panel.research.dependencies")}{" "}
                                                {object.dependencyInputs
                                                    .map(
                                                        (d) => `${d.objectId}：${d.requiredResult}`
                                                    )
                                                    .join("；")}
                                            </p>
                                        )}
                                    </details>
                                </li>
                            ))}
                        />
                        {plan.sharedRequirements.length > 0 && (
                            <p>
                                <strong>{t("panel.research.shared")}</strong>{" "}
                                {plan.sharedRequirements.join("；")}
                            </p>
                        )}
                        {plan.unresolvedPremises.length > 0 && (
                            <p>
                                <strong>{t("panel.research.unresolved")}</strong>{" "}
                                {plan.unresolvedPremises.join("；")}
                            </p>
                        )}
                    </>
                )}
                {(objective.acceptanceCriteria.length > 0 ||
                    objective.hardConstraints.length > 0) && (
                    <List
                        items={[
                            ...objective.acceptanceCriteria.map(objectiveItem),
                            ...objective.hardConstraints.map(objectiveItem)
                        ]}
                    />
                )}
            </Section>
        );
    }
    const label = t("panel.overview.objective");
    return (
        <Section label={label} focusKey={`lifecycle:${detail.meetingId}`}>
            <List
                items={[
                    ...objective.requiredOutputs.map(objectiveItem),
                    ...objective.acceptanceCriteria.map(objectiveItem),
                    ...objective.hardConstraints.map(objectiveItem)
                ]}
            />
        </Section>
    );
};
