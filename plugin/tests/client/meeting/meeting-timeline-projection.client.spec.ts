import { describe, expect, it } from "vitest";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting/shared/index.ts";
import { findAdjacentTimelineKey } from "@/client/meeting/regions/workspace/timeline/timeline.tsx";
import { MeetingViewSchema } from "@/protocol/meeting-view.ts";
import {
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
        const nodes = buildTimelineNodes(activeTimelineFixture());
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "hand_raise:round-1:contributor-v1:raised",
                direction: "up",
                collapsedLanes: []
            })
        ).toBe("round:round-1:aborted");
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "hand_raise:round-1:contributor-v1:raised",
                direction: "up",
                collapsedLanes: ["manager"]
            })
        ).toBe("round:round-1:aborted");
    });
});

describe("Legacy timeline source projection", () => {
    it("maps every active source with phases, lanes, status and stable chronological order", () => {
        const nodes = buildTimelineNodes(activeTimelineFixture());
        expect(nodes.map(({ key }) => key)).toEqual([
            "lifecycle:meeting-v1:changed",
            "round:round-1:opened",
            "round:round-1:aborted",
            "hand_raise:round-1:contributor-v1:raised",
            "opportunity_request:request-1:requested",
            "evidence_version:version-1:submitted",
            "evidence_review:review-1:created",
            "review_delivery:delivery-1:sent",
            "publication:publication-1:published",
            "formal_message:message-1:created",
            "identity_recommendation:recommendation-1:created",
            "decision_candidate:candidate-1:created",
            "decision:decision-1:created",
            "completion_fact:completion-1:created",
            "risk_disposition:risk-1:created",
            "manager_plan:plan-1:created",
            "task:task-1:started",
            "task:task-1:completed",
            "termination:termination-1:ended"
        ]);
        expect(nodes.map(({ lane }) => lane)).toEqual([
            "system",
            "system",
            "system",
            "contributor",
            "contributor",
            "contributor",
            "reviewer",
            "system",
            "system",
            "manager",
            "system",
            "captain",
            "system",
            "contributor",
            "manager",
            "manager",
            "system",
            "system",
            "system"
        ]);
        expect(nodes.find(({ objectKind }) => objectKind === "decision")?.status).toBe("accepted");
        expect(nodes.find(({ objectKind }) => objectKind === "review_delivery")?.status).toBe(
            "sent"
        );
        expect(nodes.find(({ objectKind }) => objectKind === "task")?.identityId).toBeUndefined();
    });

    it("uses only complete archive sources and maps every archive-only kind", () => {
        expect(buildTimelineNodes(archiveTimelineFixture("pending"))).toEqual([]);
        expect(buildTimelineNodes(archiveTimelineFixture("failed"))).toEqual([]);
        const nodes = buildTimelineNodes(archiveTimelineFixture());
        expect(nodes.map(({ objectKind }) => objectKind)).toEqual([
            "evidence_version",
            "evidence_review",
            "publication",
            "formal_message",
            "decision_candidate",
            "decision",
            "completion_fact",
            "risk_disposition",
            "termination",
            "proposal_revision",
            "position",
            "disposition_fact",
            "archive"
        ]);
        expect(new Set(nodes.map(({ key }) => key)).size).toBe(nodes.length);
        expect(
            nodes.some(({ objectKind }) =>
                ["lifecycle", "round", "task", "manager_plan"].includes(objectKind)
            )
        ).toBe(false);
    });

    it("extracts only typed relations and filters by intersection of filter groups", () => {
        const nodes = buildTimelineNodes(activeTimelineFixture());
        expect(
            nodes.find(({ objectKind }) => objectKind === "publication")?.relatedObjects
        ).toEqual([
            { objectKind: "round", objectId: "round-1" },
            { objectKind: "evidence_review", objectId: "review-1" },
            { objectKind: "evidence_version", objectId: "version-1" }
        ]);
        expect(
            nodes.find(({ objectKind }) => objectKind === "formal_message")?.relatedObjects
        ).toEqual([{ objectKind: "publication", objectId: "publication-1" }]);
        expect(
            nodes.find(({ objectKind }) => objectKind === "risk_disposition")?.relatedObjects
        ).toContainEqual({ objectKind: "issue", objectId: "issue-1" });
        expect(
            nodes.find(({ objectKind }) => objectKind === "evidence_review")?.relatedObjects
        ).toContainEqual({ objectKind: "publication", objectId: "publication-baseline" });
        expect(
            nodes.find(({ objectKind }) => objectKind === "decision")?.relatedObjects
        ).toContainEqual({ objectKind: "decision", objectId: "decision-old" });
        const archiveNodes = buildTimelineNodes(archiveTimelineFixture("complete"));
        expect(
            archiveNodes.find(({ objectKind }) => objectKind === "proposal_revision")
                ?.relatedObjects
        ).toContainEqual({ objectKind: "proposal_revision", objectId: "proposal-old" });
        expect(
            archiveNodes.find(({ objectKind }) => objectKind === "disposition_fact")?.relatedObjects
        ).toEqual([
            { objectKind: "evidence_version", objectId: "version-1" },
            { objectKind: "issue", objectId: "issue-1" }
        ]);
        expect(
            filterTimelineNodes(nodes, {
                ...INITIAL_TIMELINE_FILTERS,
                identityIds: ["contributor-v1"],
                objectKinds: ["completion_fact", "opportunity_request"],
                statuses: ["active"],
                relatedObjects: [{ objectKind: "decision", objectId: "decision-1" }]
            }).map(({ key }) => key)
        ).toEqual(["completion_fact:completion-1:created"]);
    });

    it("resolves exact content from the matching source and rejects missing objects", () => {
        const active = activeTimelineFixture();
        const nodes = buildTimelineNodes(active);
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
        const archiveNodes = buildTimelineNodes(archive);
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

    it("sorts equal timestamps by kind, object ID and phase", () => {
        const active = activeTimelineFixture();
        const tied = MeetingViewSchema.parse({
            ...active,
            rounds: [{ ...active.rounds[0], openedAt: 20, abortedAt: 20 }],
            opportunityRequests: [
                { ...active.opportunityRequests[0], id: "request-z", requestedAt: 20 },
                { ...active.opportunityRequests[0], id: "request-a", requestedAt: 20 }
            ]
        });
        expect(
            buildTimelineNodes(tied)
                .filter(({ time }) => time === 20)
                .map(({ key }) => key)
        ).toEqual([
            "round:round-1:opened",
            "round:round-1:aborted",
            "opportunity_request:request-a:requested",
            "opportunity_request:request-z:requested"
        ]);
    });
});
