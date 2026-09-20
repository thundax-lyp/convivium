import { describe, expect, it } from "vitest";
import { meetingProjectionFixture } from "./meeting-panel-v1-fixtures.js";
import { renderObservabilitySections } from "@/client/meeting-panel-sections.js";

describe("Meeting projection client view", () => {
    it("renders only values supplied by the MeetingView projection", () => {
        const { view } = meetingProjectionFixture();
        const rendered = renderObservabilitySections(view);
        expect(rendered.props.children).toBeDefined();
        expect(view.controls).toEqual(["pause_meeting", "end_meeting"]);
        expect(view).not.toHaveProperty("proposals");
        expect(view).not.toHaveProperty("risks");
        expect(view).not.toHaveProperty("contributions");
    });
});
