import { describe, expect, it } from "vitest";
import type { MeetingState } from "@/domain/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import { createMeetingIdentityApplicationV1 } from "@/runtime/application-service/meeting-identity-v1.js";
describe("meeting identity command", () => {
    it("rejects an untrusted caller before repository execution", async () => {
        let executed = false;
        const repository = {
            teamId: "team-1",
            meetingId: "meeting-v1",
            execute: async () => {
                executed = true;
                throw new Error("must not execute");
            }
        } as MeetingRepositoryPort<MeetingState>;
        const app = createMeetingIdentityApplicationV1({
            repository,
            definitions: [],
            ids: { nextId: () => "id" },
            clock: { now: () => 1 },
            readVerifiedSessionScope: async () => ({
                teamId: "team-1",
                managerId: "manager-1",
                managerSessionId: "manager-session",
                captainParentSessionId: "captain-session",
                captainParentAgent: {}
            })
        });
        const result = await app.recommendIdentity(
            {
                protocolVersion: 1,
                meetingId: "meeting-v1",
                expectedMeetingVersion: 1,
                requestId: "request-1",
                action: {
                    kind: "recommend_identity",
                    candidateId: "candidate-1",
                    definitionId: "domain_architect",
                    definitionVersion: "1",
                    catalogId: "catalog-1",
                    catalogVersion: "1",
                    agendaId: "agenda-v1",
                    decision: "reject",
                    rationale: "理由",
                    expectedContribution: "贡献",
                    evidenceGap: "缺口"
                }
            },
            { channel: "dsh_tool", principalId: "other", sessionBindingId: "manager-session" }
        );
        expect(result).toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(executed).toBe(false);
    });
});
