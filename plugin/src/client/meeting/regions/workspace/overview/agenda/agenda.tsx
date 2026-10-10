import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { Ellipsis, List, ListItem } from "@/client/meeting/components/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { knownEnum as known } from "@/client/meeting/shared/index.ts";
import { Section } from "@/client/meeting/regions/workspace/overview/components/index.ts";
import styles from "./agenda.module.css";

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
                    <ListItem
                        key={item.id}
                        className={styles.item}
                        data-overview-key={`agenda:${item.id}`}
                        tabIndex={-1}
                        accessibleLabel={`${item.title}: ${known("agenda", item.status, t)}`}
                    >
                        <span className={styles.sign} aria-hidden="true">
                            {statusIcon[item.status]}
                        </span>
                        <Ellipsis text={item.title} />
                    </ListItem>
                ))}
            />
        </Section>
    );
};
