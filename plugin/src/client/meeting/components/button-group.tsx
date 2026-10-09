import * as React from "react";
import type { ReactElement, ReactNode } from "react";
import styles from "./button-group.module.css";

export const ButtonGroup = ({
    role,
    children,
    "aria-label": ariaLabel
}: {
    role: "group" | "tablist";
    children: ReactNode;
    "aria-label"?: string;
}): ReactElement => (
    <div className={styles.group} role={role} aria-label={ariaLabel}>
        {children}
    </div>
);
