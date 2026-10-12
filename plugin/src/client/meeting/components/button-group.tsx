import * as React from "react";
import type { ReactElement, ReactNode } from "react";
import styles from "./button-group.module.css";

export const ButtonGroup = ({
    role,
    className,
    orientation = "horizontal",
    children,
    "aria-label": ariaLabel
}: {
    role: "group" | "tablist";
    className?: string;
    orientation?: "horizontal" | "vertical";
    children: ReactNode;
    "aria-label"?: string;
}): ReactElement => (
    <div
        className={`${styles.group} ${className ?? ""}`}
        data-orientation={orientation}
        role={role}
        aria-label={ariaLabel}
    >
        {children}
    </div>
);
