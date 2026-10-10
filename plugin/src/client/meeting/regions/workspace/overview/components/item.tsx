import * as React from "react";
import type { ReactElement, ReactNode } from "react";
import { Ellipsis, ListItem } from "@/client/meeting/components/index.ts";
import styles from "./item.module.css";

export const OverviewItem = ({
    kind,
    id,
    text,
    sign,
    maxLines,
    accessibleLabel
}: {
    kind: string;
    id: string;
    text: string | ReactElement;
    sign: ReactNode;
    maxLines?: number;
    accessibleLabel?: string;
}): ReactElement => (
    <ListItem
        className={styles.item}
        data-overview-key={`${kind}:${id}`}
        tabIndex={-1}
        accessibleLabel={accessibleLabel}
    >
        <span className={styles.sign} aria-hidden="true">
            {sign}
        </span>
        {typeof text === "string" ? <Ellipsis text={text} maxLines={maxLines} /> : text}
    </ListItem>
);
