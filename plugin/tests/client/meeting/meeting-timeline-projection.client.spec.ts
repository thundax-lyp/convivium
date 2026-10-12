import { describe, expect, it } from "vitest";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting/shared/index.ts";
import { findAdjacentTimelineKey } from "@/client/meeting/regions/workspace/timeline/timeline.tsx";
import { MeetingViewSchema } from "@/protocol/meeting-view.ts";
import {
    type TimelineNode,
    buildTimelineNodes,
    filterTimelineNodes,
    resolveTimelineNodeContent
} from "@/client/meeting/regions/workspace/timeline/projection.ts";
import { groupTimelineMilestones } from "@/client/meeting/regions/workspace/timeline/projection.ts";
import { eventTimelineFixture } from "./meeting-timeline-fixtures.ts";
import { activeTimelineFixture, archiveTimelineFixture } from "./meeting-timeline-fixtures.ts";
import type { MeetingEventView } from "@/protocol/index.ts";

const envelope = (seq: number) => ({
    eventSeq: seq,
    meetingVersion: seq,
    occurredAt: seq * 10,
    actor: { kind: "system" as const },
    relatedObjects: []
});
const lifecycle = (
    seq: number,
    from: Extract<MeetingEventView, { kind: "meeting.lifecycle_changed" }>["data"]["from"],
    to: Extract<MeetingEventView, { kind: "meeting.lifecycle_changed" }>["data"]["to"]
): MeetingEventView => ({
    ...envelope(seq),
    kind: "meeting.lifecycle_changed",
    subject: { kind: "meeting", id: "meeting-v1" },
    data: { from, to }
});
const plan = (seq: number): MeetingEventView => ({
    ...envelope(seq),
    kind: "manager_plan.recorded",
    subject: { kind: "manager_plan", id: `plan-${seq}` },
    data: { planKind: "open_round", rationale: "plan" }
});
const completion = (seq: number): MeetingEventView => ({
    ...envelope(seq),
    kind: "completion_fact.recorded",
    subject: { kind: "completion_fact", id: `fact-${seq}` },
    data: { outputId: "output", statement: "done", rationale: "verified" }
});
const ended = (
    seq: number,
    outcome: Extract<MeetingEventView, { kind: "meeting.ended" }>["data"]["outcome"]
): MeetingEventView => ({
    ...envelope(seq),
    kind: "meeting.ended",
    subject: { kind: "termination", id: "termination" },
    data: { outcome, reason: "end" }
});
const groupsFor = (events: MeetingEventView[]) =>
    groupTimelineMilestones(buildTimelineNodes(eventTimelineFixture(events)));

