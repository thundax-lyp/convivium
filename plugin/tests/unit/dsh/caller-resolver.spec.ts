import type { Agent } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import { describe, expect, it } from "vitest";

import {
    resolveMeetingCaller,
    resolveMeetingCallerV1,
    type MeetingOwnershipLookup,
    type MeetingOwnershipLookupV1,
    type MeetingOwnershipRecord
} from "@/dsh/caller-resolver.js";

function agent(id: string): Agent {
    return { id: SessionId(id) } as Agent;
}

function ownership(overrides: Partial<MeetingOwnershipRecord> = {}): MeetingOwnershipRecord {
    return {
        sessionId: "participant-session",
        parentSessionId: "captain-session",
        sessionLabel: "convivium:meeting-participant:team-1:meeting-1:participant-1",
        provider: "spawn",
        initialMessageId: "message-1",
        role: "participant",
        participantId: "participant-1",
        lifecycleStatus: "active",
        capabilityStatus: "active",
        createdAt: 1,
        updatedAt: 1,
        ...overrides
    };
}

function lookup(
    value: Awaited<ReturnType<MeetingOwnershipLookup["findBySessionId"]>>
): MeetingOwnershipLookup {
    return {
        findBySessionId: async (sessionId) =>
            value?.ownership.sessionId === sessionId ? value : undefined
    };
}

describe("meeting caller resolver", () => {
    it("resolves an active participant only from Agent identity and verified ownership", async () => {
        const result = await resolveMeetingCaller(
            agent("participant-session"),
            lookup({ teamId: "team-1", meetingId: "meeting-1", ownership: ownership() }),
            new AbortController().signal
        );

        expect(result).toMatchObject({
            kind: "participant",
            sessionId: "participant-session",
            teamId: "team-1",
            meetingId: "meeting-1",
            participantId: "participant-1"
        });
    });

    it("resolves an active Manager without a participant identity", async () => {
        const result = await resolveMeetingCaller(
            agent("manager-session"),
            lookup({
                teamId: "team-1",
                meetingId: "meeting-1",
                ownership: ownership({
                    sessionId: "manager-session",
                    sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                    role: "manager",
                    participantId: undefined
                })
            }),
            new AbortController().signal
        );

        expect(result).toMatchObject({
            kind: "manager",
            sessionId: "manager-session",
            teamId: "team-1",
            meetingId: "meeting-1"
        });
        expect("participantId" in result && result.participantId).toBe(false);
    });

    it.each([
        ["unknown caller", undefined],
        [
            "provisioning caller",
            {
                teamId: "team-1",
                meetingId: "meeting-1",
                ownership: ownership({ lifecycleStatus: "provisioning" })
            }
        ],
        [
            "revoked caller",
            {
                teamId: "team-1",
                meetingId: "meeting-1",
                ownership: ownership({ capabilityStatus: "revoked" })
            }
        ],
        [
            "inconsistent label",
            {
                teamId: "team-1",
                meetingId: "meeting-1",
                ownership: ownership({
                    sessionLabel: "convivium:meeting-participant:team-1:meeting-1:other"
                })
            }
        ]
    ])("rejects a %s", async (_name, found) => {
        const result = await resolveMeetingCaller(
            agent("participant-session"),
            lookup(found),
            new AbortController().signal
        );
        expect(result).toMatchObject({ code: "UNAUTHORIZED_CALLER", retryable: false });
    });
});

function targetLookup(
    value: Awaited<ReturnType<MeetingOwnershipLookupV1["findBySessionId"]>>
): MeetingOwnershipLookupV1 {
    return {
        findBySessionId: async (sessionId) =>
            value?.ownership.sessionId === sessionId ? value : undefined
    };
}

describe("target Meeting caller resolver", () => {
    const target = ownership({
        id: "ownership-1",
        meetingId: "meeting-1",
        identityId: "identity-1",
        sessionLabel: "convivium:meeting-identity:participant:meeting-1:identity-1"
    });

    it("binds the tool caller only from an active target ownership", async () => {
        const result = await resolveMeetingCallerV1(
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
        ["closed", { lifecycleStatus: "closed" as const }],
        ["revoked", { capabilityStatus: "revoked" as const }],
        [
            "label mismatch",
            { sessionLabel: "convivium:meeting-identity:manager:meeting-1:identity-1" }
        ],
        ["child mismatch", { sessionId: "other-session" }]
    ])("fails closed for %s ownership", async (_name, overrides) => {
        const changed = { ...target, ...overrides };
        const result = await resolveMeetingCallerV1(
            agent("participant-session"),
            {
                findBySessionId: async () => ({ meetingId: "meeting-1", ownership: changed })
            },
            new AbortController().signal
        );
        expect(result).toBeUndefined();
    });
});
