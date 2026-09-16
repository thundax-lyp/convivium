import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { recommendIdentityV1, recordIdentityAdmissionResultV1 } from "@/domain/index.js";

describe("identity domain transitions", () => {
    it("records reject without identity or effect", () => {
        const result = recommendIdentityV1(
            makeRunningMeetingStateV1(),
            {
                candidateId: "candidate-1",
                definitionId: "domain_architect",
                definitionVersion: "1",
                catalogId: "catalog-1",
                catalogVersion: "1",
                agendaId: "agenda-v1",
                decision: "reject",
                rationale: "不需要",
                expectedContribution: "形成证据",
                evidenceGap: "无"
            },
            "manager-v1",
            { recommendationId: "recommendation-1" },
            1
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.identityRecommendations[0]).toMatchObject({
            status: "rejected",
            decision: "reject"
        });
        expect(result).not.toHaveProperty("effect");
    });

    it("activates only the matching admitted reservation", () => {
        const admitted = recommendIdentityV1(
            makeRunningMeetingStateV1(),
            {
                candidateId: "candidate-1",
                definitionId: "domain_architect",
                definitionVersion: "1",
                catalogId: "catalog-1",
                catalogVersion: "1",
                agendaId: "agenda-v1",
                decision: "admit",
                rationale: "需要专门贡献",
                expectedContribution: "形成证据",
                evidenceGap: "缺少验证"
            },
            "manager-v1",
            {
                recommendationId: "recommendation-1",
                identityId: "identity-1",
                childSessionId: "meeting-v1-participant-identity-1"
            },
            1
        );
        expect(admitted.kind).toBe("accepted");
        if (admitted.kind !== "accepted") return;
        const result = recordIdentityAdmissionResultV1(
            admitted.state,
            "recommendation-1",
            {
                kind: "admitted",
                admissionId: "recommendation-1",
                meetingId: "meeting-v1",
                identityId: "identity-1",
                childSessionId: "meeting-v1-participant-identity-1",
                ownershipId: "ownership-1",
                descriptorId: "descriptor-1",
                displayName: "Architect",
                definitionId: "domain_architect",
                definitionVersion: "1",
                definitionHash: "a".repeat(64)
            },
            2
        );
        expect(result.kind).toBe("accepted");
        if (result.kind !== "accepted") return;
        expect(result.state.identityRecommendations[0].status).toBe("active");
        expect(result.state.identities.at(-1)).toMatchObject({
            id: "identity-1",
            roles: ["contributor"]
        });
    });
});