describe("Timeline event milestone grouping", () => {
    it("keeps publication's subsequent formal message in its round", () => {
        const view = eventTimelineFixture();
        view.timelineEvents!.push({
            eventSeq: 7,
            meetingVersion: 6,
            kind: "formal_message.published",
            occurredAt: 23,
            actor: { kind: "identity", actorId: "contributor-v1" },
            subject: { kind: "formal_message", id: "message-1" },
            relatedObjects: [
                { kind: "publication", id: "publication-1" },
                { kind: "round", id: "round-1" }
            ],
            data: { messageKind: "evidence" }
        });
        const groups = groupTimelineMilestones(buildTimelineNodes(view));
        expect(
            groups.find((group) => group.key === "milestone:round:round-1")?.eventKeys
        ).toContain("event:7");
        expect(groups.find((group) => group.kind === "round")).toMatchObject({
            status: "completed",
            occurrence: 1,
            completedAt: 23
        });
    });
    it.each([
        "different commit",
        "missing publication",
        "wrong publication",
        "conflicting publication",
        "wrong round"
    ])("does not backfill a closed round for %s", (scenario) => {
        const view = eventTimelineFixture();
        const message: MeetingEventView = {
            ...envelope(7),
            meetingVersion: scenario === "different commit" ? 7 : 6,
            occurredAt: 23,
            kind: "formal_message.published",
            subject: { kind: "formal_message", id: "message" },
            relatedObjects: [
                { kind: "round", id: scenario === "wrong round" ? "round-missing" : "round-1" },
                ...(scenario === "missing publication"
                    ? []
                    : [
                          {
                              kind: "publication" as const,
                              id:
                                  scenario === "wrong publication"
                                      ? "other-publication"
                                      : "publication-1"
                          }
                      ]),
                ...(scenario === "conflicting publication"
                    ? [{ kind: "publication" as const, id: "other-publication" }]
                    : [])
            ],
            data: { messageKind: "evidence" }
        };
        view.timelineEvents!.push(message);
        const groups = groupTimelineMilestones(buildTimelineNodes(view));
        expect(groups.find((group) => group.kind === "round")?.eventKeys).not.toContain("event:7");
        expect(groups.find((group) => group.kind === "other")?.eventKeys).toEqual(["event:7"]);
    });

    it("reuses active convergence, closes without completion and numbers a later entry independently", () => {
        const groups = groupsFor([
            plan(1),
            lifecycle(2, "running", "converging"),
            lifecycle(3, "paused", "converging"),
            lifecycle(4, "converging", "running"),
            lifecycle(5, "running", "converging"),
            plan(6)
        ]);
        expect(groups.map((group) => [group.key, group.status, group.eventKeys])).toEqual([
            ["milestone:convergence:1", "completed", ["event:1", "event:2", "event:3", "event:4"]],
            ["milestone:convergence:2", "active", ["event:5", "event:6"]]
        ]);
        expect(groups[0]).toMatchObject({ startedAt: 10, completedAt: 40 });
    });

    it.each(["paused", "running"] as const)(
        "assigns the leaving boundary only to completion and closes both instances for %s",
        (to) => {
            const groups = groupsFor([
                lifecycle(1, "running", "converging"),
                completion(2),
                lifecycle(3, "converging", to)
            ]);
            expect(groups.map((group) => group.eventKeys)).toEqual([
                ["event:1"],
                ["event:2", "event:3"]
            ]);
            expect(groups.map((group) => group.status)).toEqual(
                to === "paused" ? ["blocked", "blocked"] : ["completed", "completed"]
            );
            expect(groups.map((group) => group.completedAt)).toEqual([30, 30]);
        }
    );

    it.each(["completed", "partial", "no_consensus", "cancelled", "failed"] as const)(
        "closes outstanding stages from %s outcome without duplicating the ending event",
        (outcome) => {
            const groups = groupsFor([
                plan(1),
                completion(2),
                lifecycle(3, "converging", "terminal"),
                { ...ended(4, outcome), meetingVersion: 3, occurredAt: 30 },
                {
                    ...envelope(5),
                    kind: "archive.started",
                    subject: { kind: "archive", id: "archive" },
                    data: { status: "complete" }
                },
                {
                    ...envelope(6),
                    kind: "archive.completed",
                    subject: { kind: "archive", id: "archive" },
                    data: { status: "complete" }
                }
            ]);
            expect(groups.slice(0, 2).map((group) => group.status)).toEqual(
                outcome === "completed" ? ["completed", "completed"] : ["aborted", "aborted"]
            );
            expect(groups[2]).toMatchObject({
                key: "milestone:closure:1",
                status: "completed",
                completedAt: 60,
                eventKeys: ["event:4", "event:5", "event:6"]
            });
            expect(groups[1]?.eventKeys).toEqual(["event:2", "event:3"]);
            expect(groups.slice(0, 2).map((group) => group.completedAt)).toEqual([30, 30]);
            expect(new Set(groups.flatMap((group) => group.eventKeys)).size).toBe(6);
        }
    );

    it("omits empty internal convergence and preserves shared occurrence across later stages", () => {
        const groups = groupsFor([
            completion(1),
            lifecycle(2, "converging", "paused"),
            plan(3),
            completion(4)
        ]);
        expect(groups.map((group) => [group.key, group.status])).toEqual([
            ["milestone:completion:1", "blocked"],
            ["milestone:convergence:2", "active"],
            ["milestone:completion:2", "active"]
        ]);
    });

    it("uses other for absent or ambiguous round relations and never guesses from current DTOs", () => {
        const view = eventTimelineFixture();
        view.timelineEvents = [
            view.timelineEvents![2]!,
            {
                ...envelope(7),
                kind: "archive.completed",
                subject: { kind: "archive", id: "archive" },
                data: { status: "complete" }
            }
        ];
        expect(groupsFor(view.timelineEvents).map((group) => [group.key, group.eventKeys])).toEqual(
            [["milestone:other:1", ["event:3", "event:7"]]]
        );
    });
    it("uses only events, sorts ties by sequence and preserves immutable content", () => {
        const view = eventTimelineFixture();
        view.timelineEvents!.reverse();
        const nodes = buildTimelineNodes(view);
        expect(nodes.map((node) => node.key)).toEqual([
            "event:1",
            "event:2",
            "event:3",
            "event:4",
            "event:5",
            "event:6"
        ]);
        expect(resolveTimelineNodeContent(view, nodes[2]!)?.title).toBe(
            "immutable evidence summary"
        );
        expect(buildTimelineNodes(eventTimelineFixture([]))).toEqual([]);
        expect(JSON.stringify(view.timelineEvents)).not.toContain("milestone");
    });

    it("groups each event exactly once using explicit round relations before filtering", () => {
        const nodes = buildTimelineNodes(eventTimelineFixture());
        const groups = groupTimelineMilestones(nodes);
        expect(groups.map((group) => [group.key, group.status, group.eventKeys])).toEqual([
            ["milestone:meeting-start:1", "completed", ["event:1"]],
            [
                "milestone:round:round-1",
                "completed",
                ["event:2", "event:3", "event:4", "event:5", "event:6"]
            ]
        ]);
        expect(groups[1]).toMatchObject({ occurrence: 1, startedAt: 20, completedAt: 23 });
        expect(groups.flatMap((group) => group.eventKeys)).toHaveLength(nodes.length);
        expect(JSON.stringify(groups)).not.toMatch(/meetingVersion|logVersion|payload/);
        const filtered = filterTimelineNodes(nodes, {
            ...INITIAL_TIMELINE_FILTERS,
            objectKinds: ["evidence_version"]
        });
        expect(filtered.map((node) => node.key)).toEqual(["event:3", "event:4"]);
        expect(groups[1]).toMatchObject({ status: "completed", completedAt: 23 });
    });
    it("moves chronologically and skips hidden roles", () => {
        const nodes = buildTimelineNodes(eventTimelineFixture());
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "event:3",
                direction: "up",
                collapsedLanes: []
            })
        ).toBe("event:2");
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "event:3",
                direction: "up",
                collapsedLanes: ["reviewer"]
            })
        ).toBe("event:2");
    });
});

