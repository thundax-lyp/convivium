import { describe, expect, it } from "vitest";
import { endMeetingV1 } from "@/domain/transitions/meeting-end-v1.js";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state-v1.js";
describe("identity admission recovery", () => {
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
        const terminal = endMeetingV1(state, 2, "local");
        expect(terminal.lifecycle.status).toBe("terminal");
        expect(terminal.identityRecommendations[0]).toMatchObject({
            status: "failed",
            failureCode: "ADMISSION_CONFLICT"
        });
    });
});
