import { describe, expect, it, vi } from "vitest";
import { followupMeetingIdentitySession } from "@/dsh/index.js";

const ownership = {
    id: "owner-1",
    meetingId: "meeting-1",
    identityId: "identity-1",
    sessionId: "child-1",
    parentSessionId: "captain-1",
    sessionLabel: "convivium:meeting-identity:participant:meeting-1:identity-1",
    provider: "spawn",
    role: "participant" as const,
    lifecycleStatus: "active" as const,
    capabilityStatus: "active" as const,
    createdAt: 1,
    updatedAt: 1
};

describe("meeting identity notice adapter", () => {
    it("sends through the exact parent and persisted child without adding business facts", async () => {
        const sendMessage = vi.fn().mockResolvedValue("message-1");
        await expect(
            followupMeetingIdentitySession({
                runtime: { sendMessage },
                parent: { id: "captain-1" } as never,
                ownership,
                meetingId: "meeting-1",
                identityId: "identity-1",
                prompt: [{ type: "text", text: "notice" }],
                signal: new AbortController().signal
            })
        ).resolves.toBe("message-1");
        expect(sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({ id: "captain-1" }),
            "child-1",
            [{ type: "text", text: "notice" }],
            { signal: expect.any(AbortSignal) }
        );
    });

    it.each([
        ["wrong parent", { parent: { id: "captain-other" } }],
        ["wrong identity", { identityId: "identity-other" }],
        ["wrong label", { ownership: { ...ownership, sessionLabel: "invalid" } }],
        ["closed", { ownership: { ...ownership, lifecycleStatus: "closed" } }]
    ])("rejects %s", async (_name, override) => {
        await expect(
            followupMeetingIdentitySession({
                runtime: { sendMessage: vi.fn() },
                parent: { id: "captain-1" } as never,
                ownership,
                meetingId: "meeting-1",
                identityId: "identity-1",
                prompt: [{ type: "text", text: "notice" }],
                signal: new AbortController().signal,
                ...override
            } as never)
        ).rejects.toThrow("active owned Meeting identity Session");
    });
});
