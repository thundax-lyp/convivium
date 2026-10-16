import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { translatedPanel } from "./meeting-panel-locale-fixtures.ts";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.ts";

afterEach(cleanup);
it.each(["en", "zh"] as const)(
    "shows safe ACP diagnostics and refreshes them without a domain version change: %s",
    async (locale) => {
        const { summary, view } = meetingProjectionFixture();
        let detail = view;
        let wake!: (value: IteratorResult<{ accept(): void }>) => void;
        const stream = {
            [Symbol.asyncIterator]() {
                return this;
            },
            next: () =>
                new Promise<IteratorResult<{ accept(): void }>>((resolve) => {
                    wake = resolve;
                }),
            dispose: vi.fn(async () => {})
        };
        const api = {
            list: vi.fn(async () => ({ meetings: [summary] })),
            read: vi.fn(async () => detail),
            control: vi.fn(),
            subscribeRefresh: () => stream
        };
        render(translatedPanel({ api }, locale));
        fireEvent.click(await screen.findByRole("treeitem", { name: /核对议题 A/ }));
        await waitFor(() => expect(api.read).toHaveBeenCalled());
        detail = {
            ...view,
            executionBlocks: [
                {
                    identityId: view.identities[0].id,
                    code: "ACP_CODEX_OUTCOME_UNKNOWN",
                    since: 123,
                    allowedActions: ["pause_meeting", "end_meeting"]
                }
            ]
        };
        wake({ done: false, value: { accept() {} } });
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain(view.identities[0].displayName);
        expect(alert.textContent).toContain(
            locale === "en" ? "Execution outcome is unknown" : "执行结果未知"
        );
        expect(alert.textContent).toContain(locale === "en" ? "pause" : "暂停");
        expect(api.control).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: /clear block|清锁/i })).toBeNull();
        expect(
            screen.getByRole("button", { name: locale === "en" ? "Pause meeting" : "暂停会议" })
                .disabled
        ).toBe(false);
        detail = {
            ...view,
            executionBlocks: [
                {
                    identityId: view.identities[0].id,
                    code: "ACP_CODEX_RECOVERY_REQUIRED",
                    since: 123,
                    allowedActions: ["pause_meeting", "end_meeting"]
                }
            ]
        };
        wake({ done: false, value: { accept() {} } });
        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toContain(
                locale === "en" ? "Session recovery is required" : "会话需要恢复"
            )
        );
        expect(detail.version).toBe(view.version);
    }
);
