import { peerBindings } from "../../fixtures/peer-ownership.js";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import { describe, expect, it } from "vitest";

import { resolveMeetingCaller, type MeetingOwnershipLookup } from "@/dsh/caller-resolver.js";

function agent(id: string): Agent {
    return { id: SessionId(id) } as Agent;
}

function targetLookup(
    value: Awaited<ReturnType<MeetingOwnershipLookup["findBySessionId"]>>
): MeetingOwnershipLookup {
    return {
        findBySessionId: async (sessionId) =>
            value?.ownership.sessionId === sessionId ? value : undefined
    };
}

describe("target Meeting caller resolver", () => {
    const target = {
        ...peerBindings("meeting-1", [{ id: "identity-1", roles: ["contributor"] }])
            .initialOwnership[0]!,
        id: "ownership-1",
        sessionId: "participant-session",
        lifecycleStatus: "active" as const,
        createdAt: 1,
        updatedAt: 1
    };

    it("binds the tool caller only from an active target ownership", async () => {
        const result = await resolveMeetingCaller(
            agent("participant-session"),
            targetLookup({ meetingId: "meeting-1", ownership: target }),
            new AbortController().signal
        );
        expect(result).toEqual({
            caller: {
                channel: "dsh_tool",
                principalId: "identity-1",
                sessionBindingId: "ownership-1"
            },
            meetingId: "meeting-1",
            identityId: "identity-1",
            role: "participant",
            ownership: target
        });
        expect(result).not.toHaveProperty("teamId");
        expect(result).not.toHaveProperty("participantId");
    });

    it.each([
        ["cross Meeting", { meetingId: "meeting-2" }],
        ["cross identity", { identityId: "identity-2" }],
        ["provisioning", { lifecycleStatus: "provisioning" as const }],
        ["closed", { lifecycleStatus: "closed" as const }],
        ["revoked", { capabilityStatus: "revoked" as const }],
        [
            "label mismatch",
            { sessionLabel: "convivium:meeting-identity:manager:meeting-1:identity-1" }
        ],
        ["child mismatch", { sessionId: "other-session" }]
    ])("fails closed for %s ownership", async (_name, overrides) => {
        const changed = { ...target, ...overrides };
        const result = await resolveMeetingCaller(
            agent("participant-session"),
            {
                findBySessionId: async () => ({ meetingId: "meeting-1", ownership: changed })
            },
            new AbortController().signal
        );
        expect(result).toBeUndefined();
    });
});
