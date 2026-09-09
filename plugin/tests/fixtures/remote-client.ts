import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import * as cordis from "@deepseek-ai/cordis";
import Registry from "@deepseek-ai/dsh-typert-registry";
import type {
    ConnectionHandle,
    ClientConnectionRpc
} from "@deepseek-ai/dsh-client-connection/client";
import contribution from "@convivium/dsh-plugin/remote";

export function loadRemoteClientModule(): typeof import("@deepseek-ai/dsh-api-gateway/client") {
    const require = createRequire(import.meta.url);
    let result: typeof import("@deepseek-ai/dsh-api-gateway/client") | undefined;
    runInNewContext(readFileSync(require.resolve("@deepseek-ai/dsh-api-gateway/client"), "utf8"), {
        crypto: webcrypto,
        AbortController,
        AbortSignal,
        Error,
        setTimeout,
        clearTimeout,
        window: {
            __ModuleLoader__: {
                load(row: { factory: (resolve: (id: string) => typeof cordis) => typeof result }) {
                    result = row.factory((id) => {
                        if (id !== "@deepseek-ai/cordis")
                            throw new Error(`Unexpected external: ${id}`);
                        return cordis;
                    });
                }
            }
        }
    });
    if (!result) throw new Error("Remote Client factory did not load");
    return result;
}

export async function createRemoteClient(call: ClientConnectionRpc["call"]) {
    const ctx = new cordis.Context();
    try {
        await ctx.plugin(Registry);
        const connection: ConnectionHandle = {
            isLoopback: true,
            generation: {
                getSnapshot: () => ({ id: 1, host: { home: "/test" } }),
                subscribe: () => () => {}
            },
            state: { getSnapshot: () => "connected", subscribe: () => () => {} },
            rpc: {
                call,
                open: () => {
                    throw new Error("No streams in unary tests");
                }
            },
            reconnect() {},
            registerGenerationSource: () => () => {},
            start: () => ({ stop() {} })
        };
        ctx.provide("connection", connection);
        await ctx.plugin(loadRemoteClientModule());
        const unmount = await ctx.remote.$mount(contribution);
        return { ctx, unmount, dispose: () => ctx.fiber.dispose() };
    } catch (error) {
        await ctx.fiber.dispose();
        throw error;
    }
}
