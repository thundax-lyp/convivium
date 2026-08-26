import type { Agent } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import { describe, expect, it } from "vitest";

import {
    bindCaptainParent,
    resolveMeetingCaller,
    type MeetingOwnershipLookup,
    type MeetingOwnershipRecord
} from "../../../src/dsh/caller-resolver.js";

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
    return { findBySessionId: async () => value };
}

describe("meeting caller resolver", () => {
    it("binds the exact DSH caller as the Captain direct parent", () => {
        expect(bindCaptainParent(agent("captain-session"))).toEqual({
            kind: "captain",
            sessionId: "captain-session"
        });
    });

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
