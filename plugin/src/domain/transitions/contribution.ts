import type { ContributionActor, ContributionTask } from "@/domain/contribution.js";
import { contributionWorkComplete } from "@/domain/contribution.js";
import { isObjectiveSatisfied } from "@/domain/completion.js";
import { blockingPositions, currentProposals } from "@/domain/proposal-state.js";
import { transitionMeeting } from "./meeting.js";
import { executionTerminalStatuses } from "./termination.js";
import type { MeetingState, TransitionResult } from "@/domain/model.js";

export { applyContributionCommand } from "./contribution-command.js";

export interface ContributionTransitionContext {
    now: number;
    actor: ContributionActor;
    newContributionId: string;
    newEvidenceId: string;
    completionFactId: (kind: string, index: number) => string;
}

export function transitionContributionLifecycle(
    state: MeetingState,
    action: "pause" | "resume" | "end" | "recover" | "tick",
    now: number
): TransitionResult<MeetingState> {
    if (state.contributions === undefined) return { state, effect: { events: [] } };
    if (action === "recover") {
        if (!["running", "waiting"].includes(state.status))
            return { state, effect: { events: [] } };
        const checked = transitionContributionLifecycle(state, "tick", now);
        if (executionTerminalStatuses.includes(checked.state.status)) return checked;
        const contributions = {
            ...checked.state.contributions!,
            tasks: { ...checked.state.contributions!.tasks }
        };
        const events = [...checked.effect.events];
        for (const task of Object.values(contributions.tasks)) {
            if (!activeContribution(task)) continue;
            const next = { ...task, generation: task.generation + 1, updatedAt: now };
            contributions.tasks[task.id] = next;
            events.push({
                type: "contribution.controlled",
                payload: {
                    contributionId: task.id,
                    generation: next.generation,
                    actor: "runtime",
                    at: now,
                    action: "resume",
                    reason: "runtime_recovery"
                }
            });
        }
        if (
            contributions.managerDeadlineAt > now &&
            !events.some((event) => event.type === "contribution.manager_notified")
        ) {
            contributions.managerNoticeSeq += 1;
            events.push({
                type: "contribution.manager_notified",
                payload: {
                    noticeSeq: contributions.managerNoticeSeq,
                    contextThroughSeq: checked.state.messageSeq,
                    actor: "runtime",
                    at: now
                }
            });
        }
        return events.length === 0
            ? checked
            : {
                  state: {
                      ...checked.state,
                      contributions,
                      version: state.version + 1,
                      updatedAt: now,
                      eventSeq: state.eventSeq + events.length
                  },
                  effect: { events }
              };
    }
    if (action === "tick" || action === "resume") {
        if (action === "tick" && !["running", "waiting"].includes(state.status))
            return { state, effect: { events: [] } };
        const progress = evaluateContributionProgress(state, now);
        if (executionTerminalStatuses.includes(progress.state.status)) return progress;
        if (action === "tick") {
            let next = progress.state;
            const events = [...progress.effect.events];
            for (const task of Object.values(next.contributions!.tasks)) {
                if (!activeContribution(task) || task.deadlineAt > now) continue;
                const stage =
                    task.phase === "published"
                        ? "evidence"
                        : task.phase === "boundary_review"
                          ? "boundary"
                          : "prepare";
                const tasks = {
                    ...next.contributions!.tasks,
                    [task.id]: {
                        ...task,
                        generation: task.generation + 1,
                        updatedAt: now,
                        reason: "deadline_expired",
                        ...(task.phase === "published"
                            ? { reviewStatus: "captain_action" as const }
                            : { phase: "captain_action" as const })
                    }
                };
                next = { ...next, contributions: { ...next.contributions!, tasks } };
                events.push({
                    type: "contribution.expired",
                    payload: {
                        contributionId: task.id,
                        generation: task.generation + 1,
                        actor: "runtime",
                        at: now,
                        stage
                    }
                });
            }
            if (events.some((event) => event.type === "contribution.expired")) {
                const notice = notifyContributionManager(next, now);
                next = notice.state;
                events.push(...notice.effect.events);
            } else if (
                !Object.values(next.contributions!.tasks).some(activeContribution) &&
                next.contributions!.managerDeadlineAt <= now &&
                !(next.status === "waiting" && next.waitState?.reason === "captain_action")
            ) {
                const waiting = contributionWaiting(next, now);
                next = waiting.state;
                events.push(...waiting.effect.events);
            }
            return events.length === 0
                ? { state, effect: { events: [] } }
                : {
                      state: {
                          ...next,
                          version: state.version + 1,
                          updatedAt: now,
                          eventSeq: state.eventSeq + events.length
                      },
                      effect: { events }
                  };
        }
        state = progress.state;
        const resumed = resumeContributionStages(state, now);
        return {
            state: resumed.state,
            effect: { events: [...progress.effect.events, ...resumed.effect.events] }
        };
    }
    if (action === "pause") {
        const tasks = { ...state.contributions.tasks };
        const events: TransitionResult<MeetingState>["effect"]["events"] = [];
        for (const task of Object.values(tasks)) {
            if (!activeContribution(task)) continue;
            tasks[task.id] = {
                ...task,
                generation: task.generation + 1,
                pausedRemainingMs: Math.max(0, task.deadlineAt - now),
                updatedAt: now
            };
            events.push({
                type: "contribution.controlled",
                payload: {
                    contributionId: task.id,
                    generation: task.generation + 1,
                    actor: "runtime",
                    at: now,
                    action: "pause",
                    reason: "meeting_paused"
                }
            });
        }
        return {
            state: {
                ...state,
                contributions: {
                    ...state.contributions,
                    tasks,
                    managerPausedRemainingMs: Math.max(
                        0,
                        state.contributions.managerDeadlineAt - now
                    )
                }
            },
            effect: { events }
        };
    }
    const tasks = { ...state.contributions.tasks };
    const events: TransitionResult<MeetingState>["effect"]["events"] = [];
    for (const task of Object.values(tasks)) {
        if (
            task.phase === "cancelled" ||
            (task.phase === "published" &&
                !["pending", "captain_action"].includes(task.reviewStatus))
        )
            continue;
        const next: ContributionTask = {
            ...task,
            generation: task.generation + 1,
            updatedAt: now,
            reason: "meeting_ended",
            ...(task.phase === "published"
                ? { reviewStatus: "captain_action" as const }
                : { phase: "cancelled" as const })
        };
        delete next.pausedRemainingMs;
        tasks[task.id] = next;
        events.push({
            type: "contribution.controlled",
            payload: {
                contributionId: task.id,
                generation: next.generation,
                actor: "runtime",
                at: now,
                action: "end",
                reason: "meeting_ended"
            }
        });
    }
    return {
        state: { ...state, contributions: { ...state.contributions, tasks } },
        effect: { events }
    };
}

