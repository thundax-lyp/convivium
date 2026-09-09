import type { ClientRemote } from "@deepseek-ai/dsh-api-gateway/client";

export function loadRemoteClientModule(): typeof import("@deepseek-ai/dsh-api-gateway/client") {
    return undefined as never;
}

export function createRemoteClient(): ClientRemote {
    return undefined as never;
}
