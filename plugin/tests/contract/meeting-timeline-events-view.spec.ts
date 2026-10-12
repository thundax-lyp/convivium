import { expect, it } from "vitest";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state.ts";
import { projectMeetingView } from "@/projection/meeting-view.ts";
import { captainActorIdFor, type PersistedMeetingEvent } from "@/domain/index.ts";

const state = makeRunningMeetingStateV1();
const snapshot = { meetingId: state.id, version: state.version, state, createdAt: 0, updatedAt: 1 };
const events: PersistedMeetingEvent[] = [
    {
        eventSeq: 1,
        meetingVersion: 1,
        type: "meeting.created",
        createdAt: 10,
        payload: {
            logVersion: 1,
            actor: { kind: "captain", actorId: captainActorIdFor(state.id) },
            subject: { kind: "meeting", id: state.id },
            relatedObjects: [],
            data: {}
        }
    },
    {
        eventSeq: 2,
        meetingVersion: 2,
        type: "evidence.submitted",
        createdAt: 20,
        payload: {
            logVersion: 1,
            actor: { kind: "identity", actorId: "contributor-v1" },
            subject: { kind: "evidence_version", id: "historical-version" },
            relatedObjects: [{ kind: "round", id: "historical-round" }],
            data: { summary: "historical immutable summary" }
        }
    }
];

it("projects every complete event for captain even if its subject no longer appears in the snapshot", () => {
    const view = projectMeetingView(snapshot, { kind: "captain" }, undefined, events);
    expect(view.timelineEvents).toEqual([
        {
            eventSeq: 1,
            meetingVersion: 1,
            kind: "meeting.created",
            occurredAt: 10,
            actor: { kind: "captain", actorId: captainActorIdFor(state.id) },
            subject: { kind: "meeting", id: state.id },
            relatedObjects: [],
            data: {}
        },
        {
            eventSeq: 2,
            meetingVersion: 2,
            kind: "evidence.submitted",
            occurredAt: 20,
            actor: { kind: "identity", actorId: "contributor-v1" },
            subject: { kind: "evidence_version", id: "historical-version" },
            relatedObjects: [{ kind: "round", id: "historical-round" }],
            data: { summary: "historical immutable summary" }
        }
    ]);
    expect(JSON.stringify(view.timelineEvents)).not.toMatch(
        /logVersion|turnId|attemptId|privateMail|session|capability/
    );
    view.timelineEvents![1]!.subject.id = "reader mutation";
    expect(
        projectMeetingView(snapshot, { kind: "captain" }, undefined, events).timelineEvents![1]!
            .subject.id
    ).toBe("historical-version");
});

it("omits events for identity roles and preserves explicitly supplied event arrays", () => {
    expect(projectMeetingView(snapshot, { kind: "captain" }, undefined, []).timelineEvents).toEqual(
        []
    );
    for (const roles of [["manager"], ["contributor"], ["evidence_reviewer"]] as const) {
        expect(
            projectMeetingView(
                snapshot,
                { kind: "identity", identityId: "contributor-v1", roles },
                undefined,
                events
            )
        ).not.toHaveProperty("timelineEvents");
    }
});

it("fails closed rather than returning a partial view if an event data field is corrupt", () => {
    const corrupted = structuredClone(events);
    Reflect.set(corrupted[1]!.payload.data, "session", "private");
    expect(() => projectMeetingView(snapshot, { kind: "captain" }, undefined, corrupted)).toThrow();
});
