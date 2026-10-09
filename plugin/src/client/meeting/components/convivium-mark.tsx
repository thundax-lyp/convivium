import * as React from "react";
import type { ReactElement } from "react";
import styles from "./convivium-mark.module.css";

const guestTones = [
    styles.toneA,
    styles.toneB,
    styles.toneC,
    styles.toneA,
    styles.toneB,
    styles.toneC
];

export const ConviviumMark = (): ReactElement => (
    <svg className={styles.mark} viewBox="180 35 840 840" aria-hidden="true">
        <circle cx="600" cy="455" r="397" className={styles.field} />
        <circle cx="600" cy="455" r="378" className={styles.outline} />

        <g transform="rotate(45 600 455)">
            <rect x="456" y="311" width="288" height="288" rx="30" className={styles.blanket} />
            <path
                d="M508 311v288M600 311v288M692 311v288M456 363h288M456 455h288M456 547h288"
                className={styles.grid}
            />
            <rect x="456" y="311" width="288" height="288" rx="30" className={styles.blanketEdge} />
        </g>

        <circle cx="600" cy="455" r="95" className={styles.plate} />
        <circle cx="600" cy="455" r="72" className={styles.plateInner} />
        <circle cx="577" cy="464" r="26" className={styles.food} />
        <circle cx="625" cy="447" r="27" className={styles.accent} />
        <path d="M605 410c16-12 34-9 42 1-17 10-32 11-42-1Z" className={styles.leaf} />
        <path d="M609 414c-7 10-10 19-10 28" className={styles.leafStem} />

        <g transform="translate(600 455)">
            {guestTones.map((tone, index) => (
                <g key={index} className={tone} transform={`rotate(${index * 60})`}>
                    <path
                        d="M-93-227c3-34 34-58 93-58s90 24 93 58l-17 37c-25 17-127 17-152 0Z"
                        className={styles.body}
                    />
                    <path
                        d="M-87-221c-27 17-40 39-37 67M87-221c27 17 40 39 37 67"
                        className={styles.arms}
                    />
                    <circle cy="-328" r="43" className={styles.head} />
                </g>
            ))}
        </g>
    </svg>
);
