import * as React from "react";
import type { ReactElement } from "react";
import { IconSearchOutlineMedium } from "@deepseek-ai/dsh-client-ui-primitives";
import styles from "./empty.module.css";

export const Empty = ({ message }: { message: string }): ReactElement => (
    <div data-testid="meeting-navigator-empty" className={styles.empty}>
        <IconSearchOutlineMedium />
        <span>{message}</span>
    </div>
);