describe("Timeline object details", () => {
    it("resolves exact content from the matching source and rejects missing objects", () => {
        const active = activeTimelineFixture();
        const nodes = [
            ["lifecycle", "meeting-v1"],
            ["round", "round-1"],
            ["opportunity_request", "request-1"],
            ["hand_raise", "round-1:contributor-v1"],
            ["evidence_version", "version-1"],
            ["evidence_review", "review-1"],
            ["review_delivery", "delivery-1"],
            ["publication", "publication-1"],
            ["formal_message", "message-1"],
            ["identity_recommendation", "recommendation-1"],
            ["decision_candidate", "candidate-1"],
            ["decision", "decision-1"],
            ["completion_fact", "completion-1"],
            ["risk_disposition", "risk-1"],
            ["manager_plan", "plan-1"],
            ["task", "task-1"],
            ["termination", "termination-1"]
        ].map(([objectKind, objectId]) => ({
            key: objectId!,
            objectKind: objectKind as TimelineNode["objectKind"],
            objectId: objectId!,
            phase: "created",
            time: 0,
            lane: "system" as const,
            relatedObjects: []
        }));
        const expected: Record<string, { title: string; detail?: string }> = {
            lifecycle: { title: "running", detail: "lifecycle reason" },
            round: { title: "round question", detail: "abort reason" },
            opportunity_request: { title: "request purpose" },
            hand_raise: { title: "raise purpose" },
            evidence_version: { title: "observation", detail: "interpretation" },
            evidence_review: { title: "review scope" },
            review_delivery: { title: "sent" },
            publication: { title: "publication-1", detail: "reason A; reason B" },
            formal_message: { title: "notice", detail: "message body" },
            identity_recommendation: { title: "recommendation rationale", detail: "active" },
            decision_candidate: { title: "adopt", detail: "candidate rationale" },
            decision: { title: "adopt", detail: "candidate rationale" },
            completion_fact: { title: "completion statement", detail: "completion rationale" },
            risk_disposition: { title: "accept", detail: "risk rationale" },
            manager_plan: { title: "open_round", detail: "plan rationale" },
            task: { title: "task title", detail: "task result" },
            termination: { title: "partial", detail: "termination reason" }
        };
        for (const node of nodes) {
            expect(resolveTimelineNodeContent(active, node)).toEqual(expected[node.objectKind]);
        }
        expect(
            resolveTimelineNodeContent(active, { ...nodes[0]!, objectId: "missing" })
        ).toBeUndefined();
        const duplicate = MeetingViewSchema.parse({
            ...active,
            publications: [active.publications[0], active.publications[0]]
        });
        expect(
            resolveTimelineNodeContent(
                duplicate,
                nodes.find((node) => node.objectKind === "publication")!
            )
        ).toBeUndefined();

        const archive = archiveTimelineFixture();
        const archiveNodes = [
            ["proposal_revision", "proposal-1"],
            ["position", "position-1"],
            ["disposition_fact", "fact-1"],
            ["archive", "archive-1"]
        ].map(([objectKind, objectId]) => ({
            key: objectId!,
            objectKind: objectKind as TimelineNode["objectKind"],
            objectId: objectId!,
            phase: "created",
            time: 0,
            lane: "system" as const,
            relatedObjects: []
        }));
        for (const [kind, content] of Object.entries({
            proposal_revision: { title: "proposal summary", detail: "proposal body" },
            position: { title: "support", detail: "position rationale" },
            disposition_fact: { title: "dispose_issue", detail: "fact rationale" },
            archive: { title: "complete", detail: "archive-1" }
        })) {
            expect(
                resolveTimelineNodeContent(
                    archive,
                    archiveNodes.find((node) => node.objectKind === kind)!
                )
            ).toEqual(content);
        }
    });
});

it("does not manufacture timeline events from DTO timestamps when the log is absent", () => {
    expect(buildTimelineNodes(activeTimelineFixture())).toEqual([]);
});

it("intersects identity, object, status and relation filters on committed events", () => {
    const decision: MeetingEventView = {
        ...envelope(7),
        kind: "decision.recorded",
        actor: { kind: "identity", actorId: "manager-v1" },
        subject: { kind: "decision", id: "decision-1" },
        relatedObjects: [{ kind: "evidence_version", id: "version-1" }],
        data: { status: "accepted" }
    };
    const nodes = buildTimelineNodes(
        eventTimelineFixture([
            decision,
            { ...decision, eventSeq: 8, actor: { kind: "identity", actorId: "contributor-v1" } },
            { ...decision, eventSeq: 9, relatedObjects: [] }
        ])
    );
    expect(
        filterTimelineNodes(nodes, {
            ...INITIAL_TIMELINE_FILTERS,
            identityIds: ["manager-v1"],
            objectKinds: ["decision"],
            statuses: ["accepted"],
            relatedObjects: [{ objectKind: "evidence_version", objectId: "version-1" }]
        }).map(({ key }) => key)
    ).toEqual(["event:7"]);
});
