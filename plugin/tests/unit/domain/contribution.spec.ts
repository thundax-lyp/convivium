import {
    applyContributionCommand,
    evaluateContributionProgress,
    transitionContributionLifecycle,
    transitionMeeting,
    failContributionDelivery,
    endMeeting,
    type MeetingState
} from "@/domain/index.js";
import {
    boundaryReviewState,
    captainContext,
    contributionMeeting,
    contributionNow,
    evidenceReviewState,
    evidenceVersion,
    managerContext,
    validContributionState
} from "../../fixtures/contribution.js";
import { describe, expect, it } from "vitest";

describe("contribution completion and termination", () => {
    function ready(): MeetingState {
        const state = contributionMeeting();
        state.agenda[0]!.status = "resolved";
        state.contributions = validContributionState() as MeetingState["contributions"];
        return state;
    }
    const end = {
        meetingId: "meeting-1",
        captainBinding: "captain-1",
        outcome: "completed" as const,
        reason: "Accepted",
        acceptedDecisionIds: [],
        deferredAgendaItemIds: [],
        waivers: [],
        now: contributionNow,
        factId: (index: number) => `fact-${index}`
    };
    it("rejects Captain completion while a required contribution is unfinished, including cancelled work", () => {
        const state = ready();
        const task = state.contributions!.tasks["contribution-1"]!;
        task.requiredForCompletion = true;
        expect(() => endMeeting(state, end)).toThrow();
        expect(evaluateContributionProgress(state, contributionNow).state).toBe(state);
        task.phase = "cancelled";
        expect(() => endMeeting(state, end)).toThrow();
        expect(state.status).toBe("running");
        expect(state.completionFacts).toEqual([]);
    });
    it("completes before either budget, atomically cancels unrelated research and rejects late writes", () => {
        const state = ready();
        state.limits.maxTotalMessages = 0;
        state.limits.maxDurationMs = 1;
        const original = structuredClone(state);
        const result = evaluateContributionProgress(state, contributionNow);
        expect(result.state).toMatchObject({
            status: "completed",
            termination: {
                code: "objective_satisfied",
                reason: "objective_satisfied",
                finalMessage: "objective_satisfied",
                endedAt: contributionNow
            },
            contributions: {
                tasks: {
                    "contribution-1": { phase: "cancelled", generation: 2, reason: "meeting_ended" }
                }
            }
        });
        expect(state).toEqual(original);
        expect(result.effect.events.map((v) => v.type)).toContain("contribution.controlled");
        expect(() =>
            applyContributionCommand(
                result.state,
                {
                    action: "retry",
                    contributionId: "contribution-1",
                    generation: 2,
                    reason: "late"
                },
                captainContext()
            )
        ).toThrow();
        expect(evaluateContributionProgress(result.state, contributionNow).effect.events).toEqual(
            []
        );
    });
    it.each(["message_limit", "time_limit"] as const)(
        "returns partial for %s when the objective is unfinished",
        (code) => {
            const state = ready();
            state.agenda[0]!.status = "discussing";
            if (code === "message_limit") state.limits.maxTotalMessages = 0;
            else state.limits.maxDurationMs = 1;
            expect(evaluateContributionProgress(state, contributionNow).state).toMatchObject({
                status: "partial",
                termination: { code, reason: code, finalMessage: code }
            });
        }
    );
    it("does not auto-complete a paused or legacy meeting", () => {
        const state = ready();
        state.status = "paused";
        expect(evaluateContributionProgress(state, contributionNow).state).toBe(state);
        state.status = "running";
        delete state.contributions;
        expect(evaluateContributionProgress(state, contributionNow).state).toBe(state);
    });
    it("retains published drafts and evidence when ending pending review", () => {
        const pending = boundaryReviewState() as MeetingState;
        pending.contributions!.tasks["contribution-1"]!.requiresEvidenceReview = true;
        pending.contributions!.tasks["contribution-1"]!.drafts["1"]!.citations = [
            { evidenceKey: "evidence-1:1", claim: "A bounded observation" }
        ];
        pending.contributions!.evidence["evidence-1:1"] = evidenceVersion(1) as never;
        const state = applyContributionCommand(
            pending,
            {
                action: "boundary_review",
                contributionId: "contribution-1",
                generation: 1,
                draftRevision: 1,
                decision: "approve",
                reason: "In scope",
                checkedThroughSeq: 0
            },
            managerContext()
        ).state;
        const task = state.contributions!.tasks["contribution-1"]!;
        expect(state.transcript).toHaveLength(1);
        expect(task.reviewStatus).toBe("pending");
        const before = structuredClone(state);
        const ended = endMeeting(state, { ...end, outcome: "partial" });
        expect(ended.state.contributions!.tasks[task.id]).toMatchObject({
            phase: "published",
            reviewStatus: "captain_action",
            generation: 2,
            reason: "meeting_ended",
            drafts: task.drafts
        });
        expect(ended.state.transcript).toEqual(before.transcript);
        expect(ended.state.contributions!.evidence).toEqual(before.contributions!.evidence);
    });
});

