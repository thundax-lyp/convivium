import { describe, expect, it } from "vitest";
import {
    completeMeetingBusinessLoopResult,
    validateScenarioResult
} from "../../scripts/smoke-profile/result.mjs";

const hotResult = {
    ok: true,
    scenario: "meeting-business-loop",
    meetingId: "meeting-1",
    assertions: [
        "target-create",
        "meeting-started",
        "two-evidence",
        "review-batch",
        "worker-authority",
        "published",
        "archived"
    ],
    observed: {
        status: "archived",
        evidenceVersionIds: ["version-1", "version-2"],
        startedNoticeCounts: {
            "contributor-a": 1,
            "contributor-b": 1,
            "contributor-c": 1,
            "contributor-d": 1,
            "contributor-e": 1,
            "contributor-f": 1
        },
        workerSessionIds: ["worker-1", "worker-2"]
    }
};

describe("Meeting business-loop smoke result", () => {
    it("accepts the result only after the archived Meeting survives a cold reopen", () => {
        const completed = completeMeetingBusinessLoopResult(hotResult, {
            ok: true,
            scenario: "meeting-business-loop-cold-reopen",
            meetingId: "meeting-1",
            status: "archived",
            archiveStatus: "complete"
        });

        expect(completed.assertions.at(-1)).toBe("cold-reopen");
        expect(completed.observed.coldReopen).toBe(true);
        expect(() => validateScenarioResult(completed, "meeting-business-loop")).not.toThrow();
    });

    it("rejects a cold reopen for a different Meeting", () => {
        expect(() =>
            completeMeetingBusinessLoopResult(hotResult, {
                ok: true,
                scenario: "meeting-business-loop-cold-reopen",
                meetingId: "meeting-2",
                status: "archived",
                archiveStatus: "complete"
            })
        ).toThrow("cold reopen");
    });
});
