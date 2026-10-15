import type { ClientSideConnection, InitializeResponse } from "@agentclientprotocol/sdk";

export interface CodexAcpConfig {
    readonly command: string;
    readonly args: readonly string[];
}
export interface CodexAcpConnection {
    readonly client: ClientSideConnection;
    readonly initialized: InitializeResponse;
    close(): Promise<void>;
}
