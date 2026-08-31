import { describe, expect, it } from "vitest";
import { recoverMeetingRuntime } from "../../../src/runtime/services/meeting-recovery-service.js";

const recovered = {
    bootstrap: {
        status: "ready" as const,
        createRequestId: "create-1",
        requestHash: "hash-1",
        createdAt: 1,
        updatedAt: 1
    },
    snapshot: {
        teamId: "team-1",
        meetingId: "meeting-1",
        version: 1,
        state: {},
        createdAt: 1,
        updatedAt: 1
    },
    sessionOwnership: [
        {
            sessionId: "participant-session",
            parentSessionId: "captain-session",
            sessionLabel: "convivium:meeting-participant:team-1:meeting-1:participant-a",
            provider: "spawn",
            role: "participant" as const,
            participantId: "participant-a",
            lifecycleStatus: "active" as const,
            capabilityStatus: "active" as const,
            createdAt: 1,
            updatedAt: 1
        }
    ],
    reclaimedOutbox: 2,
    pendingOutbox: 1
};

describe("meeting recovery", () => {
    it("does not create or dispatch a new Manager plan during cold recovery", async () => {
        let inspected = false;
        const result = await recoverMeetingRuntime({
            repository: {
                recover: async () => ({
                    ...recovered,
                    snapshot: {
                        ...recovered.snapshot,
                        state: {
                            manager: {
                                status: "planning",
                                currentPlanningAttempt: { id: "planning-1", status: "running" }
                            },
                            currentTurn: undefined
                        }
                    }
                })
            },
            inspection: {
                listDescendants: async () => {
                    inspected = true;
                    return [];
                }
            },
            signal: new AbortController().signal
        });
        expect(result.parentStatus).toBe("absent");
        expect(result.pendingOutbox).toBe(1);
        expect(inspected).toBe(false);
    });

    it("reclaims repository state but does not dispatch without the live Captain parent", async () => {
        let inspected = false;
        const result = await recoverMeetingRuntime({
            repository: { recover: async () => recovered },
            inspection: {
                listDescendants: async () => {
                    inspected = true;
                    return [];
                }
            },
            signal: new AbortController().signal
        });
        expect(result).toMatchObject({ parentStatus: "absent", reclaimedOutbox: 2 });
        expect(inspected).toBe(false);
    });

    it("inspects only ownership-bound descendants after the exact parent is rebound", async () => {
        const result = await recoverMeetingRuntime({
            repository: { recover: async () => recovered },
            parent: { id: "captain-session" } as never,
            inspection: {
                listDescendants: async () =>
                    [
                        {
                            kind: "child",
                            id: "participant-session" as never,
                            activity: "inactive",
                            mode: "continuable",
                            label: recovered.sessionOwnership[0]!.sessionLabel,
                            hasChildren: false,
                            parentId: "captain-session" as never,
                            depth: 1
                        }
                    ] as never
            },
            signal: new AbortController().signal
        });
        expect(result.parentStatus).toBe("bound");
        expect(result.ownershipInspection?.observations).toHaveLength(1);
        expect(result.ownershipInspection?.diagnostics).toEqual([]);
    });
});
