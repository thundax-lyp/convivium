import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { Ellipsis, List, ListItem } from "@/client/meeting/components/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { knownEnum as known } from "@/client/meeting/shared/index.ts";
import { Section } from "@/client/meeting/regions/workspace/overview/components/index.ts";
import styles from "./objective.module.css";

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
        <ListItem
            key={item.id}
            className={styles.item}
            data-overview-key={`objective:${item.id}`}
            tabIndex={-1}
            accessibleLabel={`${item.text}: ${known("objectiveStatus", item.status, t)}`}
        >
            <span className={styles.sign} aria-hidden="true">
                {statusIcon[item.status]}
            </span>
            <Ellipsis text={item.text} />
        </ListItem>
    );
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
