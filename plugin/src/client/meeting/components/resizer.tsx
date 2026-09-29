import * as React from "react";
import { useRef, type ReactElement } from "react";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import styles from "./resizer.module.css";

const KEYBOARD_RESIZE_STEP = 16;

export const Resizer = ({
    controls,
    width,
    minWidth,
    maxWidth,
    onResize
}: {
    controls: string;
    width: number;
    minWidth: number;
    maxWidth: number;
    onResize(width: number): void;
}): ReactElement => {
    const t = useMeetingTranslate();
    const dragStartRef = useRef<{ pointerId: number; x: number; width: number } | null>(null);

    const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
            return;
        }
        dragStartRef.current = { pointerId: event.pointerId, x: event.clientX, width };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };
    const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
        const start = dragStartRef.current;
        if (start?.pointerId === event.pointerId) {
            onResize(start.width + event.clientX - start.x);
        }
    };
    const stopResize = () => {
        dragStartRef.current = null;
    };
    const resizeWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
        let nextWidth: number;
        switch (event.key) {
            case "ArrowLeft":
                nextWidth = width - KEYBOARD_RESIZE_STEP;
                break;
            case "ArrowRight":
                nextWidth = width + KEYBOARD_RESIZE_STEP;
                break;
            case "Home":
                nextWidth = minWidth;
                break;
            case "End":
                nextWidth = maxWidth;
                break;
            default:
                return;
        }
        event.preventDefault();
        onResize(nextWidth);
    };

    return (
        <div
            role="separator"
            aria-label={t("panel.navigator.resize")}
            aria-orientation="vertical"
            aria-controls={controls}
            aria-valuemin={minWidth}
            aria-valuemax={maxWidth}
            aria-valuenow={width}
            tabIndex={0}
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
            onLostPointerCapture={stopResize}
            onKeyDown={resizeWithKeyboard}
            className={styles.separator}
        />
    );
};
