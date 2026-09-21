import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeetingClient } from "@/client/meeting-client.js";
import { ConviviumMeetingPanel } from "@/client/meeting-panel.js";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.js";

afterEach(cleanup);

function clientFixture() {
    const { summary, view } = meetingProjectionFixture();
    const stream = {
        async *[Symbol.asyncIterator]() {
            await new Promise<void>(() => {});
            yield undefined as never;
        },
        dispose: vi.fn(async () => {})
    };
    const api = {
        list: vi.fn(async () => ({ meetings: [summary] })),
        read: vi.fn(async () => view),
        control: vi.fn(async () => ({ kind: "accepted" as const })),
        subscribeRefresh: vi.fn(() => stream)
    } as unknown as MeetingClient;
    return { api, summary, view };
}

describe("Meeting panel lifecycle", () => {
    it("loads the list and reads the selected projection", async () => {
        const { api, summary } = clientFixture();
        render(createElement(ConviviumMeetingPanel, { api }));
        const item = await screen.findByRole("button", { name: /核对议题 A/ });
        fireEvent.click(item);
        await waitFor(() =>
            expect(api.read).toHaveBeenCalledWith({
                protocolVersion: 1,
                meetingId: summary.meetingId
            })
        );
        expect(screen.getByLabelText("Meeting summary")).toBeTruthy();
    });
});
