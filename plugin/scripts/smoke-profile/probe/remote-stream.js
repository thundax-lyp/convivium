import WebSocket from "ws";

export async function openMeetingStream(origin, cookie) {
    const socket = new WebSocket(origin.replace(/^http/, "ws") + "/api/remote.mux", {
        headers: { cookie, origin }
    });
    const streamId = "convivium-smoke-updates";
    const queue = [];
    let pending;
    let failure;
    const fail = (error) => {
        failure = error;
        pending?.reject(error);
        pending = undefined;
    };
    socket.on("error", () => fail(new Error("Remote smoke socket failed.")));
    socket.on("close", () => fail(new Error("Remote smoke socket closed.")));
    socket.on("message", (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (
                message.streamId !== streamId ||
                message.type !== "item" ||
                message.value?.kind !== "refresh" ||
                Object.keys(message.value).length !== 1
            )
                throw new Error("Remote smoke stream contract failed.");
            if (pending) {
                pending.resolve(message.value);
                pending = undefined;
            } else queue.push(message.value);
        } catch (error) {
            fail(error);
        }
    });
    const close = async () => {
        if (socket.readyState === WebSocket.CLOSED) return;
        await new Promise((resolve) => {
            const timer = setTimeout(() => socket.terminate(), 1000);
            socket.once("close", () => {
                clearTimeout(timer);
                resolve();
            });
            socket.close();
        });
    };
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error("Remote smoke socket open timed out.")),
                10_000
            );
            const done = (error) => {
                clearTimeout(timer);
                socket.off("open", onOpen);
                socket.off("error", onError);
                if (error) reject(error);
                else resolve();
            };
            const onOpen = () => done();
            const onError = () => done(new Error("Remote smoke socket failed to open."));
            socket.once("open", onOpen);
            socket.once("error", onError);
        });
        socket.send(
            JSON.stringify({
                type: "open",
                streamId,
                endpoint: "conviviumMeetings/watchUpdates",
                payload: { args: {} }
            })
        );
        return {
            async next() {
                if (failure) throw failure;
                if (queue.length) return queue.shift();
                return new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        pending = undefined;
                        reject(new Error("Remote smoke refresh timed out."));
                    }, 10_000);
                    pending = {
                        resolve(value) {
                            clearTimeout(timer);
                            resolve(value);
                        },
                        reject(error) {
                            clearTimeout(timer);
                            reject(error);
                        }
                    };
                });
            },
            close
        };
    } catch (error) {
        await close();
        throw error;
    }
}
