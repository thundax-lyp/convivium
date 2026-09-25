import { vi } from "vitest";
import { recoverTargetMeetingDeliveries } from "@/runtime/meeting-lifecycle.js";
import { describe, expect, it } from "vitest";
import { endMeeting } from "@/domain/transitions/meeting-end.js";
import { recoverMeetingCommands } from "@/runtime/services/meeting-command-recovery.js";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state.js";
describe("identity admission recovery", () => {
    it("wakes the existing outbox worker after recovery finds pending effects", async () => {
        let woken = 0;
        const recovered = {
            bootstrap: {
                status: "ready",
                createRequestId: "create-1",
                requestHash: "hash",
                createdAt: 1,
                updatedAt: 1
            },
            sessionOwnership: [],
            reclaimedOutbox: 1,
            pendingOutbox: 1
        };
        const result = await recoverMeetingCommands({
            repository: { recover: async () => recovered } as never,
            wakeOutbox: () => {
                woken += 1;
            }
        });
        expect(result.pendingOutbox).toBe(1);
        expect(woken).toBe(1);
    });

    it("does not leave a provisioning intent schedulable at terminal", () => {
        const state = {
            ...makeRunningMeetingStateV1(),
            identityRecommendations: [
                {
                    id: "rec-1",
                    candidateId: "candidate-1",
                    definitionId: "domain_architect",
                    definitionVersion: "1",
                    catalogId: "catalog-1",
                    catalogVersion: "1",
                    agendaId: "agenda-v1",
                    managerId: "manager-v1",
                    decision: "admit",
                    status: "provisioning",
                    identityId: "identity-1",
                    sessionId: "meeting-v1-participant-identity-1",
                    definitionHash: "0".repeat(64),
                    rationale: "理由",
                    expectedContribution: "贡献",
                    evidenceGap: "缺口",
                    createdAt: 1
                }
            ]
        };
        const terminal = endMeeting(state, {
            terminationId: "termination-1",
            outcome: "partial",
            reason: "结束会议",
            decisionIds: [],
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            actorId: "local",
            now: 2
        });
        expect(terminal.kind).toBe("accepted");
        if (terminal.kind !== "accepted") return;
        expect(terminal.state.lifecycle.status).toBe("terminal");
        expect(terminal.state.identityRecommendations[0]).toMatchObject({
            status: "failed",
            failureCode: "ADMISSION_CONFLICT"
        });
    });
});

const recoveryFixture = (status: string, bootstrapStatus = "ready") => {
    const owners = [
        {
            id: "owner-1",
            identityId: "identity-1",
            meetingId: "meeting-1",
            sessionId: "persisted-session-1",
            lifecycleStatus: "active",
            capabilityStatus: "active",
            definition: { agentDefinitionId: "fixture", definitionVersion: "1" },
            descriptorId: "descriptor-1",
            createdAt: 1,
            updatedAt: 1
        }
    ];
    const recovered = {
        bootstrap: {
            status: bootstrapStatus,
            creator: { kind: "local_user", principalId: "local-controller" },
            createRequestId: "request-1",
            requestHash: "hash",
            createdAt: 1
        },
        snapshot:
            bootstrapStatus === "ready"
                ? {
                      state: {
                          id: "meeting-1",
                          lifecycle: { status },
                          identities: [{ id: "identity-1", sessionOwnershipId: "owner-1" }]
                      }
                  }
                : undefined,
        sessionOwnership: owners,
        preparedDescriptors: [{ descriptorId: "descriptor-1", expiresAt: 100 }]
    };
    const owner = {
        resume: vi.fn(async () => {}),
        suspend: vi.fn(async () => {}),
        stop: vi.fn(async ({ ownership }) => {
            expect(ownership.capabilityStatus).toBe("revoked");
        })
    };
    const ensureDelivery = vi.fn(async () => {});
    const stopDelivery = vi.fn(async () => {});
    const repository = {
        recover: async () => recovered,
        recordSessionOwnership: vi.fn(async (input) => {
            const row = { ...input, createdAt: 1, updatedAt: 2 };
            owners.splice(0, 1, row);
            return row;
        }),
        updateBootstrap: vi.fn(async () => {
            recovered.bootstrap.status = "creation_failed";
            owners[0]!.capabilityStatus = "revoked";
        }),
        completeCreate: vi.fn(async () => {
            recovered.bootstrap.status = "ready";
            recovered.snapshot = {
                state: {
                    id: "meeting-1",
                    lifecycle: { status: "running" },
                    identities: [{ id: "identity-1", sessionOwnershipId: "owner-1" }]
                }
            };
        })
    };
    const run = () =>
        recoverTargetMeetingDeliveries({
            registry: {
                listMeetings: () => [{ meetingId: "meeting-1" }],
                openMeeting: async () => repository
            },
            owner,
            definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
            ensureDelivery,
            stopDelivery,
            now: () => 50
        } as never);
    return { run, owner, owners, recovered, repository, ensureDelivery, stopDelivery };
};

