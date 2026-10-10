import * as React from "react";
import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import styles from "./ellipsis.module.css";

export const Ellipsis = ({
    text,
    maxLines = 2
}: {
    text: string;
    maxLines?: number;
}): ReactElement => {
    const t = useMeetingTranslate();
    const rootRef = useRef<HTMLDivElement>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);
    const expandLabel = `...${t("common.expand")}`;

    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }

        const measure = (): void => {
            const probe = document.createElement("div");
            probe.className = styles.measure;
            probe.setAttribute("aria-hidden", "true");
            const probeText = document.createTextNode("");
            const probeToggle = document.createElement("span");
            probeToggle.className = styles.toggle;
            probeToggle.textContent = expandLabel;
            probe.append(probeText, probeToggle);
            root.append(probe);

            probeToggle.hidden = true;
            probeText.textContent = "A";
            const lineHeight = probe.getBoundingClientRect().height;
            probeText.textContent = text;
            const fullHeight = probe.getBoundingClientRect().height;
            const heightLimit = lineHeight * Math.max(1, Math.floor(maxLines)) + 0.5;

            if (fullHeight <= heightLimit) {
                setPreview(null);
            } else {
                probeToggle.hidden = false;
                const characters = Array.from(text);
                let lower = 0;
                let upper = characters.length;
                while (lower < upper) {
                    const middle = Math.ceil((lower + upper) / 2);
                    probeText.textContent = characters.slice(0, middle).join("");
                    if (probe.getBoundingClientRect().height <= heightLimit) {
                        lower = middle;
                    } else {
                        upper = middle - 1;
                    }
                }
                setPreview(characters.slice(0, lower).join(""));
            }
            probe.remove();
        };

        measure();
        if (typeof ResizeObserver === "undefined") {
            return;
        }
        const observer = new ResizeObserver(measure);
        observer.observe(root);
        return () => observer.disconnect();
    }, [expandLabel, maxLines, text]);

    return (
        <div ref={rootRef} className={styles.root}>
            {preview === null ? (
                <span className={styles.text}>{text}</span>
            ) : expanded ? (
                <>
                    <div className={styles.text}>{text}</div>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.toggle}
                            aria-expanded="true"
                            onClick={() => setExpanded(false)}
                        >
                            {t("common.collapse")}
                        </button>
                    </div>
                </>
            ) : (
                <span className={styles.text}>
                    {preview}
                    <button
                        type="button"
                        className={styles.toggle}
                        aria-expanded="false"
                        onClick={() => setExpanded(true)}
                    >
                        {expandLabel}
                    </button>
                </span>
            )}
        </div>
    );
};