describe("contribution agenda advancement", () => {
    function twoAgendas(): MeetingState {
        const state = contributionMeeting();
        state.contributions = validContributionState() as MeetingState["contributions"];
        state.agenda[0]!.status = "resolved";
        state.agenda.push({ ...state.agenda[0]!, id: "agenda-2", status: "pending" });
        return state;
    }
    it("advances in array order, cancels only old optional drafts and notifies once", () => {
        const state = twoAgendas();
        state.agenda.push({ ...state.agenda[1]!, id: "agenda-0" });
        const before = structuredClone(state);
        const result = evaluateContributionProgress(state, contributionNow);
        expect(state).toEqual(before);
        expect(result.state.activeAgendaItemId).toBe("agenda-2");
        expect(result.state.agenda.map((v) => v.status)).toEqual([
            "resolved",
            "discussing",
            "pending"
        ]);
        expect(result.state.contributions!.tasks["contribution-1"]).toMatchObject({
            phase: "cancelled",
            generation: 2,
            reason: "agenda_advanced"
        });
        expect(result.effect.events.map((v) => v.type)).toEqual([
            "contribution.controlled",
            "contribution.agenda_advanced",
            "contribution.manager_notified"
        ]);
        expect(result.state.contributions!.managerNoticeSeq).toBe(1);
        expect(evaluateContributionProgress(result.state, contributionNow).effect.events).toEqual(
            []
        );
        expect(() =>
            applyContributionCommand(
                result.state,
                {
                    action: "retry",
                    contributionId: "contribution-1",
                    generation: 2,
                    reason: "Old agenda"
                },
                captainContext()
            )
        ).toThrow();
    });
    it("does not advance unfinished required work or reopen an exhausted agenda", () => {
        const state = twoAgendas();
        state.contributions!.tasks["contribution-1"]!.requiredForCompletion = true;
        expect(evaluateContributionProgress(state, contributionNow).state).toBe(state);
        state.contributions!.tasks["contribution-1"]!.phase = "cancelled";
        expect(evaluateContributionProgress(state, contributionNow).state).toBe(state);
        state.contributions!.tasks["contribution-1"]!.requiredForCompletion = false;
        state.agenda.pop();
        state.agenda[0]!.status = "discussing";
        expect(evaluateContributionProgress(state, contributionNow).state.activeAgendaItemId).toBe(
            "agenda-1"
        );
    });
    it("terminates on budget before advancing", () => {
        const state = twoAgendas();
        state.limits.maxTotalMessages = 0;
        const result = evaluateContributionProgress(state, contributionNow);
        expect(result.state.status).toBe("partial");
        expect(result.state.activeAgendaItemId).toBe("agenda-1");
        expect(result.effect.events.some((v) => v.type === "contribution.agenda_advanced")).toBe(
            false
        );
    });
    it("preserves published pending review and permits the fixed reviewer to finish across agendas", () => {
        const state = evidenceReviewState() as MeetingState;
        state.agenda[0]!.status = "resolved";
        state.agenda.push({ ...state.agenda[0]!, id: "agenda-2", status: "pending" });
        const advanced = evaluateContributionProgress(state, contributionNow).state;
        expect(advanced.activeAgendaItemId).toBe("agenda-2");
        expect(advanced.contributions!.tasks["contribution-1"]).toEqual(
            state.contributions!.tasks["contribution-1"]
        );
        const reviewed = applyContributionCommand(
            advanced,
            {
                action: "evidence_review",
                contributionId: "contribution-1",
                generation: 1,
                draftRevision: 1,
                reviews: [
                    {
                        evidenceKey: "evidence-1:1",
                        claim: "fixture",
                        verdict: "supports",
                        method: "Read exact material",
                        result: "Matches",
                        limitations: "Fixture only"
                    }
                ]
            },
            {
                ...managerContext(),
                actor: { kind: "participant", participantId: advanced.contributions!.reviewerId }
            }
        );
        expect(reviewed.state.contributions!.tasks["contribution-1"]!.reviewStatus).toBe(
            "complete"
        );
        expect(reviewed.state.transcript).toEqual(state.transcript);
    });
});

