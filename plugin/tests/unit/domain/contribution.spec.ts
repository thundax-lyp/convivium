import {
    applyContributionCommand,
    applyPublicSubmission,
    assertContributionEvidenceMessages,
    contributionWorkComplete,
    evaluateContributionProgress,
    transitionContributionLifecycle,
    transitionMeeting,
    failContributionDelivery,
    endMeeting,
    type MeetingState,
    isMeetingStateV2
} from "@/domain/index.js";
import { contributionMeeting, contributionNow } from "../../fixtures/contribution.js";
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

function validContributionState() {
    const state = contributionMeeting();
    const authorId = state.participants[0]!.id;
    const reviewerId = state.participants[1]!.id;
    const agendaItemId = state.agenda[0]!.id;
    return {
        schemaVersion: 1,
        reviewerId,
        managerNoticeSeq: 0,
        managerDeadlineAt: contributionNow + 600_000,
        tasks: {
            "contribution-1": {
                id: "contribution-1",
                participantId: authorId,
                agendaItemId,
                instruction: "Research the topic.",
                targetIds: [],
                requiredForCompletion: false,
                requiresEvidenceReview: false,
                generation: 1,
                phase: "preparing",
                basedOnSeq: 0,
                deadlineAt: contributionNow + 600_000,
                createdAt: contributionNow,
                updatedAt: contributionNow,
                currentDraftRevision: 0,
                returnCount: 0,
                drafts: {},
                boundaryReviews: [],
                evidenceReviews: [],
                reviewStatus: "not_required"
            }
        },
        evidence: {}
    };
}

function evidenceVersion(revision: number) {
    return {
        evidenceId: "evidence-1",
        revision,
        key: `evidence-1:${revision}`,
        submittedBy: contributionMeeting().participants[0]!.id,
        submittedAt: contributionNow,
        title: "Source",
        kind: "document",
        source: "fixture",
        sourceDate: "fixture",
        collectedAt: "fixture",
        locator: "fixture",
        observation: "fixture",
        methodAndConditions: "fixture",
        limitations: "fixture",
        dependencies: "fixture",
        material: { kind: "text", text: "fixture" }
    };
}

function boundaryReviewState() {
    const state = { ...contributionMeeting(), contributions: validContributionState() };
    const task = state.contributions!.tasks["contribution-1"]!;
    return {
        ...state,
        contributions: {
            ...state.contributions!,
            tasks: {
                ...state.contributions!.tasks,
                "contribution-1": {
                    ...task,
                    phase: "boundary_review" as const,
                    currentDraftRevision: 1,
                    drafts: {
                        "1": {
                            revision: 1,
                            basedOnSeq: 0,
                            submittedAt: contributionNow,
                            message: {
                                id: "message-contribution-1-1",
                                content: "A public question.",
                                kind: "question" as const,
                                mentions: [],
                                taskIds: [],
                                agendaRelation: "on_topic" as const,
                                createdAt: contributionNow
                            },
                            claims: {
                                questions: [
                                    {
                                        id: "question-contribution-1",
                                        text: "What remains?",
                                        blocking: false,
                                        createdAt: contributionNow
                                    }
                                ],
                                issues: [],
                                proposals: [],
                                positions: [],
                                agendaCandidates: [],
                                decisionCandidates: []
                            },
                            citations: []
                        }
                    }
                }
            }
        }
    };
}

function managerContext(now = contributionNow) {
    return {
        now,
        actor: { kind: "manager" as const },
        newContributionId: "unused",
        newEvidenceId: "unused",
        completionFactId: (kind: string, index: number) => `${kind}-${index}`
    };
}

function captainContext(now = contributionNow) {
    return { ...managerContext(now), actor: { kind: "captain" as const } };
}

function evidenceReviewState() {
    const base = boundaryReviewState();
    const task = base.contributions!.tasks["contribution-1"]!;
    const draft = task.drafts["1"]!;
    const publishedMessage = {
        ...draft.message,
        seq: base.messageSeq + 1,
        contributionId: task.id,
        contributionRevision: draft.revision,
        speaker: task.participantId,
        agendaItemId: task.agendaItemId
    };
    return {
        ...base,
        transcript: [...base.transcript, publishedMessage],
        messageSeq: publishedMessage.seq,
        contributions: {
            ...base.contributions!,
            evidence: { "evidence-1:1": evidenceVersion(1) },
            tasks: {
                ...base.contributions!.tasks,
                "contribution-1": {
                    ...task,
                    phase: "published" as const,
                    messageId: publishedMessage.id,
                    requiresEvidenceReview: true,
                    reviewStatus: "pending" as const,
                    drafts: {
                        "1": {
                            ...draft,
                            citations: [
                                {
                                    evidenceKey: "evidence-1:1",
                                    claim: "fixture",
                                    locator: "fixture",
                                    inference: "fixture"
                                }
                            ]
                        }
                    }
                }
            }
        }
    };
}

