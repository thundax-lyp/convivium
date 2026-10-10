import * as React from "react";
import type { ComponentProps, ReactElement } from "react";
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
    accessibleLabel,
    ...props
}: Omit<ComponentProps<"li">, "children"> & {
    children: React.ReactNode;
    accessibleLabel?: string;
}): ReactElement => {
    return (
        <li
            {...props}
            className={className ? `${styles.item} ${className}` : styles.item}
            aria-label={accessibleLabel}
        >
            {children}
        </li>
    );
};
