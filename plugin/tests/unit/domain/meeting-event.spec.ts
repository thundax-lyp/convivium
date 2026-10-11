import { describe, expect, it } from "vitest";
import { MeetingEventViewSchema } from "@/protocol/index.ts";

const occurrences = [
    ["meeting.created", "meeting", {}],
    ["meeting.lifecycle_changed", "meeting", { from: "running", to: "paused", reason: "pause" }],
    ["agenda.activated", "agenda", { previousDisposition: "completed", reason: "next" }],
    ["agenda_candidate.disposed", "agenda_candidate", { disposition: "promoted", reason: "scope" }],
    ["manager_plan.recorded", "manager_plan", { planKind: "open_round", rationale: "gap" }],
    ["round.opened", "round", { deadlineAt: 10 }],
    [
        "round.participation_recorded",
        "round",
        { contributorId: "author", status: "declined", reason: "unavailable" }
    ],
    ["hand_raise.recorded", "round", { contributorId: "author", purpose: "evidence" }],
    [
        "hand_raise.disposed",
        "round",
        {
            contributorId: "author",
            disposition: "accepted",
            reason: "needed",
            contributionId: "contribution"
        }
    ],
    ["evidence.submitted", "evidence_version", { summary: "observed" }],
    ["contribution.closed", "contribution", { exit: "withdrawn", reason: "withdraw" }],
    [
        "contribution.failed",
        "contribution",
        {
            sourceEffectId: "effect",
            stage: "prepare",
            failureCode: "FAILED",
            failureSummary: "failed",
            attemptCount: 1,
            retryable: false
        }
    ],
    ["evidence_review.claimed", "evidence_version", { claimId: "claim", sourceEffectId: "effect" }],
    [
        "evidence_validation.failed",
        "evidence_version",
        { claimId: "claim", reason: "review_timeout" }
    ],
    ["evidence_review.submitted", "evidence_review", { claimId: "claim", scope: "source" }],
    [
        "review_delivery.recorded",
        "review_delivery",
        { status: "failed", failureReason: "dispatch" }
    ],
    ["round.published", "publication", {}],
    ["formal_message.published", "formal_message", { messageKind: "evidence" }],
    ["round.aborted", "round", { reason: "abort" }],
    [
        "identity.recommended",
        "identity_recommendation",
        { decision: "admit", status: "provisioning", rationale: "needed" }
    ],
    [
        "identity.admission_recorded",
        "identity_recommendation",
        { status: "failed", failureCode: "UNAVAILABLE" }
    ],
    ["question.disposed", "question", { status: "answered", rationale: "answer" }],
    ["issue.disposed", "issue", { status: "resolved", rationale: "resolved" }],
    [
        "risk.disposed",
        "risk_disposition",
        { action: "accept", scope: "output", rationale: "limited" }
    ],
    ["decision.recorded", "decision", { status: "accepted" }],
    [
        "decision.changed",
        "decision",
        { status: "superseded", rationale: "replace", replacementDecisionId: "replacement" }
    ],
    [
        "completion_fact.recorded",
        "completion_fact",
        { outputId: "output", statement: "done", rationale: "verified" }
    ],
    [
        "completion_fact.changed",
        "completion_fact",
        { status: "superseded", rationale: "replace", replacementFactId: "replacement" }
    ],
    ["meeting.ended", "termination", { outcome: "partial", reason: "done" }],
    ["archive.started", "archive", { status: "complete" }],
    ["archive.completed", "archive", { status: "complete" }]
] as const;

const event = (kind: string, subjectKind: string, data: unknown) => ({
    eventSeq: 1,
    meetingVersion: 1,
    kind,
    occurredAt: 10,
    actor: { kind: "captain", actorId: "captain" },
    subject: { kind: subjectKind, id: "subject" },
    relatedObjects: [],
    data
});

