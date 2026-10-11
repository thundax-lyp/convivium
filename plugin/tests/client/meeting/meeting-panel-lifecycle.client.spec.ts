import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeetingClient } from "@/client/meeting/client.ts";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.ts";
import { translatedPanel } from "./meeting-panel-locale-fixtures.ts";

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
    it("keeps a failed deletion available after refresh and retries the committed intent", async () => {
        const { api, summary } = clientFixture();
        let failed = false;
        let deleted = false;
        api.list = vi.fn(async () => ({
            meetings: deleted
                ? []
                : [
                      {
                          ...summary,
                          lifecycle: "terminal" as const,
                          deletionStatus: failed ? ("deleting" as const) : ("allowed" as const)
                      }
                  ]
        }));
        api.deleteMeeting = vi.fn(async (request) => {
            if (!failed) {
                failed = true;
                throw new Error("partial cleanup");
            }
            deleted = true;
            return { kind: "deleted", meetingId: request.meetingId };
        });
        render(translatedPanel({ api }, "en"));
        fireEvent.click(await screen.findByRole("treeitem", { name: /核对议题 A/ }));
        await screen.findByRole("region", { name: "Objective" });
        fireEvent.click(
            screen.getByRole("button", { name: `Actions for meeting ${summary.objective}` })
        );
        fireEvent.click(screen.getByRole("menuitem", { name: "Delete meeting" }));
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(screen.getByRole("button", { name: "Delete meeting" }));
        await screen.findByRole("alert");
        fireEvent.focus(window);
        await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(
                screen.getByRole("button", { name: "Delete meeting" }).getAttribute("disabled")
            ).toBeNull()
        );
        expect(screen.getByRole("treeitem").getAttribute("aria-selected")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "Delete meeting" }));
        await waitFor(() => expect(screen.queryByRole("treeitem")).toBeNull());
        expect(api.deleteMeeting).toHaveBeenCalledTimes(2);
    });
    it("discards a list refresh started during deletion when it resolves after success", async () => {
        const { api, summary, releaseNotice } = clientFixture();
        const target = {
            ...summary,
            lifecycle: "terminal" as const,
            deletionStatus: "allowed" as const
        };
        let releaseOld = (_value: { meetings: (typeof target)[] }) => {};
        const oldList = new Promise<{ meetings: (typeof target)[] }>((resolve) => {
            releaseOld = resolve;
        });
        let confirmDeletion = (_value: { kind: "deleted"; meetingId: string }) => {};
        const deletion = new Promise<{ kind: "deleted"; meetingId: string }>((resolve) => {
            confirmDeletion = resolve;
        });
        api.list = vi
            .fn()
            .mockResolvedValueOnce({ meetings: [target] })
            .mockReturnValueOnce(oldList)
            .mockResolvedValue({ meetings: [] });
        api.deleteMeeting = vi.fn(() => deletion);
        render(translatedPanel({ api }, "en"));
        fireEvent.click(await screen.findByRole("treeitem", { name: /核对议题 A/ }));
        await screen.findByRole("region", { name: "Objective" });
        fireEvent.click(
            screen.getByRole("button", { name: `Actions for meeting ${target.objective}` })
        );
        fireEvent.click(screen.getByRole("menuitem", { name: "Delete meeting" }));
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(screen.getByRole("button", { name: "Delete meeting" }));
        releaseNotice();
        await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
        await act(async () => confirmDeletion({ kind: "deleted", meetingId: target.meetingId }));
        await waitFor(() => expect(screen.queryByRole("treeitem")).toBeNull());
        await act(async () => releaseOld({ meetings: [target] }));
        expect(screen.queryByRole("treeitem")).toBeNull();
        expect(screen.queryByRole("region", { name: "Objective" })).toBeNull();
    });
    it.each([true, false])(
        "clears only the deleted selection after server confirmation (selected=%s)",
        async (selected) => {
            const { api, summary, view } = clientFixture();
            const target = {
                ...summary,
                lifecycle: "terminal" as const,
                deletionStatus: "allowed" as const
            };
            const other = { ...summary, meetingId: "meeting-other", objective: "Other objective" };
            let deleted = false;
            api.list = vi.fn(async () => ({ meetings: deleted ? [other] : [target, other] }));
            api.read = vi.fn(async ({ meetingId }) => ({
                ...view,
                meetingId,
                objective: {
                    ...view.objective,
                    statement: meetingId === other.meetingId ? "Other objective" : summary.objective
                }
            }));
            api.deleteMeeting = vi.fn(async (request) => {
                deleted = true;
                return { kind: "deleted", meetingId: request.meetingId };
            });
            render(translatedPanel({ api }, "en"));
            fireEvent.click(
                await screen.findByRole("treeitem", {
                    name: selected ? /核对议题 A/ : /Other objective/
                })
            );
            await screen.findByRole("region", { name: "Objective" });
            fireEvent.click(
                screen.getByRole("button", { name: `Actions for meeting ${target.objective}` })
            );
            fireEvent.click(screen.getByRole("menuitem", { name: "Delete meeting" }));
            fireEvent.click(screen.getByRole("checkbox"));
            fireEvent.click(screen.getByRole("button", { name: "Delete meeting" }));
            await waitFor(() =>
                expect(screen.queryByRole("treeitem", { name: /核对议题 A/ })).toBeNull()
            );
            expect(api.deleteMeeting).toHaveBeenCalledWith({
                protocolVersion: 1,
                meetingId: target.meetingId,
                expectedMeetingVersion: target.version
            });
            if (selected) {
                expect(screen.queryByRole("region", { name: "Objective" })).toBeNull();
            } else {
                expect(
                    screen
                        .getByRole("treeitem", { name: /Other objective/ })
                        .getAttribute("aria-selected")
                ).toBe("true");
            }
        }
    );

    it("keeps the selected meeting and gives visible feedback when deletion is rejected", async () => {
        const { api, summary } = clientFixture();
        api.list = vi.fn(async () => ({
            meetings: [{ ...summary, lifecycle: "terminal", deletionStatus: "allowed" }]
        }));
        api.deleteMeeting = vi.fn(async () => ({
            kind: "rejected",
            error: { code: "VERSION_CONFLICT", message: "changed" }
        }));
        render(translatedPanel({ api }, "en"));
        fireEvent.click(await screen.findByRole("treeitem", { name: /核对议题 A/ }));
        await screen.findByRole("region", { name: "Objective" });
        fireEvent.click(
            screen.getByRole("button", { name: `Actions for meeting ${summary.objective}` })
        );
        fireEvent.click(screen.getByRole("menuitem", { name: "Delete meeting" }));
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(screen.getByRole("button", { name: "Delete meeting" }));
        expect((await screen.findByRole("alert")).textContent).toContain(
            "Deletion was not confirmed"
        );
        expect(
            screen.getByRole("treeitem", { name: /核对议题 A/ }).getAttribute("aria-selected")
        ).toBe("true");
        expect(screen.getByRole("region", { name: "Objective" })).toBeTruthy();
    });
    it("loads the selected projection, accepts refresh notices, and disposes the stream", async () => {
        const { api, summary, releaseNotice, acceptNotice, dispose } = clientFixture();
        const { unmount } = render(translatedPanel({ api }, "en"));
        const item = await screen.findByRole("treeitem", { name: /核对议题 A/ });
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
            render(translatedPanel({ api }, "en"));

            fireEvent.click(await screen.findByRole("treeitem", { name: /核对议题 A/ }));
            fireEvent.click(screen.getByRole("treeitem", { name: /Second objective/ }));
            await waitFor(() =>
                expect(
                    within(screen.getByRole("main")).getByRole("heading", {
                        level: 3,
                        name: "Second detail"
                    })
                ).toBeTruthy()
            );

            if (settlement === "resolve") {
                resolveFirst(view);
            } else {
                rejectFirst(new Error("late failure"));
            }
            await waitFor(() =>
                expect(
                    within(screen.getByRole("main")).getByRole("heading", {
                        level: 3,
                        name: "Second detail"
                    })
                ).toBeTruthy()
            );
            expect(
                within(screen.getByRole("main")).queryByText(view.objective.statement)
            ).toBeNull();
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
        render(translatedPanel({ api }, "en"));
        fireEvent.click(await screen.findByRole("treeitem", { name: /核对议题 A/ }));
        expect(await screen.findByRole("region", { name: "Objective" })).toBeTruthy();

        releaseNotice();

        expect(await screen.findByText("No meetings.")).toBeTruthy();
        expect(screen.queryByRole("region", { name: "Objective" })).toBeNull();
        fireEvent.focus(window);
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
        render(translatedPanel({ api }, "en"));
        fireEvent.click(await screen.findByRole("treeitem", { name: /核对议题 A/ }));
        await waitFor(() =>
            expect(
                within(screen.getByRole("main")).getByRole("heading", {
                    level: 3,
                    name: view.objective.statement
                })
            ).toBeTruthy()
        );

        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

        expect((await screen.findByRole("alert")).textContent).toBe("Meeting data is unavailable.");
        expect(
            within(screen.getByRole("main")).getByRole("heading", {
                level: 3,
                name: view.objective.statement
            })
        ).toBeTruthy();
        expect(screen.getByLabelText(`Meeting ${summary.meetingId}`)).toBeTruthy();
    });
});
