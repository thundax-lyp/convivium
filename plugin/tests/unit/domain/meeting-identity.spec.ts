import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { recommendIdentity, recordIdentityAdmissionResult } from "@/domain/index.js";

describe("identity domain transitions", () => {
    function secondAgendaState() {
        const state = makeRunningMeetingStateV1();
        return {
            ...state,
            agenda: [
                ...state.agenda,
                {
                    id: "agenda-v2",
                    title: "议题 B",
                    question: "另一议题",
                    status: "pending" as const,
                    requiredOutputIds: ["output-v1"]
                },
                {
                    id: "agenda-v3",
                    title: "议题 C",
                    question: "第三议题",
                    status: "pending" as const,
                    requiredOutputIds: ["output-v1"]
                }
            ]
        };
    }

    it("records reject without identity or effect", () => {
        const result = recommendIdentity(
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
        const admitted = recommendIdentity(
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
                childSessionId: "meeting-v1-participant-identity-1",
                definitionHash: "a".repeat(64)
            },
            1
        );
        expect(admitted.kind).toBe("accepted");
        if (admitted.kind !== "accepted") return;
        expect(admitted.state.identityRecommendations[0]?.definitionHash).toBe("a".repeat(64));
        const result = recordIdentityAdmissionResult(
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

    it("rejects an admission result with a different Definition hash", () => {
        const admitted = recommendIdentity(
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
                childSessionId: "meeting-v1-participant-identity-1",
                definitionHash: "a".repeat(64)
            },
            1
        );
        if (admitted.kind !== "accepted") throw new Error("recommendation");

        const result = recordIdentityAdmissionResult(
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
                definitionHash: "b".repeat(64)
            },
            2
        );

        expect(result).toMatchObject({ kind: "rejected", errorCode: "PRECONDITION_FAILED" });
        expect(result.state).toBe(admitted.state);
    });

    it("reuses an active candidate across agendas without a new identity or effect", () => {
        const first = recommendIdentity(
            secondAgendaState(),
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
                childSessionId: "session-1",
                definitionHash: "a".repeat(64)
            },
            1
        );
        if (first.kind !== "accepted") throw new Error("recommendation");
        const active = recordIdentityAdmissionResult(
            first.state,
            "recommendation-1",
            {
                kind: "admitted",
                admissionId: "recommendation-1",
                meetingId: "meeting-v1",
                identityId: "identity-1",
                childSessionId: "session-1",
                ownershipId: "ownership-1",
                descriptorId: "descriptor-1",
                displayName: "Architect",
                definitionId: "domain_architect",
                definitionVersion: "1",
                definitionHash: "a".repeat(64)
            },
            2
        );
        if (active.kind !== "accepted") throw new Error("admission");
        const reused = recommendIdentity(
            active.state,
            {
                candidateId: "candidate-1",
                definitionId: "domain_architect",
                definitionVersion: "1",
                catalogId: "catalog-1",
                catalogVersion: "1",
                agendaId: "agenda-v2",
                decision: "admit",
                rationale: "跨议题复用",
                expectedContribution: "形成证据",
                evidenceGap: "无"
            },
            "manager-v1",
            { recommendationId: "recommendation-2", definitionHash: "a".repeat(64) },
            3
        );
        expect(reused.kind).toBe("accepted");
        if (reused.kind !== "accepted") return;
        expect(reused.state.identityRecommendations.at(-1)).toMatchObject({
            status: "active",
            identityId: "identity-1",
            childSessionId: "session-1",
            definitionHash: "a".repeat(64),
            resolvedAt: 3
        });
        expect(reused).not.toHaveProperty("effect");
        expect(reused.state.identities).toHaveLength(active.state.identities.length);
        expect(
            recommendIdentity(
                reused.state,
                {
                    candidateId: "candidate-1",
                    definitionId: "other_definition",
                    definitionVersion: "1",
                    catalogId: "catalog-1",
                    catalogVersion: "1",
                    agendaId: "agenda-v3",
                    decision: "admit",
                    rationale: "错误 provenance",
                    expectedContribution: "证据",
                    evidenceGap: "缺口"
                },
                "manager-v1",
                { recommendationId: "recommendation-3", definitionHash: "a".repeat(64) },
                4
            )
        ).toMatchObject({
            errorCode: "PRECONDITION_FAILED"
        });
    });

    it("rejects provisioning conflicts and provenance mismatches", () => {
        const state = secondAgendaState();
        const provisioning = recommendIdentity(
            state,
            {
                candidateId: "candidate-1",
                definitionId: "domain_architect",
                definitionVersion: "1",
                catalogId: "catalog-1",
                catalogVersion: "1",
                agendaId: "agenda-v1",
                decision: "admit",
                rationale: "需要",
                expectedContribution: "证据",
                evidenceGap: "缺口"
            },
            "manager-v1",
            {
                recommendationId: "recommendation-1",
                identityId: "identity-1",
                childSessionId: "session-1",
                definitionHash: "a".repeat(64)
            },
            1
        );
        if (provisioning.kind !== "accepted") throw new Error("provisioning");
        expect(
            recommendIdentity(
                provisioning.state,
                {
                    candidateId: "candidate-1",
                    definitionId: "domain_architect",
                    definitionVersion: "1",
                    catalogId: "catalog-1",
                    catalogVersion: "1",
                    agendaId: "agenda-v2",
                    decision: "admit",
                    rationale: "复用",
                    expectedContribution: "证据",
                    evidenceGap: "缺口"
                },
                "manager-v1",
                { recommendationId: "recommendation-2" },
                2
            )
        ).toMatchObject({ errorCode: "INVALID_STATE" });
    });
});