describe("peer Meeting cold recovery", () => {
    it("resumes the original active Session without a Captain or preflight TTL renewal", async () => {
        const f = recoveryFixture("running");
        f.recovered.preparedDescriptors[0]!.expiresAt = 1;
        await f.run();
        expect(f.owner.resume).toHaveBeenCalledWith(
            expect.objectContaining({
                ownership: expect.objectContaining({ sessionId: "persisted-session-1" }),
                purpose: "delivery"
            })
        );
        expect(f.ensureDelivery).toHaveBeenCalledWith("meeting-1");
    });
    it("suspends paused Meetings after stopping delivery and never resumes them", async () => {
        const f = recoveryFixture("paused");
        await f.run();
        expect(f.stopDelivery.mock.invocationCallOrder[0]).toBeLessThan(
            f.owner.suspend.mock.invocationCallOrder[0]!
        );
        expect(f.owner.resume).not.toHaveBeenCalled();
        expect(f.ensureDelivery).not.toHaveBeenCalled();
    });
    it("revokes terminal Sessions before scheduling archive cleanup", async () => {
        const f = recoveryFixture("terminal");
        await f.run();
        expect(f.owners[0]!.capabilityStatus).toBe("revoked");
        expect(f.owner.resume).not.toHaveBeenCalled();
        expect(f.ensureDelivery).toHaveBeenCalledWith("meeting-1");
    });
    it("cleans a failed bootstrap instead of skipping it", async () => {
        const f = recoveryFixture("running", "creation_failed");
        f.owners[0]!.capabilityStatus = "revoked";
        await f.run();
        expect(f.owner.stop).toHaveBeenCalledTimes(1);
        expect(f.owners[0]!.lifecycleStatus).toBe("closed");
        expect(f.ensureDelivery).not.toHaveBeenCalled();
    });
    it("fails and revokes an expired provisional bootstrap without extending its descriptor", async () => {
        const f = recoveryFixture("running", "creating");
        f.owners[0]!.lifecycleStatus = "provisioning";
        f.recovered.preparedDescriptors[0]!.expiresAt = 1;
        await f.run();
        expect(f.repository.updateBootstrap).toHaveBeenCalled();
        expect(f.owner.resume).not.toHaveBeenCalled();
        expect(f.owner.stop).toHaveBeenCalledTimes(1);
        expect(f.repository.completeCreate).not.toHaveBeenCalled();
    });
    it("recovers a provisional Session then publishes the saved creation", async () => {
        const f = recoveryFixture("running", "creating");
        f.owners[0]!.lifecycleStatus = "provisioning";
        await f.run();
        expect(f.owner.resume.mock.calls.map(([input]) => input.purpose)).toEqual([
            "provisioning",
            "delivery"
        ]);
        expect(f.repository.completeCreate).toHaveBeenCalledWith(
            expect.objectContaining({ requestId: "request-1", requestHash: "hash" })
        );
    });
    it("rejects resource, header or owner failures without starting delivery", async () => {
        const f = recoveryFixture("running");
        f.owner.resume.mockRejectedValueOnce(new Error("RECOVERY_UNAVAILABLE"));
        await expect(f.run()).rejects.toThrow("RECOVERY_UNAVAILABLE");
        expect(f.ensureDelivery).not.toHaveBeenCalled();
    });
});