describe("Meeting occurrence event contracts", () => {
    it.each(occurrences)(
        "accepts %s with its exact subject and data and rejects structural corruption",
        (kind, subjectKind, data) => {
            const valid = event(kind, subjectKind, data);
            expect(MeetingEventViewSchema.safeParse(valid).success).toBe(true);
            expect(
                MeetingEventViewSchema.safeParse({
                    ...valid,
                    subject: {
                        kind: subjectKind === "meeting" ? "round" : "meeting",
                        id: "subject"
                    }
                }).success
            ).toBe(false);
            expect(
                MeetingEventViewSchema.safeParse({
                    ...valid,
                    data: { ...data, milestone: "presentation" }
                }).success
            ).toBe(false);
            expect(
                MeetingEventViewSchema.safeParse({
                    ...valid,
                    data: { ...data, privateMail: { body: "secret" } }
                }).success
            ).toBe(false);
            expect(
                MeetingEventViewSchema.safeParse({
                    ...valid,
                    actor: { kind: "identity", actorId: null }
                }).success
            ).toBe(false);
            expect(
                MeetingEventViewSchema.safeParse({ ...valid, relatedObjects: [{ id: "untyped" }] })
                    .success
            ).toBe(false);
        }
    );

    it("rejects unknown kinds, unsafe time and forbidden envelope fields", () => {
        const valid = event("meeting.created", "meeting", {});
        for (const invalid of [
            { ...valid, kind: "milestone.created" },
            { ...valid, occurredAt: Number.MAX_SAFE_INTEGER + 1 },
            { ...valid, occurredAt: -1 },
            { ...valid, occurredAt: 0.5 },
            { ...valid, eventSeq: 0 },
            { ...valid, actor: { kind: "system", actorId: "invented" } },
            { ...valid, subject: { kind: "meeting", id: "subject", title: "display" } },
            { ...valid, relatedObjects: [{ kind: "round", id: "round", lane: "manager" }] },
            { ...valid, data: { reason: { occurrence: 1 } } },
            { ...valid, logVersion: 1 }
        ]) {
            expect(MeetingEventViewSchema.safeParse(invalid).success).toBe(false);
        }
        expect(MeetingEventViewSchema.parse({ ...valid, actor: { kind: "system" } }).actor).toEqual(
            { kind: "system" }
        );
    });

    it("rejects incomplete or incompatible conditional data and unchanged lifecycle", () => {
        const cases = [
            ["meeting.lifecycle_changed", "meeting", { from: "running", to: "running" }],
            [
                "round.participation_recorded",
                "round",
                { contributorId: "author", status: "declined" }
            ],
            [
                "round.participation_recorded",
                "round",
                { contributorId: "author", status: "no_response", reason: "invented" }
            ],
            [
                "hand_raise.disposed",
                "round",
                { contributorId: "author", disposition: "accepted", reason: "needed" }
            ],
            [
                "hand_raise.disposed",
                "round",
                {
                    contributorId: "author",
                    disposition: "rejected",
                    reason: "no",
                    contributionId: "invented"
                }
            ],
            [
                "review_delivery.recorded",
                "review_delivery",
                { status: "sent", failureReason: "invented" }
            ],
            ["review_delivery.recorded", "review_delivery", { status: "failed" }],
            [
                "identity.recommended",
                "identity_recommendation",
                { decision: "reject", status: "active", rationale: "no" }
            ],
            [
                "identity.admission_recorded",
                "identity_recommendation",
                { status: "active", failureCode: "invented" }
            ],
            ["decision.changed", "decision", { status: "superseded", rationale: "replace" }],
            [
                "decision.changed",
                "decision",
                { status: "revoked", rationale: "revoke", replacementDecisionId: "invented" }
            ],
            [
                "completion_fact.changed",
                "completion_fact",
                { status: "superseded", rationale: "replace" }
            ],
            [
                "completion_fact.changed",
                "completion_fact",
                { status: "revoked", rationale: "revoke", replacementFactId: "invented" }
            ],
            ["evidence.submitted", "evidence_version", { summary: "" }],
            [
                "contribution.failed",
                "contribution",
                {
                    sourceEffectId: "effect",
                    stage: "prepare",
                    failureCode: "FAILED",
                    failureSummary: "failed",
                    attemptCount: 0,
                    retryable: false
                }
            ]
        ] as const;
        for (const [kind, subject, data] of cases) {
            expect(MeetingEventViewSchema.safeParse(event(kind, subject, data)).success).toBe(
                false
            );
        }
    });

    it("accepts all alternate conditional branches without inventing absent values", () => {
        const cases = [
            ["round.opened", "round", {}],
            [
                "round.participation_recorded",
                "round",
                { contributorId: "author", status: "no_response" }
            ],
            [
                "hand_raise.disposed",
                "round",
                { contributorId: "author", disposition: "deferred", reason: "later" }
            ],
            ["review_delivery.recorded", "review_delivery", { status: "sent" }],
            [
                "identity.recommended",
                "identity_recommendation",
                { decision: "reject", status: "rejected", rationale: "no" }
            ],
            ["identity.admission_recorded", "identity_recommendation", { status: "active" }],
            ["decision.changed", "decision", { status: "revoked", rationale: "revoke" }],
            [
                "completion_fact.changed",
                "completion_fact",
                { status: "revoked", rationale: "revoke" }
            ]
        ] as const;
        for (const [kind, subject, data] of cases) {
            expect(MeetingEventViewSchema.parse(event(kind, subject, data)).data).toEqual(data);
        }
    });
});
