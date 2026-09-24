import { describe, expect, it } from "vitest";
import { INITIAL_TIMELINE_FILTERS } from "@/client/meeting-workspace-state.js";
import { findAdjacentTimelineKey } from "@/client/meeting-panel-timeline.js";
import { MeetingViewSchema } from "@/protocol/meeting-view.js";
import {
    buildTimelineNodes,
    filterTimelineNodes,
    resolveTimelineNodeContent
} from "@/client/meeting-timeline-projection.js";
import { activeTimelineFixture, archiveTimelineFixture } from "./meeting-timeline-fixtures.js";

describe("Timeline projection", () => {
    it("moves between adjacent visible lanes by time", () => {
        const nodes = buildTimelineNodes(activeTimelineFixture());
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "hand_raise:round-1:contributor-v1:raised",
                direction: "up",
                collapsedLanes: []
            })
        ).toBe("formal_message:message-1:created");
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "hand_raise:round-1:contributor-v1:raised",
                direction: "up",
                collapsedLanes: ["manager"]
            })
        ).toBe("decision_candidate:candidate-1:created");
    });

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
        for (const node of nodes)
            expect(resolveTimelineNodeContent(active, node)).toEqual(expected[node.objectKind]);
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