describe("contribution state structure", () => {
    describe("contribution preparation", () => {
        it("rejects another author's material update and an unreadable private citation", () => {
            const state = {
                ...contributionMeeting(),
                contributions: validContributionState()
            } as MeetingState;
            const authorId = state.participants[0]!.id;
            const otherId = state.participants[1]!.id;
            state.contributions!.evidence["private:1"] = {
                ...evidenceVersion(1),
                evidenceId: "private",
                key: "private:1",
                submittedBy: otherId
            } as never;
            const context = {
                ...managerContext(),
                actor: { kind: "participant" as const, participantId: authorId }
            };
            expect(() =>
                applyContributionCommand(
                    state,
                    {
                        action: "save_evidence",
                        contributionId: "contribution-1",
                        generation: 1,
                        evidenceId: "private",
                        expectedEvidenceRevision: 1,
                        material: { ...evidenceVersion(1) } as never
                    },
                    context
                )
            ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
            const draft =
                boundaryReviewState().contributions!.tasks["contribution-1"]!.drafts["1"]!;
            expect(() =>
                applyContributionCommand(
                    state,
                    {
                        action: "submit",
                        contributionId: "contribution-1",
                        generation: 1,
                        expectedDraftRevision: 0,
                        draft: {
                            ...draft,
                            citations: [{ evidenceKey: "private:1", claim: "private" }]
                        }
                    },
                    context
                )
            ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
            expect(state.contributions!.tasks["contribution-1"]!.currentDraftRevision).toBe(0);
            expect(state.contributions!.evidence["private:2"]).toBeUndefined();
        });

        it("rejects a private patch dependency even when the new material belongs to the author", () => {
            const state = {
                ...contributionMeeting(),
                contributions: validContributionState()
            } as MeetingState;
            const authorId = state.participants[0]!.id;
            state.contributions!.evidence["private:1"] = {
                ...evidenceVersion(1),
                evidenceId: "private",
                key: "private:1",
                submittedBy: state.participants[1]!.id
            } as never;
            const material = {
                ...evidenceVersion(1),
                kind: "code" as const,
                code: {
                    repository: "repo",
                    revision: "commit",
                    pathsAndSymbols: "src/a.ts",
                    patchEvidenceKeys: ["private:1"],
                    validation: "static_only" as const,
                    reproduction: "inspection",
                    expected: "a",
                    observed: "a",
                    notCovered: "execution"
                }
            };
            expect(() =>
                applyContributionCommand(
                    state,
                    {
                        action: "save_evidence",
                        contributionId: "contribution-1",
                        generation: 1,
                        expectedEvidenceRevision: 0,
                        material
                    },
                    {
                        ...managerContext(),
                        actor: { kind: "participant", participantId: authorId },
                        newEvidenceId: "own-code"
                    }
                )
            ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
            expect(state.contributions!.evidence["own-code:1"]).toBeUndefined();
        });

        it("rejects a reviewer cited as material author and a reviewer approving their own draft", () => {
            const state = {
                ...contributionMeeting(),
                contributions: validContributionState()
            } as MeetingState;
            const reviewerId = state.contributions!.reviewerId;
            state.contributions!.tasks["contribution-1"]!.requiresEvidenceReview = true;
            state.contributions!.evidence["reviewer:1"] = {
                ...evidenceVersion(1),
                evidenceId: "reviewer",
                key: "reviewer:1",
                submittedBy: reviewerId
            } as never;
            const draft =
                boundaryReviewState().contributions!.tasks["contribution-1"]!.drafts["1"]!;
            expect(() =>
                applyContributionCommand(
                    state,
                    {
                        action: "submit",
                        contributionId: "contribution-1",
                        generation: 1,
                        expectedDraftRevision: 0,
                        draft: {
                            ...draft,
                            citations: [{ evidenceKey: "reviewer:1", claim: "self" }]
                        }
                    },
                    {
                        ...managerContext(),
                        actor: { kind: "participant", participantId: state.participants[0]!.id }
                    }
                )
            ).toThrow();
            const pending = evidenceReviewState() as MeetingState;
            pending.contributions!.tasks["contribution-1"]!.participantId = reviewerId;
            pending.contributions!.evidence["evidence-1:1"]!.submittedBy =
                state.participants[0]!.id;
            expect(() =>
                applyContributionCommand(
                    pending,
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
                                method: "read",
                                result: "yes",
                                limitations: "none"
                            }
                        ]
                    },
                    {
                        ...managerContext(),
                        actor: { kind: "participant", participantId: reviewerId }
                    }
                )
            ).toThrow(expect.objectContaining({ code: "UNAUTHORIZED_CALLER" }));
        });

        it("allows a participant to cite a material already public through another task", () => {
            const state = evidenceReviewState() as MeetingState;
            state.contributions!.tasks["contribution-1"]!.reviewStatus = "complete";
            const authorId = state.participants[1]!.id;
            state.contributions!.tasks["contribution-2"] = {
                ...validContributionState().tasks["contribution-1"],
                id: "contribution-2",
                participantId: authorId,
                basedOnSeq: state.messageSeq
            } as never;
            const draft =
                boundaryReviewState().contributions!.tasks["contribution-1"]!.drafts["1"]!;
            const result = applyContributionCommand(
                state,
                {
                    action: "submit",
                    contributionId: "contribution-2",
                    generation: 1,
                    expectedDraftRevision: 0,
                    draft: {
                        ...draft,
                        basedOnSeq: state.messageSeq,
                        citations: [{ evidenceKey: "evidence-1:1", claim: "fixture" }]
                    }
                },
                { ...managerContext(), actor: { kind: "participant", participantId: authorId } }
            );
            expect(result.state.contributions!.tasks["contribution-2"]!.phase).toBe(
                "boundary_review"
            );
        });

        it("rejects a draft outside its task and current Transcript bounds", () => {
            const state = {
                ...contributionMeeting(),
                contributions: validContributionState()
            } as MeetingState;
            const draft =
                boundaryReviewState().contributions!.tasks["contribution-1"]!.drafts["1"]!;
            const context = {
                ...managerContext(),
                actor: { kind: "participant" as const, participantId: state.participants[0]!.id }
            };
            expect(() =>
                applyContributionCommand(
                    state,
                    {
                        action: "submit",
                        contributionId: "contribution-1",
                        generation: 1,
                        expectedDraftRevision: 0,
                        draft: { ...draft, basedOnSeq: state.messageSeq + 1 }
                    },
                    context
                )
            ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        });

        it("rejects self-review and research/review overlap at assignment", () => {
            const state = {
                ...contributionMeeting(),
                contributions: { ...validContributionState(), tasks: {} }
            } as MeetingState;
            const reviewerId = state.contributions!.reviewerId;
            const otherId = state.participants[0]!.id;
            const command = {
                action: "assign" as const,
                participantId: reviewerId,
                agendaItemId: state.agenda[0]!.id,
                instruction: "Research",
                targetIds: [],
                requiredForCompletion: false,
                requiresEvidenceReview: true
            };
            expect(() => applyContributionCommand(state, command, managerContext())).toThrow(
                expect.objectContaining({ code: "INVALID_STATE_TRANSITION" })
            );
            const pending = evidenceReviewState() as MeetingState;
            expect(() =>
                applyContributionCommand(
                    pending,
                    { ...command, requiresEvidenceReview: false },
                    { ...managerContext(), newContributionId: "contribution-2" }
                )
            ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
            pending.contributions!.tasks["contribution-1"]!.reviewStatus = "captain_action";
            expect(() =>
                applyContributionCommand(
                    pending,
                    { ...command, requiresEvidenceReview: false },
                    { ...managerContext(), newContributionId: "contribution-2" }
                )
            ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
            const researching = {
                ...state,
                contributions: {
                    ...state.contributions!,
                    tasks: {
                        "contribution-1": {
                            ...validContributionState().tasks["contribution-1"],
                            participantId: reviewerId
                        }
                    }
                }
            } as MeetingState;
            expect(() =>
                applyContributionCommand(
                    researching,
                    { ...command, participantId: otherId },
                    { ...managerContext(), newContributionId: "contribution-2" }
                )
            ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        });
        it("allows two participants to prepare distinct contributions", () => {
            const state = {
                ...contributionMeeting(),
                contributions: { ...validContributionState(), tasks: {}, evidence: {} }
            };
            const context = {
                now: contributionNow,
                actor: { kind: "manager" as const },
                newContributionId: "contribution-1",
                newEvidenceId: "evidence-1",
                completionFactId: (kind: string, index: number) => `${kind}-${index}`
            };
            const first = applyContributionCommand(
                state,
                {
                    action: "assign",
                    participantId: state.participants[0]!.id,
                    agendaItemId: state.agenda[0]!.id,
                    instruction: "Research.",
                    targetIds: [],
                    requiredForCompletion: false,
                    requiresEvidenceReview: false
                },
                context
            );
            const second = applyContributionCommand(
                first.state,
                {
                    action: "assign",
                    participantId: state.participants[1]!.id,
                    agendaItemId: state.agenda[0]!.id,
                    instruction: "Review.",
                    targetIds: [],
                    requiredForCompletion: false,
                    requiresEvidenceReview: false
                },
                { ...context, newContributionId: "contribution-2" }
            );
            expect(Object.keys(second.state.contributions!.tasks)).toEqual([
                "contribution-1",
                "contribution-2"
            ]);
        });

        it("rejects a second active assignment for the same participant without mutation", () => {
            const state = {
                ...contributionMeeting(),
                contributions: { ...validContributionState() }
            };
            const before = structuredClone(state);
            const context = {
                now: contributionNow,
                actor: { kind: "manager" as const },
                newContributionId: "contribution-2",
                newEvidenceId: "evidence-1",
                completionFactId: (kind: string, index: number) => `${kind}-${index}`
            };
            expect(() =>
                applyContributionCommand(
                    state,
                    {
                        action: "assign",
                        participantId: state.participants[0]!.id,
                        agendaItemId: state.agenda[0]!.id,
                        instruction: "Duplicate.",
                        targetIds: [],
                        requiredForCompletion: false,
                        requiresEvidenceReview: false
                    },
                    context
                )
            ).toThrow("Participant already has an active contribution.");
            expect(state).toEqual(before);
        });

        it("keeps evidence versions and submitted drafts private", () => {
            const state = { ...contributionMeeting(), contributions: validContributionState() };
            const actor = {
                kind: "participant" as const,
                participantId: state.participants[0]!.id
            };
            const context = {
                now: contributionNow,
                actor,
                newContributionId: "unused",
                newEvidenceId: "evidence-1",
                completionFactId: (kind: string, index: number) => `${kind}-${index}`
            };
            const saved = applyContributionCommand(
                state,
                {
                    action: "save_evidence",
                    contributionId: "contribution-1",
                    generation: 1,
                    expectedEvidenceRevision: 0,
                    material: {
                        ...evidenceVersion(1),
                        evidenceId: undefined as never,
                        revision: undefined as never,
                        key: undefined as never,
                        submittedBy: undefined as never,
                        submittedAt: undefined as never
                    }
                },
                context
            );
            const submitted = applyContributionCommand(
                saved.state,
                {
                    action: "submit",
                    contributionId: "contribution-1",
                    generation: 1,
                    expectedDraftRevision: 0,
                    draft: {
                        revision: 1,
                        basedOnSeq: 0,
                        submittedAt: contributionNow,
                        message: {
                            id: "message-private",
                            content: "draft",
                            kind: "statement",
                            mentions: [],
                            taskIds: [],
                            agendaRelation: "on_topic",
                            createdAt: contributionNow
                        },
                        claims: {
                            questions: [],
                            issues: [],
                            proposals: [],
                            positions: [],
                            agendaCandidates: [],
                            decisionCandidates: []
                        },
                        citations: []
                    }
                },
                context
            );
            expect(Object.keys(saved.state.contributions!.evidence)).toEqual(["evidence-1:1"]);
            expect(submitted.state.contributions!.tasks["contribution-1"]!.phase).toBe(
                "boundary_review"
            );
            expect(submitted.state.transcript).toEqual(state.transcript);
        });
    });

    describe("contribution publication", () => {
        it("returns twice then requires Captain action without publishing the draft", () => {
            let state = boundaryReviewState();
            for (const expectedPhase of ["returned", "returned", "captain_action"] as const) {
                const result = applyContributionCommand(
                    state,
                    {
                        action: "boundary_review",
                        contributionId: "contribution-1",
                        generation: state.contributions!.tasks["contribution-1"]!.generation,
                        draftRevision: 1,
                        decision: "return",
                        reason: "Needs more detail.",
                        checkedThroughSeq: state.messageSeq
                    },
                    managerContext()
                );
                expect(result.state.contributions!.tasks["contribution-1"]!.phase).toBe(
                    expectedPhase
                );
                expect(result.state.transcript).toEqual(state.transcript);
                state = {
                    ...result.state,
                    contributions: {
                        ...result.state.contributions!,
                        tasks: {
                            ...result.state.contributions!.tasks,
                            "contribution-1": {
                                ...result.state.contributions!.tasks["contribution-1"]!,
                                phase: "boundary_review",
                                currentDraftRevision: 1
                            }
                        }
                    }
                };
            }
        });

        it("rejects an approval for a returned generation without mutation", () => {
            const state = boundaryReviewState();
            const returned = applyContributionCommand(
                state,
                {
                    action: "boundary_review",
                    contributionId: "contribution-1",
                    generation: 1,
                    draftRevision: 1,
                    decision: "return",
                    reason: "Needs more detail.",
                    checkedThroughSeq: state.messageSeq
                },
                managerContext()
            ).state;
            const before = structuredClone(returned);
            expect(() =>
                applyContributionCommand(
                    returned,
                    {
                        action: "boundary_review",
                        contributionId: "contribution-1",
                        generation: 1,
                        draftRevision: 1,
                        decision: "approve",
                        reason: "Approved.",
                        checkedThroughSeq: returned.messageSeq
                    },
                    managerContext()
                )
            ).toThrow("Contribution review is stale.");
            expect(returned).toEqual(before);
        });

        it("publishes the exact approved draft and its claims atomically", () => {
            const base = boundaryReviewState();
            const draft = base.contributions!.tasks["contribution-1"]!.drafts["1"]!;
            const state = {
                ...base,
                contributions: {
                    ...base.contributions!,
                    tasks: {
                        ...base.contributions!.tasks,
                        "contribution-1": {
                            ...base.contributions!.tasks["contribution-1"]!,
                            requiresEvidenceReview: true,
                            drafts: {
                                "1": {
                                    ...draft,
                                    citations: [
                                        {
                                            evidenceKey: "evidence-1:1",
                                            claim: "fixture",
                                            locator: "fixture",
                                            inference: "fixture"
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            };
            const result = applyContributionCommand(
                state,
                {
                    action: "boundary_review",
                    contributionId: "contribution-1",
                    generation: 1,
                    draftRevision: 1,
                    decision: "approve",
                    reason: "Approved.",
                    checkedThroughSeq: state.messageSeq
                },
                managerContext()
            );
            const task = result.state.contributions!.tasks["contribution-1"]!;
            expect(task.phase).toBe("published");
            expect(task.reviewStatus).toBe("pending");
            expect(task.messageId).toBe("message-contribution-1-1");
            expect(result.state.version).toBe(state.version + 1);
            expect(result.state.transcript).toHaveLength(state.transcript.length + 1);
            expect(result.state.openQuestions.map(({ id }) => id)).toContain(
                "question-contribution-1"
            );
            expect(result.state.contributions!.managerNoticeSeq).toBe(1);
            expect(result.state.contributions!.managerDeadlineAt).toBe(contributionNow + 600_000);
            expect(result.effect.events).toContainEqual({
                type: "contribution.manager_notified",
                payload: {
                    noticeSeq: 1,
                    contextThroughSeq: state.messageSeq + 1,
                    actor: "manager",
                    at: contributionNow
                }
            });
        });

        it("does not publish the body when any approved claim is invalid", () => {
            const base = boundaryReviewState();
            const draft = base.contributions!.tasks["contribution-1"]!.drafts["1"]!;
            const state = {
                ...base,
                contributions: {
                    ...base.contributions!,
                    tasks: {
                        ...base.contributions!.tasks,
                        "contribution-1": {
                            ...base.contributions!.tasks["contribution-1"]!,
                            drafts: {
                                "1": {
                                    ...draft,
                                    message: {
                                        ...draft.message,
                                        kind: "summary",
                                        minutesDraft: {
                                            status: "draft",
                                            coverage: { fromSeq: 1, throughSeq: 1 },
                                            referencedMessageIds: ["message-1"]
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };
            const before = structuredClone(state);
            expect(() =>
                applyContributionCommand(
                    state,
                    {
                        action: "boundary_review",
                        contributionId: "contribution-1",
                        generation: 1,
                        draftRevision: 1,
                        decision: "approve",
                        reason: "Approved.",
                        checkedThroughSeq: state.messageSeq
                    },
                    managerContext()
                )
            ).toThrow("Invalid minutes draft.");
            expect(state).toEqual(before);
        });
    });

    describe("contribution evidence support", () => {
        it.each(["supports", "partially_supports", "does_not_support", "unverifiable"] as const)(
            "preserves the %s verdict from the independent reviewer",
            (verdict) => {
                const state = evidenceReviewState();
                const result = applyContributionCommand(
                    state,
                    {
                        action: "evidence_review",
                        contributionId: "contribution-1",
                        generation: 1,
                        draftRevision: 1,
                        reviews: [
                            {
                                evidenceKey: "evidence-1:1",
                                claim: "fixture",
                                verdict,
                                method: "fixture",
                                result: "fixture",
                                limitations: "fixture"
                            }
                        ]
                    },
                    {
                        ...managerContext(),
                        actor: {
                            kind: "participant",
                            participantId: state.contributions!.reviewerId
                        }
                    }
                );
                expect(result.state.contributions!.tasks["contribution-1"]!.reviewStatus).toBe(
                    "complete"
                );
                expect(
                    result.state.contributions!.tasks["contribution-1"]!.evidenceReviews[0]!.verdict
                ).toBe(verdict);
                expect(result.state.transcript).toEqual(state.transcript);
                expect(result.effect.events.map(({ type }) => type)).toEqual([
                    "contribution.evidence_reviewed",
                    "contribution.manager_notified"
                ]);
            }
        );

        it("rejects a material author reviewing their own evidence without mutation", () => {
            const state = evidenceReviewState();
            const before = structuredClone(state);
            expect(() =>
                applyContributionCommand(
                    state,
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
                                method: "fixture",
                                result: "fixture",
                                limitations: "fixture"
                            }
                        ]
                    },
                    {
                        ...managerContext(),
                        actor: {
                            kind: "participant",
                            participantId: state.participants[0]!.id
                        }
                    }
                )
            ).toThrow("Only the independent reviewer can review evidence.");
            expect(state).toEqual(before);
        });

        it("rejects a reviewer-owned patch dependency in a previously published draft", () => {
            const state = evidenceReviewState() as MeetingState;
            const reviewerId = state.contributions!.reviewerId;
            state.contributions!.evidence["reviewer-patch:1"] = {
                ...evidenceVersion(1),
                evidenceId: "reviewer-patch",
                key: "reviewer-patch:1",
                submittedBy: reviewerId
            } as never;
            state.contributions!.evidence["evidence-1:1"]!.kind = "code";
            state.contributions!.evidence["evidence-1:1"]!.code = {
                repository: "repo",
                revision: "commit",
                pathsAndSymbols: "src/a.ts",
                patchEvidenceKeys: ["reviewer-patch:1"],
                validation: "static_only",
                reproduction: "inspection",
                expected: "yes",
                observed: "yes",
                notCovered: "execution"
            };
            expect(isMeetingStateV2(state)).toBe(true);
            expect(() =>
                applyContributionCommand(
                    state,
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
                                method: "read",
                                result: "yes",
                                limitations: "none"
                            }
                        ]
                    },
                    {
                        ...managerContext(),
                        actor: { kind: "participant", participantId: reviewerId }
                    }
                )
            ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        });

        it("requires supports for every cited claim before a completion message can be used", () => {
            const state = evidenceReviewState();
            const task = state.contributions!.tasks["contribution-1"]!;
            const draft = task.drafts["1"]!;
            const before = structuredClone(state);
            expect(() => assertContributionEvidenceMessages(state, [draft.message.id])).toThrow(
                "require supported evidence messages"
            );
            expect(state).toEqual(before);
            const completionFact = {
                id: "completion-output",
                kind: "output_evidence" as const,
                subjectId: "output",
                assertedBy: task.participantId,
                result: "supported" as const,
                evidenceMessageIds: [draft.message.id],
                taskIds: [],
                status: "active" as const,
                createdAt: contributionNow
            };
            expect(contributionWorkComplete({ ...state, completionFacts: [completionFact] })).toBe(
                false
            );

            const reviewed = applyContributionCommand(
                state,
                {
                    action: "evidence_review",
                    contributionId: task.id,
                    generation: task.generation,
                    draftRevision: draft.revision,
                    reviews: [
                        {
                            evidenceKey: "evidence-1:1",
                            claim: "fixture",
                            verdict: "supports",
                            method: "fixture",
                            result: "fixture",
                            limitations: "fixture"
                        }
                    ]
                },
                {
                    ...managerContext(),
                    actor: { kind: "participant", participantId: state.contributions!.reviewerId }
                }
            ).state;
            assertContributionEvidenceMessages(reviewed, [draft.message.id]);
            expect(
                contributionWorkComplete({ ...reviewed, completionFacts: [completionFact] })
            ).toBe(true);
        });

        it("does not treat a supports verdict for one claim as support for another claim", () => {
            const state = evidenceReviewState();
            const task = state.contributions!.tasks["contribution-1"]!;
            const draft = task.drafts["1"]!;
            const withSecondClaim = {
                ...state,
                contributions: {
                    ...state.contributions!,
                    tasks: {
                        ...state.contributions!.tasks,
                        [task.id]: {
                            ...task,
                            drafts: {
                                ...task.drafts,
                                [String(draft.revision)]: {
                                    ...draft,
                                    citations: [
                                        ...draft.citations,
                                        {
                                            evidenceKey: "evidence-1:1",
                                            claim: "different claim",
                                            locator: "fixture",
                                            inference: "fixture"
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            };
            const before = structuredClone(withSecondClaim);
            expect(() =>
                applyContributionCommand(
                    withSecondClaim,
                    {
                        action: "evidence_review",
                        contributionId: task.id,
                        generation: task.generation,
                        draftRevision: draft.revision,
                        reviews: [
                            {
                                evidenceKey: "evidence-1:1",
                                claim: "fixture",
                                verdict: "supports",
                                method: "fixture",
                                result: "fixture",
                                limitations: "fixture"
                            }
                        ]
                    },
                    {
                        ...managerContext(),
                        actor: {
                            kind: "participant",
                            participantId: withSecondClaim.contributions!.reviewerId
                        }
                    }
                )
            ).toThrow("exactly cover contribution citations");
            expect(withSecondClaim).toEqual(before);
        });

        it("requires every required contribution to be published and reviewed", () => {
            const state = evidenceReviewState();
            const task = state.contributions!.tasks["contribution-1"]!;
            expect(contributionWorkComplete(state)).toBe(true);
            expect(
                contributionWorkComplete({
                    ...state,
                    contributions: {
                        ...state.contributions!,
                        tasks: {
                            ...state.contributions!.tasks,
                            [task.id]: {
                                ...task,
                                requiredForCompletion: true,
                                reviewStatus: "pending"
                            }
                        }
                    }
                })
            ).toBe(false);
            expect(
                contributionWorkComplete({
                    ...state,
                    contributions: {
                        ...state.contributions!,
                        tasks: {
                            ...state.contributions!.tasks,
                            [task.id]: {
                                ...task,
                                requiredForCompletion: true,
                                phase: "cancelled"
                            }
                        }
                    }
                })
            ).toBe(false);
        });
    });

    describe("contribution task control", () => {
        it("does not retry a private review task authored by the fixed reviewer", () => {
            const state = boundaryReviewState() as MeetingState;
            const task = state.contributions!.tasks["contribution-1"]!;
            task.phase = "cancelled";
            task.requiresEvidenceReview = true;
            task.participantId = state.contributions!.reviewerId;
            expect(() =>
                applyContributionCommand(
                    state,
                    {
                        action: "retry",
                        contributionId: task.id,
                        generation: 1,
                        reason: "Resume"
                    },
                    captainContext()
                )
            ).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
        });
        it("retries a cancelled private contribution with a new generation", () => {
            const state = boundaryReviewState();
            const task = state.contributions!.tasks["contribution-1"]!;
            const cancelled = {
                ...state,
                contributions: {
                    ...state.contributions!,
                    tasks: {
                        ...state.contributions!.tasks,
                        [task.id]: { ...task, phase: "cancelled" as const, returnCount: 2 }
                    }
                }
            };
            const result = applyContributionCommand(
                cancelled,
                { action: "retry", contributionId: task.id, generation: 1, reason: "Resume." },
                captainContext()
            );
            const next = result.state.contributions!.tasks[task.id]!;
            expect(next).toMatchObject({ phase: "preparing", generation: 2, returnCount: 0 });
            expect(next.drafts).toEqual(task.drafts);
            expect(result.effect.events.map(({ type }) => type)).toEqual([
                "contribution.controlled",
                "contribution.manager_notified"
            ]);
        });

        it("retries only the review of an already published contribution", () => {
            const state = evidenceReviewState();
            const task = state.contributions!.tasks["contribution-1"]!;
            const blockedReview = {
                ...state,
                contributions: {
                    ...state.contributions!,
                    tasks: {
                        ...state.contributions!.tasks,
                        [task.id]: { ...task, reviewStatus: "captain_action" as const }
                    }
                }
            };
            const result = applyContributionCommand(
                blockedReview,
                {
                    action: "retry",
                    contributionId: task.id,
                    generation: 1,
                    reason: "Review again."
                },
                captainContext()
            );
            expect(result.state.transcript).toEqual(blockedReview.transcript);
            expect(result.state.contributions!.tasks[task.id]).toMatchObject({
                phase: "published",
                reviewStatus: "pending",
                generation: 2
            });
        });

        it("cancels only private work and notify_manager wakes a waiting meeting once", () => {
            const state = boundaryReviewState();
            const task = state.contributions!.tasks["contribution-1"]!;
            const cancelled = applyContributionCommand(
                state,
                { action: "cancel", contributionId: task.id, generation: 1, reason: "Stop." },
                captainContext()
            );
            expect(cancelled.state.contributions!.tasks[task.id]).toMatchObject({
                phase: "cancelled",
                generation: 2,
                reason: "Stop."
            });
            expect(cancelled.state.contributions!.tasks[task.id]!.drafts).toEqual(task.drafts);
            const notified = applyContributionCommand(
                { ...state, status: "waiting" },
                { action: "notify_manager", reason: "Need attention." },
                captainContext()
            );
            expect(notified.state.status).toBe("running");
            expect(notified.state.contributions!.managerNoticeSeq).toBe(1);
            expect(notified.effect.events).toHaveLength(1);
        });
    });

    it("applies public claims without a current Turn", () => {
        const state = contributionMeeting();
        delete state.currentTurn;
        const participantId = state.participants[0]!.id;
        const result = applyPublicSubmission(state, participantId, {
            agendaItemId: state.agenda[0]!.id,
            now: contributionNow,
            message: {
                id: "message-contribution-1-1",
                content: "A public question.",
                kind: "question",
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic",
                createdAt: contributionNow
            },
            claims: {
                questions: [
                    {
                        id: "question-contribution-1",
                        text: "What remains?",
                        blocking: false,
                        createdAt: contributionNow
                    }
                ],
                issues: [],
                proposals: [],
                positions: [],
                agendaCandidates: [],
                decisionCandidates: []
            },
            authorizedTaskIds: [],
            completionFactId: (kind, index) => `completion-${kind}-${index}`
        });
        expect(result.state.openQuestions).toHaveLength(1);
        expect(result.effect.events.map(({ type }) => type)).toEqual(["question.added"]);
    });

    it("keeps a legacy meeting readable and accepts one complete contribution state", () => {
        const legacy = contributionMeeting();
        expect(isMeetingStateV2(legacy)).toBe(true);
        expect(
            isMeetingStateV2({
                ...legacy,
                contributions: validContributionState()
            } as unknown as MeetingState)
        ).toBe(true);
    });

    it("rejects a contribution whose task references an unknown participant", () => {
        const state = validContributionState();
        state.tasks["contribution-1"]!.participantId = "participant-missing";

        expect(
            isMeetingStateV2({
                ...contributionMeeting(),
                contributions: state
            } as unknown as MeetingState)
        ).toBe(false);
    });

    it("rejects non-contiguous material revisions and mixed message origins", () => {
        const contribution = validContributionState();
        contribution.evidence = { "evidence-1:2": evidenceVersion(2) };
        const mixedOrigin = {
            ...contributionMeeting(),
            transcript: [
                {
                    id: "message-1",
                    seq: 1,
                    turnSeq: 1,
                    turnId: "turn-1",
                    stepId: "step-1",
                    attemptId: "attempt-1",
                    contributionId: "contribution-1",
                    contributionRevision: 1,
                    speaker: contributionMeeting().participants[0]!.id,
                    agendaItemId: contributionMeeting().agenda[0]!.id,
                    agendaRelation: "on_topic",
                    content: "fixture",
                    kind: "statement",
                    mentions: [],
                    taskIds: [],
                    createdAt: contributionNow
                }
            ],
            contributions: contribution
        };

        expect(isMeetingStateV2(mixedOrigin as unknown as MeetingState)).toBe(false);
    });

    it("accepts 128 material versions and rejects the 129th", () => {
        const contribution = validContributionState();
        contribution.evidence = Object.fromEntries(
            Array.from({ length: 128 }, (_, index) => {
                const revision = index + 1;
                return [`evidence-1:${revision}`, evidenceVersion(revision)];
            })
        );
        expect(
            isMeetingStateV2({
                ...contributionMeeting(),
                contributions: contribution
            } as unknown as MeetingState)
        ).toBe(true);

        contribution.evidence = {
            ...contribution.evidence,
            "evidence-1:129": evidenceVersion(129)
        };
        expect(
            isMeetingStateV2({
                ...contributionMeeting(),
                contributions: contribution
            } as unknown as MeetingState)
        ).toBe(false);
    });
});
