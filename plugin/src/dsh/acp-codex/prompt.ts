import type { ContentBlock } from "@agentclientprotocol/sdk";
import { LlmError, type GenerateOptions } from "@deepseek-ai/dsh-llm";
import { encodeCanonicalJson, sha256Hex } from "@/utils/index.ts";

const unsupported = (): never => {
    throw new LlmError("Unsupported Codex ACP input.", "ACP_CODEX_UNSUPPORTED_REQUEST");
};

export const buildCodexPrompt = (
    options: GenerateOptions,
    committedPrefix: { messageIds: readonly string[]; sha256: string } | undefined
): {
    prompt: ContentBlock[];
    inputMessageIds: readonly string[];
    prefixSha256: string;
    prefixMessageIds: readonly string[];
} => {
    if (
        !options.sessionId ||
        options.purpose !== undefined ||
        options.temperature !== undefined ||
        options.maxTokens !== undefined ||
        options.stop !== undefined
    ) {
        return unsupported();
    }
    const text = (content: GenerateOptions["messages"][number]["content"]): string =>
        content
            .map((block) => {
                if (block.type !== "text") {
                    return unsupported();
                }
                return block.text;
            })
            .join("\n");
    const users: { id: string; content: GenerateOptions["messages"][number]["content"] }[] = [];
    const developers: string[] = [];
    let system = options.system;
    for (const message of options.messages) {
        if (message.role === "system" && options.system === undefined) {
            system = text(message.content);
        }
        if (message.role === "developer") {
            developers.push(text(message.content));
        }
        if (message.role === "user") {
            if (!("id" in message) || !message.id || users.some((user) => user.id === message.id)) {
                return unsupported();
            }
            text(message.content);
            users.push({ id: message.id, content: message.content });
        }
    }
    if (!system?.trim()) {
        return unsupported();
    }
    const length = committedPrefix?.messageIds.length ?? 0;
    if (
        length >= users.length ||
        (committedPrefix &&
            (committedPrefix.messageIds.some((id, index) => users[index]?.id !== id) ||
                sha256Hex(encodeCanonicalJson(users.slice(0, length))) !== committedPrefix.sha256))
    ) {
        return unsupported();
    }
    const prompt: ContentBlock[] = [{ type: "text", text: `[System / role identity]\n${system}` }];
    for (const value of developers) {
        prompt.push({ type: "text", text: `[Developer context]\n${value}` });
    }
    for (const user of users.slice(length)) {
        prompt.push({ type: "text", text: `[User input ${user.id}]\n${text(user.content)}` });
    }
    return {
        prompt,
        inputMessageIds: users.slice(length).map((user) => user.id),
        prefixMessageIds: users.map((user) => user.id),
        prefixSha256: sha256Hex(encodeCanonicalJson(users))
    };
};
