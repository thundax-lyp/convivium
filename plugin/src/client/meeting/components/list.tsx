import * as React from "react";
import type { ComponentProps, ReactElement } from "react";
import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import styles from "./list.module.css";

export const List = ({ items }: { items: readonly ReactElement[] }): ReactElement => {
    const t = useMeetingTranslate();
    return items.length === 0 ? (
        <p className={styles.empty}>{t("common.none")}</p>
    ) : (
        <ul className={styles.list} role="list">
            {items}
        </ul>
    );
};

export const ListItem = ({
    children,
    className,
    ...props
}: Omit<ComponentProps<"li">, "children"> & { children: string }): ReactElement => (
    <li {...props} className={className ? `${styles.item} ${className}` : styles.item}>
        <Tooltip label={children} side="right" maxWidth={320} portal>
            <span className={styles.label} tabIndex={0}>
                {children}
            </span>
        </Tooltip>
    </li>
);
