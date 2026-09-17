import { describe, expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state-v1.js";
import { createMeetingV1 } from "@/domain/transitions/meeting-create-v1.js";
import { endMeetingV1 } from "@/domain/transitions/meeting-end-v1.js";
import {
    completeMeetingArchiveV1,
    startMeetingArchiveV1
} from "@/domain/transitions/meeting-archive-v1.js";

describe("meeting lifecycle", () => {
    it("creates an isolated target aggregate", () => {
        const state = makeRunningMeetingStateV1();
        const created = createMeetingV1(state);
        expect(created.kind).toBe("accepted");
        if (created.kind !== "accepted") return;
        expect(created.state).toEqual(state);
        expect(created.state).not.toBe(state);
    });
    it("ends a running meeting with a partial termination and archive effect", () => {
        const state = makeRunningMeetingStateV1();
        const ended = endMeetingV1(state, {
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
        expect(ended.kind).toBe("accepted");
        if (ended.kind !== "accepted") return;
        expect(ended.state.lifecycle.status).toBe("terminal");
        expect(ended.effectRequests).toEqual([
            { kind: "materialize_archive", terminationId: "termination-v1" }
        ]);
        expect(state.lifecycle.status).toBe("running");
    });
    it("requires completion facts before a completed termination", () => {
        const state = makeRunningMeetingStateV1();
        expect(
            endMeetingV1(state, {
                terminationId: "termination-v1",
                outcome: "completed",
                reason: "完成",
                decisionIds: [],
                completionFactIds: [],
                unresolvedQuestionIds: [],
                unresolvedIssueIds: [],
                actorId: "local",
                now: 10
            })
        ).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
    });
    it("materializes a value archive and gates archived on ownership closure", () => {
        const ended = endMeetingV1(makeRunningMeetingStateV1(), {
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
        const archiving = startMeetingArchiveV1(ended.state, {
            archiveId: "archive-v1",
            actorId: "runtime",
            now: 11,
            questionIssueDispositionFacts: []
        });
        expect(archiving.kind).toBe("accepted");
        if (archiving.kind !== "accepted") return;
        expect(archiving.state.archive?.status).toBe("complete");
        expect(
            completeMeetingArchiveV1(archiving.state, {
                actorId: "runtime",
                now: 12,
                allSessionOwnershipClosed: false
            })
        ).toMatchObject({ kind: "rejected", error: { code: "PRECONDITION_FAILED" } });
        const archived = completeMeetingArchiveV1(archiving.state, {
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
