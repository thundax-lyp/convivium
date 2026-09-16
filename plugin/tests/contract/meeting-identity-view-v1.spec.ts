import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state-v1.js";
import { projectMeetingIdentityViewV1 } from "@/projection/meeting-view-v1.js";
describe("identity filtered view and archive provenance", () => {
    it("hides Manager catalog from Participant and does not expose Session fields", () => {
        const state = makeRunningMeetingStateV1();
        const snapshot = {
            teamId: "team-1",
            meetingId: state.id,
            version: state.version,
            state,
            createdAt: 0,
            updatedAt: 0
        };
        const catalog = {
            protocolVersion: 1 as const,
            meetingId: state.id,
            catalogId: "catalog-1",
            catalogVersion: "1",
            generatedAt: 1,
            candidates: []
        };
        expect(
            projectMeetingIdentityViewV1(snapshot, { kind: "participant" }, catalog)
        ).not.toHaveProperty("managerCatalog");
        expect(
            projectMeetingIdentityViewV1(snapshot, { kind: "manager" }, catalog).managerCatalog
        ).toEqual(catalog);
    });
});
