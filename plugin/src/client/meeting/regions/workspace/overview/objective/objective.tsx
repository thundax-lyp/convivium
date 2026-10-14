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
