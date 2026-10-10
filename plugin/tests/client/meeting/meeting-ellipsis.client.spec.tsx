import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListItem } from "@/client/meeting/components/list.tsx";
import { Ellipsis } from "@/client/meeting/components/ellipsis.tsx";
import { withMeetingTranslation } from "./meeting-panel-locale-fixtures.ts";

describe("Meeting overview list items", () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;

    beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
            if (this.getAttribute("aria-hidden") === "true") {
                const lines = Math.ceil((this.textContent?.length ?? 0) / 20);
                return { height: lines * 20 } as DOMRect;
            }
            return originalRect.call(this);
        });
    });

    afterEach(() => vi.restoreAllMocks());

    it("uses the maximum line count and only expands from the inline control", () => {
        const content = "可核验的会议材料。".repeat(12);
        const { container } = render(
            withMeetingTranslation(
                <ul>
                    <ListItem>
                        <Ellipsis text={content} maxLines={2} />
                    </ListItem>
                </ul>,
                "zh"
            )
        );

        const expand = screen.getByRole("button", { name: "...展开" });
        const preview = expand.parentElement;
        expect(preview?.textContent).not.toContain(content);
        expect(preview?.textContent?.length).toBeLessThanOrEqual(40);

        fireEvent.click(preview!);
        expect(screen.getByRole("button", { name: "...展开" })).toBeTruthy();

        fireEvent.click(expand);
        const collapse = screen.getByRole("button", { name: "收起" });
        expect(container.querySelector("li")?.textContent).toContain(content);
        expect(collapse.parentElement?.previousElementSibling?.textContent).toBe(content);

        fireEvent.click(collapse);
        expect(screen.getByRole("button", { name: "...展开" })).toBeTruthy();
    });

    it("shows short text without controls", () => {
        const { container } = render(
            withMeetingTranslation(
                <ul>
                    <ListItem>
                        <Ellipsis text="简短内容" />
                    </ListItem>
                </ul>,
                "zh"
            )
        );

        expect(screen.getByText("简短内容")).toBeTruthy();
        expect(container.querySelector("button")).toBeNull();
    });

    it("uses a one-line preview when maxLines is one", () => {
        const { container } = render(
            withMeetingTranslation(
                <Ellipsis text={"可核验的会议材料。".repeat(12)} maxLines={1} />,
                "zh"
            )
        );

        const preview = container.querySelector("button")?.parentElement;
        expect(preview?.textContent?.length).toBeLessThanOrEqual(20);
    });
});
