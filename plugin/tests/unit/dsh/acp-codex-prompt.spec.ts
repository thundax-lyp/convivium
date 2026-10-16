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
    it("sends native execution policy and only new persistent user inputs", () => {
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
            {
                type: "text",
                text: "[ACP native execution]\nSession: session\nUse only your native tools and Skills. The host owns meeting permissions and result acceptance. Follow the supplied task; do not call Convivium or DSH tools."
            },
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
    it("does not project host system, developer Skills or old assistant output", () => {
        const options = input();
        const result = buildCodexPrompt(
            {
                ...options,
                messages: [
                    ...options.messages,
                    createMessage({
                        role: "developer",
                        source: { kind: "user" },
                        content: [{ type: "text", text: "CONVIVIUM_SKILL_BODY_AND_TOOL_DIRECTORY" }]
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
        expect(JSON.stringify(result.prompt)).not.toContain(
            "CONVIVIUM_SKILL_BODY_AND_TOOL_DIRECTORY"
        );
        expect(JSON.stringify(result.prompt)).not.toContain("ROLE IDENTITY");
        expect(JSON.stringify(result.prompt)).not.toContain("OLD ANSWER");
    });
    it.each([
        { purpose: "compaction" },
        { temperature: 0 },
        { maxTokens: 1 },
        { stop: [] },
        { sessionId: undefined }
    ])("rejects unsupported request controls %j", (patch) => {
        expect(() => buildCodexPrompt({ ...input(), ...patch }, undefined)).toThrow(/Unsupported/);
    });
});
