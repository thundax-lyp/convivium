import { describe, expect, it } from "vitest";
import { MeetingCommandV1Schema } from "@/protocol/meeting-command-v1.js";
import {
    IdentityRecommendationViewV1Schema,
    RecommendIdentityActionV1Schema,
    RoleErrorCodeV1Schema
} from "@/protocol/meeting-identity-v1.js";

const action = {
    kind: "recommend_identity" as const,
    candidateId: "candidate-1",
    definitionId: "domain_architect",
    definitionVersion: "1",
    catalogId: "catalog-1",
    catalogVersion: "1",
    agendaId: "agenda-1",
    decision: "admit" as const,
    rationale: "需要专门贡献",
    expectedContribution: "形成证据",
    evidenceGap: "缺少验证"
};

describe("meeting identity protocol", () => {
    it("decodes both target actions and ignores unknown fields", () => {
        expect(
            MeetingCommandV1Schema.parse({
                protocolVersion: 1,
                meetingId: "meeting-1",
                expectedMeetingVersion: 1,
                requestId: "request-1",
                action: { ...action, actorId: "forged", sessionId: "forged" }
            }).action
        ).toMatchObject(action);
        expect(
            MeetingCommandV1Schema.parse({
                protocolVersion: 1,
                meetingId: "meeting-1",
                expectedMeetingVersion: 1,
                requestId: "request-2",
                action: { kind: "record_identity_admission_result", recommendationId: "rec-1" }
            }).action.kind
        ).toBe("record_identity_admission_result");
    });

    it("rejects missing fields, nulls and invalid enums", () => {
        expect(
            RecommendIdentityActionV1Schema.safeParse({ ...action, agendaId: null }).success
        ).toBe(false);
        expect(
            RecommendIdentityActionV1Schema.safeParse({ ...action, decision: "maybe" }).success
        ).toBe(false);
        expect(RoleErrorCodeV1Schema.safeParse("not-a-role-error").success).toBe(false);
    });

    it("does not expose forged runtime ownership in the public recommendation view", () => {
        const result = IdentityRecommendationViewV1Schema.parse({
            id: "rec-1",
            candidateId: "candidate-1",
            definitionId: "domain_architect",
            definitionVersion: "1",
            agendaId: "agenda-1",
            decision: "admit",
            status: "provisioning",
            rationale: "需要专门贡献",
            expectedContribution: "形成证据",
            evidenceGap: "缺少验证",
            createdAt: 1,
            actorId: "forged",
            sessionId: "forged"
        });
        expect(result).not.toHaveProperty("actorId");
        expect(result).not.toHaveProperty("sessionId");
    });
});
