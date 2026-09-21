import type { RemoteStream, RemoteStreamOptions } from "@deepseek-ai/dsh-api-gateway/client";
import type {
    ConnectionGeneration,
    ConnectionHandle
} from "@deepseek-ai/dsh-client-connection/client";
import type { MeetingRefreshNotice } from "@/protocol/index.js";
import { loadRemoteClientModule } from "./remote-client.js";

export function createControlledMeetingStream(
    onUnavailable: () => void = () => {},
    initialNotice = true,
    createStream?: (
        connection: Pick<ConnectionHandle, "generation">,
        options: RemoteStreamOptions<MeetingRefreshNotice>,
        Stream: typeof RemoteStream
    ) => RemoteStream<MeetingRefreshNotice>
) {
    const { RemoteStream, RemoteStreamCarrierError } = loadRemoteClientModule();
    let id = 1;
    let snapshot: ConnectionGeneration | undefined = { id, host: { home: "/test" } };
    const listeners = new Set<() => void>();
    const connection: Pick<ConnectionHandle, "generation"> = {
        generation: {
            getSnapshot: () => snapshot,
            subscribe(listener) {
                listeners.add(listener);
                return () => {
                    listeners.delete(listener);
                };
            }
        }
    };
    let deliver: ((value: MeetingRefreshNotice) => void) | undefined;
    let fail: ((error: Error) => void) | undefined;
    const options: RemoteStreamOptions<MeetingRefreshNotice> = {
        name: "convivium-test-updates",
        open(signal) {
            const queue: MeetingRefreshNotice[] = initialNotice ? [{ kind: "refresh" }] : [];
            let closed = false;
            let failure: Error | undefined;
            let pending:
                | {
                      resolve(value: IteratorResult<MeetingRefreshNotice>): void;
                      reject(error: Error): void;
                  }
                | undefined;
            const close = () => {
                closed = true;
                signal.removeEventListener("abort", close);
                pending?.resolve({ done: true, value: undefined });
                pending = undefined;
            };
            deliver = (value) => {
                if (closed) return;
                if (pending) {
                    pending.resolve({ done: false, value });
                    pending = undefined;
                } else queue.push(value);
            };
            fail = (error) => {
                failure = error;
                pending?.reject(error);
                pending = undefined;
            };
            signal.addEventListener("abort", close, { once: true });
            if (signal.aborted) close();
            const iterator: AsyncIterableIterator<MeetingRefreshNotice> = {
                next() {
                    if (closed) return Promise.resolve({ done: true, value: undefined });
                    if (failure) return Promise.reject(failure);
                    const value = queue.shift();
                    if (value) return Promise.resolve({ done: false, value });
                    return new Promise((resolve, reject) => {
                        pending = { resolve, reject };
                    });
                },
                return() {
                    close();
                    return Promise.resolve({ done: true, value: undefined });
                },
                [Symbol.asyncIterator]() {
                    return this;
                }
            };
            return iterator;
        },
        ended: () => new Error("Meeting update stream ended."),
        carrierFailed: onUnavailable
    };
    const stream = createStream
        ? createStream(connection, options, RemoteStream)
        : new RemoteStream(connection, options);
    return {
        stream,
        push(notice: MeetingRefreshNotice = { kind: "refresh" }) {
            deliver?.(notice);
        },
        disconnect() {
            snapshot = undefined;
            for (const listener of listeners) listener();
            fail?.(new RemoteStreamCarrierError("Test carrier disconnected"));
        },
        reconnect() {
            snapshot = { id: ++id, host: { home: "/test" } };
            for (const listener of listeners) listener();
        }
    };
}
