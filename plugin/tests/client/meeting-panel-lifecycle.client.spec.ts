import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
        expect(api.read).not.toHaveBeenCalled();
        fireEvent.click(item);
        await waitFor(() =>
            expect(api.read).toHaveBeenCalledWith({
                protocolVersion: 1,
                meetingId: summary.meetingId
            })
        );
        expect(screen.getByRole("region", { name: "Objective" })).toBeTruthy();
        fireEvent.click(item);
        expect(api.read).toHaveBeenCalledOnce();

        releaseNotice();
        await waitFor(() => expect(acceptNotice).toHaveBeenCalledOnce());
        await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));

        unmount();
        expect(dispose).toHaveBeenCalledOnce();
    });

    it.each(["resolve", "reject"] as const)(
        "discards a late %s from the previously selected Meeting",
        async (settlement) => {
            const { api, summary, view } = clientFixture();
            const secondSummary = {
                ...summary,
                meetingId: "meeting-second",
                objective: "Second objective"
            };
            const secondView = {
                ...view,
                meetingId: secondSummary.meetingId,
                objective: { ...view.objective, statement: "Second detail" }
            };
            let resolveFirst = (_value: typeof view) => undefined;
            let rejectFirst = (_error: Error) => undefined;
            const firstRead = new Promise<typeof view>((resolve, reject) => {
                resolveFirst = resolve;
                rejectFirst = reject;
            });
            api.list = vi.fn(async () => ({ meetings: [summary, secondSummary] }));
            api.read = vi.fn(({ meetingId }) =>
                meetingId === summary.meetingId ? firstRead : Promise.resolve(secondView)
            ) as never;
            render(createElement(ConviviumMeetingPanel, { api, t: meetingTranslator("en") }));

            fireEvent.click(await screen.findByRole("button", { name: /核对议题 A/ }));
            fireEvent.click(screen.getByRole("button", { name: /Second objective/ }));
            await waitFor(() =>
                expect(
                    within(screen.getByRole("region", { name: "Objective" })).getByText(
                        "Second detail"
                    )
                ).toBeTruthy()
            );

            if (settlement === "resolve") resolveFirst(view);
            else rejectFirst(new Error("late failure"));
            await waitFor(() =>
                expect(
                    within(screen.getByRole("region", { name: "Objective" })).getByText(
                        "Second detail"
                    )
                ).toBeTruthy()
            );
            expect(screen.queryByText(view.objective.statement)).toBeNull();
            expect(screen.queryByRole("alert")).toBeNull();
        }
    );

    it("clears the selection when a successful list no longer contains it", async () => {
        const { api, summary, releaseNotice } = clientFixture();
        api.list = vi
            .fn()
            .mockResolvedValueOnce({ meetings: [summary] })
            .mockResolvedValueOnce({ meetings: [] })
            .mockResolvedValueOnce({ meetings: [summary] });
        render(createElement(ConviviumMeetingPanel, { api, t: meetingTranslator("en") }));
        fireEvent.click(await screen.findByRole("button", { name: /核对议题 A/ }));
        expect(await screen.findByRole("region", { name: "Objective" })).toBeTruthy();

        releaseNotice();

        expect(await screen.findByText("Select a meeting.")).toBeTruthy();
        expect(screen.queryByRole("region", { name: "Objective" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
        await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));
        expect(screen.getByText("Select a meeting.")).toBeTruthy();
        expect(screen.queryByRole("region", { name: "Objective" })).toBeNull();
    });

    it("keeps the selected Meeting and its last-good detail when rereading fails", async () => {
        const { api, summary, view } = clientFixture();
        api.read = vi
            .fn()
            .mockResolvedValueOnce(view)
            .mockRejectedValueOnce(new Error("detail unavailable"));
        render(createElement(ConviviumMeetingPanel, { api, t: meetingTranslator("en") }));
        fireEvent.click(await screen.findByRole("button", { name: /核对议题 A/ }));
        await waitFor(() =>
            expect(
                within(screen.getByRole("region", { name: "Objective" })).getByText(
                    view.objective.statement
                )
            ).toBeTruthy()
        );

        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

        expect((await screen.findByRole("alert")).textContent).toBe("Meeting data is unavailable.");
        expect(
            within(screen.getByRole("region", { name: "Objective" })).getByText(
                view.objective.statement
            )
        ).toBeTruthy();
        expect(screen.getByLabelText(`Meeting ${summary.meetingId}`)).toBeTruthy();
    });
});