function activeContribution(task: ContributionTask): boolean {
    return (
        ["preparing", "returned", "boundary_review"].includes(task.phase) ||
        (task.phase === "published" && task.reviewStatus === "pending")
    );
}

function notifyContributionManager(
    state: MeetingState,
    now: number
): TransitionResult<MeetingState> {
    const noticeSeq = state.contributions!.managerNoticeSeq + 1;
    return {
        state: {
            ...state,
            contributions: {
                ...state.contributions!,
                managerNoticeSeq: noticeSeq,
                managerDeadlineAt: now + 600_000
            }
        },
        effect: {
            events: [
                {
                    type: "contribution.manager_notified",
                    payload: {
                        noticeSeq,
                        contextThroughSeq: state.messageSeq,
                        actor: "runtime",
                        at: now
                    }
                }
            ]
        }
    };
}

function contributionWaiting(state: MeetingState, now: number): TransitionResult<MeetingState> {
    if (state.status === "waiting" && state.waitState?.reason === "captain_action")
        return { state, effect: { events: [] } };
    if (state.status === "waiting") {
        return {
            state: {
                ...state,
                version: state.version + 1,
                updatedAt: now,
                waitState: {
                    reason: "captain_action",
                    waitingSince: now,
                    taskIds: [],
                    participantIds: [],
                    ...(state.activeAgendaItemId === undefined
                        ? {}
                        : { resumeAgendaItemId: state.activeAgendaItemId })
                }
            },
            effect: {
                events: [
                    {
                        type: "meeting.waiting",
                        payload: {
                            meetingId: state.id,
                            from: "waiting",
                            to: "waiting",
                            meetingVersion: state.version + 1,
                            reason: "captain_action"
                        }
                    }
                ]
            }
        };
    }
    return transitionMeeting(state, "waiting", {
        now,
        wait: {
            reason: "captain_action",
            waitingSince: now,
            taskIds: [],
            participantIds: [],
            ...(state.activeAgendaItemId === undefined
                ? {}
                : { resumeAgendaItemId: state.activeAgendaItemId })
        }
    });
}

