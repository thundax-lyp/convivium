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

export type CodexAcpBlock = Readonly<{
    code: "ACP_CODEX_OUTCOME_UNKNOWN" | "ACP_CODEX_RECOVERY_REQUIRED";
    since: number;
}>;
export type CodexAcpBinding = Readonly<{
    sessionId: string;
    rootSessionId: string;
    acpSessionId?: string;
    cwd: string;
    launchFingerprint: string;
    provider: "acp-codex";
    model: string;
    reasoningEffort?: string;
    state: "ready" | "blocked";
    block?: CodexAcpBlock;
    createdAt: number;
    updatedAt: number;
}>;
export type CodexAcpRequest = Readonly<{
    requestId: string;
    sessionId: string;
    rootSessionId: string;
    inputMessageIds: readonly string[];
    prefixMessageIds: readonly string[];
    prefixSha256: string;
    phase: "sending" | "responded" | "committed";
    startedAt: number;
    respondedAt?: number;
    committedAt?: number;
}>;
export type CodexAcpDelivery = Readonly<{
    sessionId: string;
    deliveryId: string;
    textSha256: string;
    state: "admitting" | "queued" | "completed" | "blocked";
    createdAt: number;
    updatedAt: number;
}>;
export interface CodexAcpStore {
    binding(sessionId: string): CodexAcpBinding | undefined;
    request(requestId: string): CodexAcpRequest | undefined;
    delivery(sessionId: string, deliveryId: string): CodexAcpDelivery | undefined;
    bindings(): readonly CodexAcpBinding[];
    requests(sessionId: string): readonly CodexAcpRequest[];
    deliveries(sessionId: string): readonly CodexAcpDelivery[];
    putBinding(record: CodexAcpBinding): Promise<void>;
    putRequest(record: CodexAcpRequest): Promise<void>;
    putDelivery(record: CodexAcpDelivery): Promise<void>;
    close(): Promise<void>;
}

export interface CodexAcpProviderPort {
    prepareSession(
        agent: import("@deepseek-ai/dsh-agent").Agent,
        purpose: "provisioning" | "delivery" | "cleanup",
        signal: AbortSignal
    ): Promise<void>;
    reconcileSession(sessionId: string, signal: AbortSignal): Promise<void>;
    deliveryState(
        sessionId: string,
        deliveryId: string
    ): "unseen" | "pending" | "completed" | "blocked";
    beginDelivery(input: { sessionId: string; deliveryId: string; text: string }): Promise<void>;
    markDeliveryQueued(sessionId: string, deliveryId: string): Promise<void>;
    finishDelivery(sessionId: string, deliveryId: string, signal: AbortSignal): Promise<void>;
    checkpoint(sessionId: string, signal: AbortSignal): Promise<void>;
    blockFor(sessionId: string): CodexAcpBlock | undefined;
    subscribeBlocks(listener: (rootSessionId: string) => void): () => void;
    stopSession(sessionId: string): Promise<void>;
    close(): Promise<void>;
}

declare module "@deepseek-ai/cordis" {
    interface Events {
        "convivium/acp-checkpoint"(payload: {
            sessionId: string;
            rootSessionId: string;
            phase: "bound" | "loaded" | "committed" | "delivery-completed" | "closed";
            bindingSha256: string;
            requestId?: string;
            deliveryId?: string;
        }): void;
    }
}
