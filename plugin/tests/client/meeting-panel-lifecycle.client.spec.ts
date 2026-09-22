import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeetingClient } from "@/client/meeting-client.js";
import { ConviviumMeetingPanel } from "@/client/meeting-panel.js";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);

function clientFixture() {
    const { summary, view } = meetingProjectionFixture();
    let releaseNotice: () => void = () => {};
    const noticeReady = new Promise<void>((resolve) => {
        releaseNotice = resolve;
    });
    const acceptNotice = vi.fn();
    const dispose = vi.fn(async () => {});
    const stream = {
        async *[Symbol.asyncIterator]() {
            await noticeReady;
            yield { accept: acceptNotice } as never;
        },
        dispose
    };
    const api = {
        list: vi.fn(async () => ({ meetings: [summary] })),
        read: vi.fn(async () => view),
        control: vi.fn(async () => ({ kind: "accepted" as const })),
        subscribeRefresh: vi.fn(() => stream)
    } as unknown as MeetingClient;
    return { api, summary, view, releaseNotice, acceptNotice, dispose };
}

describe("Meeting panel lifecycle", () => {
    it("loads the selected projection, accepts refresh notices, and disposes the stream", async () => {
        const { api, summary, releaseNotice, acceptNotice, dispose } = clientFixture();
        const { unmount } = render(
            createElement(ConviviumMeetingPanel, { api, t: meetingTranslator("en") })
        );
        const item = await screen.findByRole("button", { name: /核对议题 A/ });
        fireEvent.click(item);
        await waitFor(() =>
            expect(api.read).toHaveBeenCalledWith({
                protocolVersion: 1,
                meetingId: summary.meetingId
            })
        );
        expect(screen.getByLabelText("Meeting summary")).toBeTruthy();

        releaseNotice();
        await waitFor(() => expect(acceptNotice).toHaveBeenCalledOnce());
        await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));

        unmount();
        expect(dispose).toHaveBeenCalledOnce();
    });
});
