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

export const OverviewAgenda = ({ detail }: { detail: MeetingView }): ReactElement => {
    const t = useMeetingTranslate();
    const statusIcon: Record<MeetingView["agenda"][number]["status"], string> = {
        pending: "⏳",
        active: "👉",
        blocked: "⚠️",
        completed: "✅",
        deferred: "⏸️",
        closed: "⏹️"
    };
    const agenda =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive.agenda
            : detail.agenda;
    const label = t("panel.overview.agenda");
    return (
        <Section label={label}>
            <List
                items={agenda.map((item) => (
                    <OverviewItem
                        key={item.id}
                        kind="agenda"
                        id={item.id}
                        text={item.title}
                        sign={statusIcon[item.status]}
                        accessibleLabel={`${item.title}: ${known("agenda", item.status, t)}`}
                    />
                ))}
            />
        </Section>
    );
};
