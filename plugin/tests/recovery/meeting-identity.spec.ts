import { describe, expect, it } from "vitest";
import { endMeetingV1 } from "@/domain/transitions/meeting-end.js";
import { recoverMeetingCommandsV1 } from "@/runtime/services/meeting-command-recovery.js";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state-v1.js";
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
        const result = await recoverMeetingCommandsV1({
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
                    childSessionId: "meeting-v1-participant-identity-1",
                    definitionHash: "0".repeat(64),
                    rationale: "理由",
                    expectedContribution: "贡献",
                    evidenceGap: "缺口",
                    createdAt: 1
                }
            ]
        };
        const terminal = endMeetingV1(state, {
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
