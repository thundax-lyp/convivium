import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { endMeeting } from "@/domain/transitions/meeting-end.js";
import {
    completeMeetingArchive,
    startMeetingArchive
} from "@/domain/transitions/meeting-archive.js";

describe("meeting archive", () => {
    it("materializes a value archive and gates archived on ownership closure", () => {
        const ended = endMeeting(makeRunningMeetingStateV1(), {
            terminationId: "termination-v1",
            outcome: "partial",
            reason: "未完成目标",
            decisionIds: [],
            completionFactIds: [],
            unresolvedQuestionIds: [],
            unresolvedIssueIds: [],
            actorId: "local",
            now: 10
        });
        if (ended.kind !== "accepted") return;
        const archiving = startMeetingArchive(ended.state, {
            archiveId: "archive-v1",
            actorId: "runtime",
            now: 11,
            questionIssueDispositionFacts: []
        });
        expect(archiving.kind).toBe("accepted");
        if (archiving.kind !== "accepted") return;
        expect(archiving.state.archive?.status).toBe("complete");
        expect(
            completeMeetingArchive(archiving.state, {
                actorId: "runtime",
                now: 12,
                allSessionOwnershipClosed: false
            })
        ).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
        const archived = completeMeetingArchive(archiving.state, {
            actorId: "runtime",
            now: 12,
            allSessionOwnershipClosed: true
        });
        expect(archived).toMatchObject({
            kind: "accepted",
            state: { lifecycle: { status: "archived" } }
        });
    });
});