function resumeContributionStages(
    state: MeetingState,
    now: number
): TransitionResult<MeetingState> {
    const contributions = { ...state.contributions!, tasks: { ...state.contributions!.tasks } };
    const events: TransitionResult<MeetingState>["effect"]["events"] = [];
    for (const task of Object.values(contributions.tasks)) {
        if (!activeContribution(task)) continue;
        const next = {
            ...task,
            generation: task.generation + 1,
            deadlineAt: now + (task.pausedRemainingMs ?? Math.max(0, task.deadlineAt - now)),
            updatedAt: now
        };
        delete next.pausedRemainingMs;
        contributions.tasks[task.id] = next;
        events.push({
            type: "contribution.controlled",
            payload: {
                contributionId: task.id,
                generation: next.generation,
                actor: "runtime",
                at: now,
                action: "resume",
                reason: "meeting_resumed"
            }
        });
    }
    contributions.managerDeadlineAt =
        now +
        (contributions.managerPausedRemainingMs ??
            Math.max(0, contributions.managerDeadlineAt - now));
    delete contributions.managerPausedRemainingMs;
    const notice = notifyContributionManager({ ...state, contributions }, now);
    notice.state.contributions!.managerDeadlineAt = contributions.managerDeadlineAt;
    return { state: notice.state, effect: { events: [...events, ...notice.effect.events] } };
}

export function failContributionDelivery(
    state: MeetingState,
    input: (
        | { kind: "task"; contributionId: string; generation: number }
        | { kind: "manager"; noticeSeq: number }
    ) & { reason: string; now: number }
): TransitionResult<MeetingState> {
    if (state.contributions === undefined || !["running", "waiting"].includes(state.status))
        return { state, effect: { events: [] } };
    if (input.kind === "manager")
        return input.noticeSeq === state.contributions.managerNoticeSeq
            ? contributionWaiting(state, input.now)
            : { state, effect: { events: [] } };
    const task = state.contributions.tasks[input.contributionId];
    if (task === undefined || task.generation !== input.generation || !activeContribution(task))
        return { state, effect: { events: [] } };
    const next = {
        ...task,
        generation: task.generation + 1,
        updatedAt: input.now,
        reason: input.reason,
        ...(task.phase === "published"
            ? { reviewStatus: "captain_action" as const }
            : { phase: "captain_action" as const })
    };
    const notice = notifyContributionManager(
        {
            ...state,
            contributions: {
                ...state.contributions,
                tasks: { ...state.contributions.tasks, [task.id]: next }
            }
        },
        input.now
    );
    const events = [
        {
            type: "contribution.controlled" as const,
            payload: {
                contributionId: task.id,
                generation: next.generation,
                actor: "runtime",
                at: input.now,
                action: "delivery_failed",
                reason: input.reason
            }
        },
        ...notice.effect.events
    ];
    return {
        state: {
            ...notice.state,
            version: state.version + 1,
            updatedAt: input.now,
            eventSeq: state.eventSeq + events.length
        },
        effect: { events }
    };
}

