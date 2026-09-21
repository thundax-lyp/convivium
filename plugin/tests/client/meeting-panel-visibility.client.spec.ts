import { describe, expect, it } from "vitest";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.js";

describe("Meeting projection visibility", () => {
    it("keeps client rendering bounded to the projection fields", () => {
        const { view } = meetingProjectionFixture();
        expect(view.evidencePackages).toEqual([]);
        expect(view.evidenceReviews).toEqual([]);
        expect(view.archive).toBeUndefined();
        expect(Object.keys(view)).toEqual([
            "meetingId",
            "version",
            "objective",
            "lifecycle",
            "identities",
            "identityRecommendations",
            "agenda",
            "opportunityRequests",
            "rounds",
            "publications",
            "evidencePackages",
            "evidenceReviews",
            "reviewDeliveries",
            "messages",
            "questions",
            "issues",
            "outcomes",
            "managerPlans",
            "tasks",
            "privateMail",
            "controls"
        ]);
    });
});
