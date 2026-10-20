import { describe, expect, it } from "vitest";
import { meetingDeletionStatus } from "@/runtime/services/meeting-deletion.ts";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { peerBindings } from "../../fixtures/peer-ownership.ts";
import type { SessionOwnership } from "@/repository/index.ts";

const recovery = () => {
    const state = makeRunningMeetingStateV1();
    state.identities = state.identities.map((i) => ({
        ...i,
        sessionOwnershipId: `ownership-${i.id}`
    }));
    const ownership: SessionOwnership[] = peerBindings(
        state.id,
        state.identities
    ).initialOwnership.map((o) => ({
        ...o,
        lifecycleStatus: "closed" as const,
        capabilityStatus: "revoked" as const,
        createdAt: 1,
        updatedAt: 2
    }));
    return {
        snapshot: { meetingId: state.id, version: 1, state, createdAt: 1, updatedAt: 2 },
        sessionOwnership: ownership,
        pendingOutbox: 0
    };
};

describe("Meeting deletion eligibility", () => {
    it.each(["preparing", "running", "converging", "ending", "archiving"] as const)(
        "rejects %s even with closed Sessions",
        (status) => {
            const input = recovery();
            input.snapshot.state.lifecycle.status = status;
            expect(meetingDeletionStatus(input)).toBe("active");
        }
    );
    it.each(["paused", "terminal", "archived"] as const)(
        "allows %s even with pending work and open Sessions",
        (status) => {
            const input = recovery();
            input.snapshot.state.lifecycle.status = status;
            input.pendingOutbox = 1;
            input.sessionOwnership[0]!.capabilityStatus = "active";
            expect(meetingDeletionStatus(input)).toBe("allowed");
        }
    );
});
