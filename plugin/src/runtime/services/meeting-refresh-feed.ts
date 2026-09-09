import type { MeetingRefreshNoticeV1 } from "@/protocol/index.js";

export interface MeetingRefreshFeed {
    notify(meetingId: string, version: number): void;
    watch(signal: AbortSignal): AsyncIterable<MeetingRefreshNoticeV1>;
    dispose(): void;
}

interface Subscriber {
    closed: boolean;
    dirty: boolean;
    pending?: (result: IteratorResult<MeetingRefreshNoticeV1>) => void;
    removeAbortListener: () => void;
}

const refresh: MeetingRefreshNoticeV1 = { kind: "refresh" };

export function createMeetingRefreshFeed(): MeetingRefreshFeed {
    let disposed = false;
    const versions = new Map<string, number>();
    const subscribers = new Set<Subscriber>();

    const close = (subscriber: Subscriber): void => {
        if (subscriber.closed) return;
        subscriber.closed = true;
        subscribers.delete(subscriber);
        subscriber.removeAbortListener();
        subscriber.pending?.({ done: true, value: undefined });
        subscriber.pending = undefined;
    };

    const feed: MeetingRefreshFeed = {
        notify(meetingId, version) {
            if (disposed || versions.get(meetingId) === version) return;
            versions.set(meetingId, version);
            for (const subscriber of subscribers) {
                if (subscriber.closed) continue;
                if (subscriber.pending !== undefined) {
                    const resolve = subscriber.pending;
                    subscriber.pending = undefined;
                    resolve({ done: false, value: refresh });
                } else {
                    subscriber.dirty = true;
                }
            }
        },
        watch(signal) {
            if (disposed || signal.aborted) {
                return closedIterable();
            }

            let subscriber!: Subscriber;
            const onAbort = (): void => close(subscriber);
            signal.addEventListener("abort", onAbort, { once: true });
            subscriber = {
                closed: false,
                dirty: true,
                removeAbortListener: () => signal.removeEventListener("abort", onAbort)
            };
            subscribers.add(subscriber);

            const iterator: AsyncIterableIterator<MeetingRefreshNoticeV1> = {
                next: () => {
                    if (subscriber.closed) return Promise.resolve({ done: true, value: undefined });
                    if (subscriber.dirty) {
                        subscriber.dirty = false;
                        return Promise.resolve({ done: false, value: refresh });
                    }
                    return new Promise<IteratorResult<MeetingRefreshNoticeV1>>((resolve) => {
                        subscriber.pending = resolve;
                    });
                },
                return: () => {
                    close(subscriber);
                    return Promise.resolve({ done: true, value: undefined });
                },
                [Symbol.asyncIterator]() {
                    return this;
                }
            };
            return iterator;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const subscriber of [...subscribers]) close(subscriber);
            versions.clear();
        }
    };
    return feed;
}

function closedIterable(): AsyncIterable<MeetingRefreshNoticeV1> {
    return {
        async *[Symbol.asyncIterator]() {
            return;
        }
    };
}
