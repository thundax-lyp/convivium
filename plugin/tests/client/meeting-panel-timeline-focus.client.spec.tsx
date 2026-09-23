import { describe, expect, it } from "vitest";
import { en, zh } from "@/client/locales.js";
import { findAdjacentTimelineKey } from "@/client/meeting-panel-timeline.js";
import { buildTimelineNodes } from "@/client/meeting-timeline-projection.js";
import { activeTimelineFixture } from "./meeting-timeline-fixtures.js";

const detail = activeTimelineFixture();

describe("Timeline keyboard rules and locale completeness", () => {
    it("keeps both locales complete for the closed UI enum sets", () => {
        expect(Object.keys(zh)).toEqual(Object.keys(en));
        const groups: Record<string, readonly string[]> = {
            agenda: ["pending", "active", "blocked", "completed", "deferred", "closed"],
            contribution: [
                "preparing",
                "registered",
                "under_review",
                "awaiting_response",
                "withdrawn",
                "submission_missing",
                "timed_out",
                "supplement_rejected",
                "aborted",
                "closed"
            ],
            recommendation: ["provisioning", "rejected", "active", "failed"],
            decisionOutcome: ["adopt", "reject", "defer"],
            decisionStatus: ["accepted", "superseded", "revoked"],
            completionStatus: ["active", "superseded", "revoked"],
            questionStatus: ["open", "answered", "withdrawn", "deferred"],
            issueStatus: ["open", "resolved", "deferred", "out_of_scope"],
            issueClassification: [
                "blocking",
                "follow_up",
                "pending_discussion",
                "accepted_risk",
                "out_of_scope"
            ],
            riskAction: ["accept", "reject"],
            reviewDelivery: ["sent", "failed"],
            task: ["open", "claimed", "completed", "cancelled", "expired"],
            authorization: ["active", "revoked", "expired"],
            timelineKind: [
                "lifecycle",
                "round",
                "opportunity_request",
                "hand_raise",
                "evidence_version",
                "evidence_review",
                "review_delivery",
                "publication",
                "formal_message",
                "identity_recommendation",
                "proposal_revision",
                "position",
                "decision_candidate",
                "decision",
                "completion_fact",
                "risk_disposition",
                "disposition_fact",
                "manager_plan",
                "task",
                "termination",
                "archive"
            ],
            timelinePhase: [
                "changed",
                "opened",
                "aborted",
                "requested",
                "raised",
                "submitted",
                "created",
                "sent",
                "failed",
                "published",
                "started",
                "completed",
                "ended",
                "resolve_question",
                "dispose_issue"
            ]
        };
        for (const [group, values] of Object.entries(groups))
            for (const value of values) {
                const key = `enum.${group}.${value}` as keyof typeof zh;
                expect(zh[key]).toBeTruthy();
                expect(en[key]).toBeTruthy();
            }
    });
    it("moves within lane and into adjacent visible lane by nearest time", () => {
        const nodes = buildTimelineNodes(detail);
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "round:round-1:opened",
                direction: "right",
                collapsedLanes: []
            })
        ).toBe("round:round-1:aborted");
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "round:round-1:opened",
                direction: "left",
                collapsedLanes: []
            })
        ).toBe("lifecycle:meeting-v1:changed");
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
        expect(
            findAdjacentTimelineKey({
                nodes,
                currentKey: "decision_candidate:candidate-1:created",
                direction: "up",
                collapsedLanes: []
            })
        ).toBeUndefined();
    });
});
