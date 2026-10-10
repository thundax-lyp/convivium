import * as React from "react";
import type { ReactElement, ReactNode } from "react";

export const Section = ({
    label,
    children,
    focusKey
}: {
    label: string;
    children: ReactNode;
    focusKey?: string;
}): ReactElement => (
    <section aria-label={label} data-overview-key={focusKey} tabIndex={focusKey ? -1 : undefined}>
        <h4>{label}</h4>
        {children}
    </section>
);