describe("contribution suspension and deadlines", () => {
    function running(): MeetingState {
        return {
            ...contributionMeeting(),
            contributions: validContributionState() as MeetingState["contributions"]
        };
    }
    it("freezes phase time, revokes the old generation and restores only remaining time", () => {
        const state = running();
        const paused = transitionMeeting(state, "paused", {
            now: contributionNow + 100,
            reason: "Pause",
            pause: { at: contributionNow + 100, by: { kind: "captain", actorId: "captain-1" } }
        });
        expect(paused.state.contributions!.tasks["contribution-1"]).toMatchObject({
            generation: 2,
            pausedRemainingMs: 599900
        });
        const resumed = transitionMeeting(paused.state, "running", { now: contributionNow + 1000 });
        expect(resumed.state.contributions!.tasks["contribution-1"]).toMatchObject({
            generation: 3,
            deadlineAt: contributionNow + 600900
        });
        expect(resumed.state.contributions!.tasks["contribution-1"]).not.toHaveProperty(
            "pausedRemainingMs"
        );
    });
    it("counts paused time in the total budget and completes before exhausted budget on resume", () => {
        const state = running();
        state.status = "paused";
        state.limits.maxDurationMs = 1;
        const partial = transitionMeeting(state, "running", { now: contributionNow });
        expect(partial.state.status).toBe("partial");
        expect(
            partial.effect.events.some(
                (v) => v.type === "contribution.controlled" && v.payload.action === "resume"
            )
        ).toBe(false);
        state.agenda[0]!.status = "resolved";
        expect(transitionMeeting(state, "running", { now: contributionNow }).state.status).toBe(
            "completed"
        );
    });
    it("expires at the exact phase deadline once and retains drafts", () => {
        const state = running();
        expect(
            transitionContributionLifecycle(state, "tick", contributionNow + 599999).effect.events
        ).toEqual([]);
        const expired = transitionContributionLifecycle(state, "tick", contributionNow + 600000);
        expect(expired.state.contributions!.tasks["contribution-1"]).toMatchObject({
            phase: "captain_action",
            generation: 2,
            drafts: {}
        });
        expect(expired.effect.events.map((v) => v.type)).toEqual([
            "contribution.expired",
            "contribution.manager_notified"
        ]);
        expect(
            transitionContributionLifecycle(expired.state, "tick", contributionNow + 600000).effect
                .events
        ).toEqual([]);
    });
    it("moves an idle expired Manager to Captain waiting without a fallback", () => {
        const state = running();
        state.contributions!.tasks = {};
        const waiting = transitionContributionLifecycle(state, "tick", contributionNow + 600000);
        expect(waiting.state).toMatchObject({
            status: "waiting",
            waitState: {
                reason: "captain_action",
                waitingSince: contributionNow + 600000,
                taskIds: [],
                participantIds: []
            }
        });
        expect(
            transitionContributionLifecycle(waiting.state, "tick", contributionNow + 600001).effect
                .events
        ).toEqual([]);
    });
    it("ignores stale failure callbacks and converts a current permanent failure to Captain action", () => {
        const state = running();
        expect(
            failContributionDelivery(state, {
                kind: "task",
                contributionId: "contribution-1",
                generation: 0,
                reason: "FAILED",
                now: contributionNow
            }).state
        ).toBe(state);
        const failed = failContributionDelivery(state, {
            kind: "task",
            contributionId: "contribution-1",
            generation: 1,
            reason: "FAILED",
            now: contributionNow
        });
        expect(failed.state.contributions!.tasks["contribution-1"]).toMatchObject({
            phase: "captain_action",
            generation: 2,
            reason: "FAILED"
        });
        expect(
            failContributionDelivery(failed.state, {
                kind: "task",
                contributionId: "contribution-1",
                generation: 1,
                reason: "FAILED",
                now: contributionNow
            }).state
        ).toBe(failed.state);
    });
});
