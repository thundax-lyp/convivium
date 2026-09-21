import { describe, expect, it, vi } from "vitest";
import { readMeetingRoleCatalogV1, type MeetingAgentCatalog } from "@/dsh/meeting-role-catalog.js";
const snapshot: MeetingAgentCatalog = {
    protocolVersion: 1,
    meetingId: "meeting-1",
    catalogId: "catalog-1",
    catalogVersion: "1",
    generatedAt: 1,
    candidates: [
        {
            candidateId: "candidate-1",
            definition: { id: "domain_architect", version: "1" },
            definitionHash: "a".repeat(64),
            displayName: "Architect",
            availability: "available",
            meetingRoles: ["contributor"],
            responsibilitySummary: "证据",
            capabilitySummary: [{ kind: "skill", label: "native" }],
            suitability: [{ scope: "agenda-1", rationale: "匹配" }]
        }
    ]
};
describe("meeting role catalog port", () => {
    it("passes a validated Manager request to the Host producer", async () => {
        const readSnapshot = vi.fn(async (request) => {
            expect(request).toEqual({
                protocolVersion: 1,
                meetingId: "meeting-1",
                captainSessionId: "captain-session",
                managerSessionId: "manager-session"
            });
            return { kind: "available" as const, snapshot };
        });
        expect(
            await readMeetingRoleCatalogV1(
                { readSnapshot },
                "meeting-1",
                "captain-session",
                "manager-session"
            )
        ).toEqual({ kind: "available", snapshot });
        expect(readSnapshot).toHaveBeenCalledTimes(1);
    });
    it("fails closed for duplicate or cross-meeting candidates", async () => {
        const bad = {
            ...snapshot,
            meetingId: "other",
            candidates: [snapshot.candidates[0], snapshot.candidates[0]]
        };
        const result = await readMeetingRoleCatalogV1(
            { readSnapshot: async () => ({ kind: "available", snapshot: bad }) },
            "meeting-1",
            "captain-session",
            "manager-session"
        );
        expect(result.kind).toBe("rejected");
    });
});
