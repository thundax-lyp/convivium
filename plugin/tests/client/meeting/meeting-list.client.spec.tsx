import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ListItem } from "@/client/meeting/components/index.ts";

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it("shows the full list item in the DSH tooltip", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
        "ResizeObserver",
        class {
            constructor(private readonly callback: ResizeObserverCallback) {}
            observe() {
                this.callback(
                    [
                        {
                            borderBoxSize: [{ inlineSize: 100, blockSize: 20 }]
                        } as ResizeObserverEntry
                    ],
                    this as unknown as ResizeObserver
                );
            }
            disconnect() {}
        }
    );
    const content = "A long meeting item with the complete source text";
    render(
        <ul>
            <ListItem>{content}</ListItem>
        </ul>
    );

    fireEvent.mouseEnter(screen.getByText(content));
    act(() => vi.runAllTimers());

    expect(screen.getAllByText(content)).toHaveLength(2);
});
