import * as React from "react";
import type { ReactElement } from "react";
import { IconSearchOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";
import styles from "./empty.module.css";

export const Empty = ({ message }: { message: string }): ReactElement => (
    <div data-testid="meeting-navigator-empty" className={styles.empty}>
        <IconSearchOutline16 />
        <span>{message}</span>
    </div>
);
