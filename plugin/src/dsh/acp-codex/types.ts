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

export interface CodexToolBridge {
    readonly mcpServer: {
        type: "http";
        name: "convivium";
        url: string;
        headers: [{ name: "Authorization"; value: string }];
    };
    setRequest(
        input:
            | {
                  requestId: string;
                  tools: readonly import("@deepseek-ai/dsh-llm").ToolSchema[];
                  signal: AbortSignal;
              }
            | undefined
    ): void;
    close(): Promise<void>;
}
