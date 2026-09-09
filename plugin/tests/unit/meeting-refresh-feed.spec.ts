import { describe, expect, it } from "vitest";

import { createMeetingRefreshFeed } from "@/runtime/services/meeting-refresh-feed.js";

describe("meeting refresh feed", () => {
    it("delivers one initial refresh and deduplicates versions", async () => {
        const feed = createMeetingRefreshFeed();
        const iterator = feed.watch(new AbortController().signal)[Symbol.asyncIterator]();
        await expect(iterator.next()).resolves.toEqual({ done: false, value: { kind: "refresh" } });
        feed.notify("meeting-1", 1);
        feed.notify("meeting-1", 1);
        await expect(iterator.next()).resolves.toEqual({ done: false, value: { kind: "refresh" } });
        const pending = iterator.next();
        feed.notify("meeting-1", 2);
        await expect(pending).resolves.toEqual({ done: false, value: { kind: "refresh" } });
        feed.notify("meeting-1", 3);
        feed.notify("meeting-1", 4);
        await expect(iterator.next()).resolves.toEqual({ done: false, value: { kind: "refresh" } });
        await iterator.return?.();
        feed.dispose();
    });

    it("gives each subscriber an initial and merged refresh independently", async () => {
        const feed = createMeetingRefreshFeed();
        const first = feed.watch(new AbortController().signal)[Symbol.asyncIterator]();
        const second = feed.watch(new AbortController().signal)[Symbol.asyncIterator]();
        await expect(first.next()).resolves.toEqual({ done: false, value: { kind: "refresh" } });
        await expect(second.next()).resolves.toEqual({ done: false, value: { kind: "refresh" } });
        feed.notify("meeting-1", 1);
        feed.notify("meeting-2", 1);
        await expect(first.next()).resolves.toEqual({ done: false, value: { kind: "refresh" } });
        await expect(second.next()).resolves.toEqual({ done: false, value: { kind: "refresh" } });
        feed.dispose();
        await expect(first.next()).resolves.toEqual({ done: true, value: undefined });
        await expect(second.next()).resolves.toEqual({ done: true, value: undefined });
    });

    it("closes pending reads on abort, return and dispose", async () => {
        const feed = createMeetingRefreshFeed();
        const controller = new AbortController();
        const aborted = feed.watch(controller.signal)[Symbol.asyncIterator]();
        await aborted.next();
        const pendingAbort = aborted.next();
        controller.abort();
        await expect(pendingAbort).resolves.toEqual({ done: true, value: undefined });

        const returned = feed.watch(new AbortController().signal)[Symbol.asyncIterator]();
        await returned.next();
        const pendingReturn = returned.next();
        await returned.return?.();
        await expect(pendingReturn).resolves.toEqual({ done: true, value: undefined });

        const disposed = feed.watch(new AbortController().signal)[Symbol.asyncIterator]();
        await disposed.next();
        const pendingDispose = disposed.next();
        feed.dispose();
        await expect(pendingDispose).resolves.toEqual({ done: true, value: undefined });
    });

    it("does not replay notifications sent before a new watch", async () => {
        const feed = createMeetingRefreshFeed();
        feed.notify("meeting-1", 1);
        const iterator = feed.watch(new AbortController().signal)[Symbol.asyncIterator]();
        await expect(iterator.next()).resolves.toEqual({ done: false, value: { kind: "refresh" } });
        const pending = iterator.next();
        feed.notify("meeting-1", 1);
        await iterator.return?.();
        await expect(pending).resolves.toEqual({ done: true, value: undefined });
        feed.dispose();
    });
});
