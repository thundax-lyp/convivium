import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeetingClient, MeetingRefreshCallbacks } from "@/client/meeting-client.js";
import { ConviviumMeetingPanel } from "@/client/meeting-panel.js";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.js";
import { meetingTranslator } from "./meeting-panel-locale-fixtures.js";

afterEach(cleanup);

function deferred<T>() {
    let resolve = (_value: T) => undefined;
    let reject = (_error: unknown) => undefined;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

type RefreshItem = { accept(): void };

function recoveryFixture(stream?: AsyncIterable<RefreshItem>) {
    const { summary, view } = meetingProjectionFixture();
    let callbacks: MeetingRefreshCallbacks | undefined;
    const refreshStream = {
        async *[Symbol.asyncIterator]() {
            if (stream) yield* stream;
            else await new Promise<void>(() => undefined);
        },
        dispose: vi.fn(async () => undefined)
    };
    const api = {
        list: vi.fn(async () => ({ meetings: [summary] })),
        read: vi.fn(async () => view),
        control: vi.fn(async () => ({ kind: "accepted" as const })),
        subscribeRefresh: vi.fn((value: MeetingRefreshCallbacks) => {
            callbacks = value;
            return refreshStream;
        })
    } as unknown as MeetingClient;
    return { api, summary, view, refreshStream, callbacks: () => callbacks };
}

async function renderSelected(fixture: ReturnType<typeof recoveryFixture>) {
    const rendered = render(
        createElement(ConviviumMeetingPanel, {
            api: fixture.api,
            t: meetingTranslator("en")
        })
    );
    fireEvent.click(await screen.findByRole("button", { name: /核对议题 A/ }));
    await waitFor(() => expect(fixture.api.read).toHaveBeenCalledOnce());
    await waitFor(() =>
        expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(false)
    );
    return rendered;
}

describe("Meeting panel refresh recovery", () => {
    it("marks last-good data stale on carrier failure and reconnects only after the generation barrier", async () => {
        const fixture = recoveryFixture();
        await renderSelected(fixture);
        const list = deferred<{ meetings: [typeof fixture.summary] }>();
        const detail = deferred<typeof fixture.view>();
        fixture.api.list = vi.fn(() => list.promise) as never;
        fixture.api.read = vi.fn(() => detail.promise) as never;

        act(() => fixture.callbacks()?.carrierFailed());
        expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(true);
        act(() => fixture.callbacks()?.generationReopened());
        list.resolve({ meetings: [fixture.summary] });
        await act(async () => Promise.resolve());
        expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(true);

        detail.resolve(fixture.view);
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(false)
        );
        expect(fixture.api.subscribeRefresh).toHaveBeenCalledOnce();
    });

    it.each([
        ["list", true, false],
        ["detail", false, true],
        ["both", true, true]
    ] as const)(
        "keeps writes disabled when %s recovery fails",
        async (_case, failList, failDetail) => {
            const fixture = recoveryFixture();
            await renderSelected(fixture);
            fixture.api.list = vi.fn(async () => {
                if (failList) throw new Error("list failed");
                return { meetings: [fixture.summary] };
            });
            fixture.api.read = vi.fn(async () => {
                if (failDetail) throw new Error("detail failed");
                return fixture.view;
            });

            act(() => fixture.callbacks()?.carrierFailed());
            act(() => fixture.callbacks()?.generationReopened());

            await waitFor(() => expect(fixture.api.list).toHaveBeenCalledOnce());
            await waitFor(() => expect(fixture.api.read).toHaveBeenCalledOnce());
            expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(true);
            expect(
                within(screen.getByRole("region", { name: "Objective" })).getByText(
                    fixture.view.objective.statement
                )
            ).toBeTruthy();
        }
    );

    it("clears a captured selection missing from a recovered list and ignores its detail", async () => {
        const fixture = recoveryFixture();
        await renderSelected(fixture);
        fixture.api.list = vi.fn(async () => ({ meetings: [] }));
        fixture.api.read = vi.fn(async () => ({
            ...fixture.view,
            objective: { ...fixture.view.objective, statement: "obsolete detail" }
        }));

        act(() => fixture.callbacks()?.carrierFailed());
        act(() => fixture.callbacks()?.generationReopened());

        expect(await screen.findByText("Select a meeting.")).toBeTruthy();
        expect(screen.queryByText("obsolete detail")).toBeNull();
    });

    it("discards an older recovery generation after a newer generation succeeds", async () => {
        const fixture = recoveryFixture();
        await renderSelected(fixture);
        const oldList = deferred<{ meetings: [typeof fixture.summary] }>();
        const oldDetail = deferred<typeof fixture.view>();
        const newest = {
            ...fixture.view,
            version: fixture.view.version + 2,
            objective: { ...fixture.view.objective, statement: "newest generation" }
        };
        fixture.api.list = vi
            .fn()
            .mockImplementationOnce(() => oldList.promise)
            .mockResolvedValueOnce({ meetings: [fixture.summary] });
        fixture.api.read = vi
            .fn()
            .mockImplementationOnce(() => oldDetail.promise)
            .mockResolvedValueOnce(newest);

        act(() => fixture.callbacks()?.carrierFailed());
        act(() => fixture.callbacks()?.generationReopened());
        act(() => fixture.callbacks()?.generationReopened());
        await waitFor(() =>
            expect(
                within(screen.getByRole("region", { name: "Objective" })).getByText(
                    "newest generation"
                )
            ).toBeTruthy()
        );

        oldList.resolve({ meetings: [fixture.summary] });
        oldDetail.resolve({
            ...fixture.view,
            objective: { ...fixture.view.objective, statement: "obsolete generation" }
        });
        await act(async () => Promise.resolve());
        expect(
            within(screen.getByRole("region", { name: "Objective" })).getByText("newest generation")
        ).toBeTruthy();
        expect(screen.queryByText("obsolete generation")).toBeNull();
    });

    it("replaces disconnected recovery with an accepted refresh notice generation", async () => {
        const notice = deferred<void>();
        const accept = vi.fn();
        const stream = {
            async *[Symbol.asyncIterator]() {
                await notice.promise;
                yield { accept };
                await new Promise<void>(() => undefined);
            }
        };
        const fixture = recoveryFixture(stream);
        await renderSelected(fixture);
        act(() => fixture.callbacks()?.carrierFailed());
        fixture.api.list = vi.fn(async () => ({ meetings: [fixture.summary] }));
        fixture.api.read = vi.fn(async () => fixture.view);

        notice.resolve();

        await waitFor(() => expect(accept).toHaveBeenCalledOnce());
        await waitFor(() => expect(fixture.api.list).toHaveBeenCalledOnce());
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(false)
        );
    });

    it("discards a refresh generation and restores list freshness after selecting another Meeting", async () => {
        const notice = deferred<void>();
        const stream = {
            async *[Symbol.asyncIterator]() {
                await notice.promise;
                yield { accept: vi.fn() };
                await new Promise<void>(() => undefined);
            }
        };
        const fixture = recoveryFixture(stream);
        const secondSummary = {
            ...fixture.summary,
            meetingId: "meeting-second",
            objective: "Second objective"
        };
        const secondView = {
            ...fixture.view,
            meetingId: secondSummary.meetingId,
            objective: { ...fixture.view.objective, statement: "Second detail" }
        };
        fixture.api.list = vi.fn(async () => ({ meetings: [fixture.summary, secondSummary] }));
        await renderSelected(fixture);
        const refreshList = deferred<{ meetings: [typeof fixture.summary] }>();
        const refreshDetail = deferred<typeof fixture.view>();
        fixture.api.list = vi.fn(() => refreshList.promise) as never;
        fixture.api.read = vi
            .fn()
            .mockImplementationOnce(() => refreshDetail.promise)
            .mockResolvedValueOnce(secondView);

        notice.resolve();
        await waitFor(() => expect(fixture.api.list).toHaveBeenCalledOnce());
        fireEvent.click(screen.getByRole("button", { name: /Second objective/ }));
        await waitFor(() =>
            expect(
                within(screen.getByRole("region", { name: "Objective" })).getByText("Second detail")
            ).toBeTruthy()
        );
        expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(false);
        refreshList.resolve({ meetings: [fixture.summary] });
        refreshDetail.resolve({
            ...fixture.view,
            objective: { ...fixture.view.objective, statement: "obsolete refresh" }
        });
        await act(async () => Promise.resolve());
        expect(
            within(screen.getByRole("region", { name: "Objective" })).getByText("Second detail")
        ).toBeTruthy();
        expect(screen.queryByText("obsolete refresh")).toBeNull();
    });

    it("does not reconnect when the carrier fails during a recovery generation", async () => {
        const fixture = recoveryFixture();
        await renderSelected(fixture);
        const recoveryList = deferred<{ meetings: [typeof fixture.summary] }>();
        const recoveryDetail = deferred<typeof fixture.view>();
        fixture.api.list = vi.fn(() => recoveryList.promise) as never;
        fixture.api.read = vi.fn(() => recoveryDetail.promise) as never;

        act(() => fixture.callbacks()?.carrierFailed());
        act(() => fixture.callbacks()?.generationReopened());
        act(() => fixture.callbacks()?.carrierFailed());
        recoveryList.resolve({ meetings: [fixture.summary] });
        recoveryDetail.resolve(fixture.view);

        await waitFor(() => expect(fixture.api.read).toHaveBeenCalledOnce());
        await act(async () => Promise.resolve());
        expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(true);
    });

    it("uses Browser focus for recovery and removes the listener on unmount", async () => {
        const fixture = recoveryFixture();
        const rendered = await renderSelected(fixture);
        act(() => fixture.callbacks()?.carrierFailed());
        fixture.api.list = vi.fn(async () => ({ meetings: [fixture.summary] }));
        fixture.api.read = vi.fn(async () => fixture.view);

        fireEvent.focus(window);
        await waitFor(() => expect(fixture.api.list).toHaveBeenCalledOnce());
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(false)
        );
        rendered.unmount();
        fireEvent.focus(window);
        expect(fixture.api.list).toHaveBeenCalledOnce();
    });

    it("keeps terminal stream failure disconnected after a successful focus reread", async () => {
        const fail = deferred<void>();
        const stream = {
            [Symbol.asyncIterator]() {
                return {
                    async next(): Promise<IteratorResult<{ accept(): void }>> {
                        await fail.promise;
                        throw new Error("terminal stream failure");
                    }
                };
            }
        };
        const fixture = recoveryFixture(stream);
        await renderSelected(fixture);
        fail.resolve();
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(true)
        );
        fixture.api.list = vi.fn(async () => ({ meetings: [fixture.summary] }));
        fixture.api.read = vi.fn(async () => fixture.view);

        fireEvent.focus(window);
        await waitFor(() => expect(fixture.api.list).toHaveBeenCalledOnce());
        expect(screen.getByRole("button", { name: "Pause meeting" }).disabled).toBe(true);
    });
});
