import { describe, expect, it } from "vitest";
import { createMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { buildCodexPrompt } from "@/dsh/acp-codex/prompt.ts";

const user = (id: string, value: string) => ({
    ...createMessage({
        role: "user",
        source: { kind: "user" },
        content: [{ type: "text", text: value }]
    }),
    id
});
const input = () => ({
    provider: "acp-codex",
    model: "codex",
    sessionId: SessionId("session"),
    system: "ROLE IDENTITY",
    messages: [user("first", "hello")]
});
describe("Codex ACP prompt projection", () => {
    it("sends current identity and only new persistent user inputs", () => {
        const first = buildCodexPrompt(input(), undefined);
        const next = {
            ...input(),
            system: "CURRENT IDENTITY",
            messages: [...input().messages, user("second", "next")]
        };
        const result = buildCodexPrompt(next, {
            messageIds: first.prefixMessageIds,
            sha256: first.prefixSha256
        });
        expect(result.inputMessageIds).toEqual(["second"]);
        expect(result.prefixMessageIds).toEqual(["first", "second"]);
        expect(result.prompt).toEqual([
            { type: "text", text: "[System / role identity]\nCURRENT IDENTITY" },
            { type: "text", text: "[User input second]\nnext" }
        ]);
    });
    it("rejects edited or removed consumed history and duplicate IDs", () => {
        const first = buildCodexPrompt(input(), undefined);
        const prefix = { messageIds: first.prefixMessageIds, sha256: first.prefixSha256 };
        expect(() =>
            buildCodexPrompt(
                { ...input(), messages: [user("first", "changed"), user("second", "next")] },
                prefix
            )
        ).toThrow(/Unsupported/);
        expect(() =>
            buildCodexPrompt({ ...input(), messages: [user("second", "next")] }, prefix)
        ).toThrow(/Unsupported/);
        expect(() =>
            buildCodexPrompt(
                { ...input(), messages: [user("first", "hello"), user("first", "same")] },
                undefined
            )
        ).toThrow(/Unsupported/);
        expect(() => buildCodexPrompt(input(), prefix)).toThrow(/Unsupported/);
    });
    it("preserves developer context and ignores old assistant/tool output", () => {
        const options = input();
        const result = buildCodexPrompt(
            {
                ...options,
                messages: [
                    ...options.messages,
                    createMessage({
                        role: "developer",
                        source: { kind: "user" },
                        content: [{ type: "text", text: "current tools" }]
                    }),
                    createMessage({
                        role: "assistant",
                        source: { kind: "model", provider: "acp-codex", model: "codex" },
                        content: [{ type: "text", text: "OLD ANSWER" }]
                    })
                ]
            },
            undefined
        );
        expect(JSON.stringify(result.prompt)).toContain("current tools");
        expect(JSON.stringify(result.prompt)).not.toContain("OLD ANSWER");
    });
    it.each([
        { purpose: "compaction" },
        { temperature: 0 },
        { maxTokens: 1 },
        { stop: [] },
        { sessionId: undefined },
        { system: "" }
    ])("rejects unsupported request controls %j", (patch) => {
        expect(() => buildCodexPrompt({ ...input(), ...patch }, undefined)).toThrow(/Unsupported/);
    });
});