export function evaluateContributionProgress(
    state: MeetingState,
    now: number
): TransitionResult<MeetingState> {
    if (
        state.contributions === undefined ||
        state.status === "created" ||
        state.status === "paused" ||
        executionTerminalStatuses.includes(state.status)
    )
        return { state, effect: { events: [] } };
    const code =
        isObjectiveSatisfied(state) && contributionWorkComplete(state)
            ? "objective_satisfied"
            : state.messageSeq >= state.limits.maxTotalMessages
              ? "message_limit"
              : state.limits.maxDurationMs !== undefined &&
                  now - state.createdAt >= state.limits.maxDurationMs
                ? "time_limit"
                : undefined;
    if (code === undefined) {
        const current = state.agenda.find((item) => item.id === state.activeAgendaItemId);
        const next = state.agenda.find((item) => item.status === "pending");
        if (
            current === undefined ||
            !["resolved", "deferred"].includes(current.status) ||
            next === undefined ||
            Object.values(state.contributions.tasks).some(
                (task) =>
                    task.agendaItemId === current.id &&
                    task.requiredForCompletion &&
                    (task.phase !== "published" ||
                        (task.requiresEvidenceReview && task.reviewStatus !== "complete"))
            )
        )
            return { state, effect: { events: [] } };
        const tasks = { ...state.contributions.tasks };
        const events: TransitionResult<MeetingState>["effect"]["events"] = [];
        for (const task of Object.values(tasks)) {
            if (
                task.agendaItemId !== current.id ||
                task.requiredForCompletion ||
                ["published", "cancelled"].includes(task.phase)
            )
                continue;
            tasks[task.id] = {
                ...task,
                phase: "cancelled",
                generation: task.generation + 1,
                reason: "agenda_advanced",
                updatedAt: now
            };
            events.push({
                type: "contribution.controlled",
                payload: {
                    contributionId: task.id,
                    generation: task.generation + 1,
                    actor: "runtime",
                    at: now,
                    action: "cancel",
                    reason: "agenda_advanced"
                }
            });
        }
        const noticeSeq = state.contributions.managerNoticeSeq + 1;
        events.push(
            {
                type: "contribution.agenda_advanced",
                payload: {
                    fromAgendaItemId: current.id,
                    toAgendaItemId: next.id,
                    actor: "runtime",
                    at: now
                }
            },
            {
                type: "contribution.manager_notified",
                payload: {
                    noticeSeq,
                    contextThroughSeq: state.messageSeq,
                    actor: "runtime",
                    at: now
                }
            }
        );
        return {
            state: {
                ...state,
                version: state.version + 1,
                updatedAt: now,
                eventSeq: state.eventSeq + events.length,
                activeAgendaItemId: next.id,
                agenda: state.agenda.map((item) =>
                    item.id === next.id ? { ...item, status: "discussing" } : item
                ),
                contributions: {
                    ...state.contributions,
                    tasks,
                    managerNoticeSeq: noticeSeq,
                    managerDeadlineAt: now + 600_000
                }
            },
            effect: { events }
        };
    }
    return transitionMeeting(state, code === "objective_satisfied" ? "completed" : "partial", {
        now,
        reason: code,
        termination: {
            code,
            reason: code,
            finalMessage: code,
            endedAt: now,
            decisionIds: state.decisions
                .filter((v) => v.status === "accepted")
                .map((v) => v.id)
                .sort(),
            unresolvedQuestionIds: state.openQuestions
                .filter((v) => v.status === "open" || v.status === "deferred")
                .map((v) => v.id)
                .sort(),
            blockingAgendaItemIds: state.agenda
                .filter((v) => v.status === "blocked")
                .map((v) => v.id)
                .sort(),
            dissentingPositionIds: currentProposals(state)
                .flatMap((v) => blockingPositions(v).map((p) => p.id))
                .sort()
        }
    });
}
