import * as React from "react";
import type { ReactElement, ReactNode } from "react";
import styles from "./empty.module.css";

export const Empty = ({ message, icon }: { message: string; icon: ReactNode }): ReactElement => (
    <div className={styles.empty}>
        {icon}
        <span>{message}</span>
    </div>
);
