import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomainPlugin from "@deepseek-ai/dsh-storage-domain";
import type { Domain, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { openMeetingRepository } from "../../src/runtime/index.js";
import { RepositoryError } from "../../src/repository/errors.js";
import {
    DomainRepositoryRegistry,
    type DomainFacilityPort
} from "../../src/repository/domain/domain-repository-registry.js";
import { jsonlStoragePlugin } from "../../src/storage/index.js";
import { meetingDomainName, seqKey } from "../../src/repository/domain/keys.js";
import { createMeetingDomainSpec } from "../../src/repository/domain/specs.js";
import {
    createCreateStatusRuntime,
    LocalMeetingRecoveryUnavailableError
} from "../../src/runtime/application-service/index.js";

const roots: string[] = [];
const storageContexts: Array<Promise<Context>> = [];

function storagePort(root: string): DomainFacilityPort {
    const mounting = (async () => {
        const ctx = new Context();
        await ctx.plugin(Storage);
        await ctx.plugin(jsonlStoragePlugin, { root: join(root, "storage") });
        await ctx.plugin(
            {
                name: storageDomainPlugin.name,
                inject: storageDomainPlugin.inject,
                apply: storageDomainPlugin.apply
            },
            { backend: "convivium-jsonl" }
        );
        return ctx;
    })();
    storageContexts.push(mounting);
    return {
        async open<S extends DomainSpec>(spec: S): Promise<Domain<S>> {
            return (await mounting).storageDomain.open(spec);
        }
    };
}

async function openTestRegistry(root: string): Promise<DomainRepositoryRegistry> {
    return DomainRepositoryRegistry.open({
        storageDomain: storagePort(root),
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        }
    });
}
const input = {
    protocolVersion: 1 as const,
    requestId: "create-1",
    teamId: "team-1",
    topic: "Release",
    objective: "Decide scope",
    objectiveContract: {
        requiredOutputs: [],
        acceptanceCriteria: [{ key: "reviewed", description: "Reviewed" }],
        hardConstraints: [],
        requiredReviewerKeys: [],
        riskAcceptanceAuthorityKeys: [],
        acceptableRiskLevel: "medium" as const
    },
    agenda: [
        {
            key: "agenda-1",
            title: "Scope",
            objective: "Agree scope",
            inScope: ["MVP"],
            outOfScope: [],
            completionCriteria: ["Reviewed"],
            requiredParticipantKeys: ["one", "two", "three"]
        }
    ],
    participants: [
        { participantKey: "one", displayName: "One" },
        { participantKey: "two", displayName: "Two" },
        { participantKey: "three", displayName: "Three" }
    ]
};

function localRuntime(
    root: string,
    options: {
        now?: () => number;
        validateCommand?: () => void;
    } = {}
) {
    return createCreateStatusRuntime({
        storageDomain: storagePort(root),
        provider: "spawn",
        continuable: {
            startContinuable: async (spec) => ({
                childId: spec.childId!,
                messageId: `initial-${String(spec.childId)}` as never
            }),
            followup: async () => "followup-message" as never
        },
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: options.validateCommand ?? (() => undefined)
        },
        now: options.now
    });
}

afterEach(async () => {
    await Promise.all(storageContexts.map(async (context) => (await context).fiber.dispose()));
    storageContexts.length = 0;
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("create/status meeting runtime", () => {
    it("persists the designed default mail handling timeout", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-mail-default-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-mail-default",
            kind: "captain" as const,
            agent: { id: "captain-mail-default" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
                participants: [input.participants[0]!]
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId: created.result.meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            result: { limits: { mailHandlingTimeoutMs: 2 * 60_000 } }
        });
        await runtime.dispose();
    });

    it("atomically rejects invalid blocking evidence and persists an idempotent canonical question", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-blocking-question-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                objectiveContract: {
                    ...input.objectiveContract,
                    requiredOutputs: [{ key: "done", description: "Done output" }]
                },
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
                participants: [input.participants[0]!]
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const meetingId = created.result.meetingId;
        const participant = {
            sessionId: `${meetingId}-participant-participant-one`,
            meetingId,
            participantId: "participant-one",
            kind: "participant" as const
        };
        const submission = {
            protocolVersion: 1 as const,
            meetingId,
            turnId: "turn-1",
            stepId: "step-participant-one-0",
            attemptId: "attempt-0",
            deliveryId: "delivery-0",
            agendaItemId: "agenda-agenda-1",
            kind: "question" as const,
            content: "Evidence needed",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic" as const,
            changes: {
                questions: [
                    {
                        text: "Unknown output",
                        blocking: true,
                        affectedOutputIds: ["output-missing"]
                    }
                ]
            }
        };

        await expect(runtime.submitTurn(submission, participant)).resolves.toMatchObject({
            ok: false,
            code: "INVALID_ARGUMENT"
        });
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            meetingVersion: created.meetingVersion,
            result: { messages: [], questions: [] }
        });

        const validSubmission = {
            ...submission,
            changes: {
                questions: [
                    {
                        text: "Output is not accepted",
                        blocking: true,
                        affectedOutputIds: ["output-done"]
                    }
                ]
            }
        };
        const committed = await runtime.submitTurn(validSubmission, participant);
        expect(committed).toMatchObject({ ok: true, meetingVersion: created.meetingVersion + 1 });
        await expect(runtime.submitTurn(validSubmission, participant)).resolves.toEqual(committed);
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            result: {
                questions: [
                    {
                        blocking: true,
                        affectedOutputIds: ["output-done"],
                        affectedCriterionIds: [],
                        violatedConstraintIds: []
                    }
                ]
            }
        });
        await runtime.dispose();
        const reopened = localRuntime(root);
        await expect(
            reopened.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            result: {
                questions: [
                    {
                        blocking: true,
                        affectedOutputIds: ["output-done"],
                        affectedCriterionIds: [],
                        violatedConstraintIds: []
                    }
                ]
            }
        });
        await reopened.dispose();
    });

    it("expires only a due current SpeakerAttempt and rejects its late submit", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-speaker-timeout-"));
        roots.push(root);
        let time = Date.now() + 10_000;
        const interrupted: string[] = [];
        const deliveryOrder: string[] = [];
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            outboxPollMs: 1,
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async (_parent, sessionId) => {
                    deliveryOrder.push(`followup:${String(sessionId)}`);
                    return "followup-message" as never;
                },
                interrupt: (sessionId) => {
                    interrupted.push(String(sessionId));
                    deliveryOrder.push(`interrupt:${String(sessionId)}`);
                },
                drainContinuableChildren: async (_parent, sessionIds) => {
                    deliveryOrder.push(`drain:start:${sessionIds.map(String).join(",")}`);
                    await Promise.resolve();
                    deliveryOrder.push(`drain:end:${sessionIds.map(String).join(",")}`);
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => time
        });
        const captain = {
            sessionId: "captain-timeout",
            kind: "captain" as const,
            agent: { id: "captain-timeout" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one", "two"] }],
                participants: [input.participants[0]!, input.participants[1]!],
                limits: { maxSpeakersPerTurn: 2, speakerAttemptTimeoutMs: 10 }
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const firstSessionId = `${created.result.meetingId}-participant-participant-one`;
        const secondSessionId = `${created.result.meetingId}-participant-participant-two`;
        await vi.waitFor(() => expect(deliveryOrder).toContain(`followup:${firstSessionId}`));
        await runtime.scanExpiredSpeakerAttempts();
        expect(
            await runtime.getStatus(
                { protocolVersion: 1, meetingId: created.result.meetingId },
                captain
            )
        ).toMatchObject({ ok: true, meetingVersion: created.meetingVersion });
        time += 10;
        await runtime.scanExpiredSpeakerAttempts();
        await vi.waitFor(() => expect(deliveryOrder).toContain(`followup:${secondSessionId}`));
        const status = await runtime.getStatus(
            { protocolVersion: 1, meetingId: created.result.meetingId },
            captain
        );
        expect(status).toMatchObject({
            ok: true,
            meetingVersion: created.meetingVersion + 1,
            result: { currentSpeakerId: "participant-two" }
        });
        expect(interrupted).toEqual([firstSessionId]);
        expect(deliveryOrder.indexOf(`interrupt:${firstSessionId}`)).toBeLessThan(
            deliveryOrder.indexOf(`drain:start:${firstSessionId}`)
        );
        expect(deliveryOrder.indexOf(`drain:end:${firstSessionId}`)).toBeLessThan(
            deliveryOrder.indexOf(`followup:${secondSessionId}`)
        );
        await runtime.scanExpiredSpeakerAttempts();
        expect(
            await runtime.getStatus(
                { protocolVersion: 1, meetingId: created.result.meetingId },
                captain
            )
        ).toMatchObject({ ok: true, meetingVersion: created.meetingVersion + 1 });
        await expect(
            runtime.submitTurn(
                {
                    protocolVersion: 1,
                    meetingId: created.result.meetingId,
                    turnId: "turn-1",
                    stepId: "step-participant-one-0",
                    attemptId: "attempt-0",
                    deliveryId: "delivery-0",
                    agendaItemId: "agenda-agenda-1",
                    kind: "statement",
                    content: "late",
                    mentions: [],
                    taskIds: [],
                    agendaRelation: "on_topic",
                    changes: {}
                },
                {
                    sessionId: `${created.result.meetingId}-participant-participant-one`,
                    meetingId: created.result.meetingId,
                    participantId: "participant-one",
                    kind: "participant"
                }
            )
        ).resolves.toMatchObject({ ok: false, code: "STALE_ATTEMPT" });
        await runtime.dispose();
    });

    it("dispatches the next Manager plan with the shared failure-threshold eligibility", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-manager-timeout-"));
        roots.push(root);
        let time = Date.now() + 10_000;
        const managerContexts: Array<{ dispatchableParticipantIds?: string[] }> = [];
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            outboxPollMs: 1,
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async (_parent, _sessionId, prompt) => {
                    const text = prompt[0]?.type === "text" ? prompt[0].text : undefined;
                    if (typeof text === "string" && text.startsWith("{")) {
                        managerContexts.push(
                            JSON.parse(text) as { dispatchableParticipantIds?: string[] }
                        );
                    }
                    return "followup-message" as never;
                },
                interrupt: () => undefined
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => time
        });
        const captain = {
            sessionId: "captain-manager-timeout",
            kind: "captain" as const,
            agent: { id: "captain-manager-timeout" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                selectionMode: "manager",
                objectiveContract: {
                    ...input.objectiveContract,
                    requiredOutputs: [{ key: "done", description: "Done" }]
                },
                agenda: [
                    {
                        ...input.agenda[0]!,
                        completionCriteria: ["Done"],
                        requiredParticipantKeys: []
                    }
                ],
                participants: [input.participants[0]!, input.participants[1]!],
                limits: {
                    maxSpeakersPerTurn: 1,
                    speakerAttemptTimeoutMs: 5,
                    maxConsecutiveAttemptFailuresPerParticipant: 1
                }
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        await vi.waitFor(() => expect(managerContexts).toHaveLength(1));
        const meetingId = created.result.meetingId;
        const planned = await runtime.submitManagerPlan(
            {
                protocolVersion: 1,
                meetingId,
                requestId: "manager-timeout-plan",
                planningAttemptId: `${meetingId}-planning-1`,
                observedMeetingVersion: created.meetingVersion,
                agendaItemId: "agenda-agenda-1",
                intent: "explore",
                objective: "Resolve output",
                expectedOutputs: ["output-done"],
                prohibitedTopics: [],
                steps: [
                    {
                        participantId: "participant-one",
                        instruction: "Investigate",
                        reason: "manager_selected"
                    }
                ]
            },
            {
                sessionId: `${meetingId}-manager-manager`,
                meetingId,
                kind: "manager"
            }
        );
        expect(planned).toMatchObject({ ok: true });
        time += 5;
        await runtime.scanExpiredSpeakerAttempts();
        await vi.waitFor(() => expect(managerContexts).toHaveLength(2));
        expect(managerContexts[1]?.dispatchableParticipantIds).toEqual(["participant-two"]);
        const afterTimeout = await runtime.getStatus({ protocolVersion: 1, meetingId }, captain);
        if (!afterTimeout.ok) throw new Error("status failed");
        const invalidPlanInput = {
            protocolVersion: 1,
            meetingId,
            requestId: "manager-timeout-invalid-plan",
            planningAttemptId: `${meetingId}-planning-2`,
            observedMeetingVersion: afterTimeout.meetingVersion,
            agendaItemId: "agenda-agenda-1",
            intent: "explore",
            objective: "Retry failed participant",
            expectedOutputs: ["output-done"],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-one",
                    instruction: "Retry",
                    reason: "manager_selected"
                }
            ]
        } as const;
        const invalidPlan = await runtime.submitManagerPlan(invalidPlanInput, {
            sessionId: `${meetingId}-manager-manager`,
            meetingId,
            kind: "manager"
        });
        expect(invalidPlan).toMatchObject({
            ok: true,
            result: {
                status: "planned",
                fallbackApplied: true,
                fallbackReason: "manager_plan_invalid"
            }
        });
        const fallbackStatus = await runtime.getStatus({ protocolVersion: 1, meetingId }, captain);
        if (!fallbackStatus.ok) throw new Error("fallback status failed");
        expect(fallbackStatus.meetingVersion).toBe(afterTimeout.meetingVersion + 1);
        expect(fallbackStatus.result.currentTurn?.reason).toBe("manager_fallback");
        const replay = await runtime.submitManagerPlan(invalidPlanInput, {
            sessionId: `${meetingId}-manager-manager`,
            meetingId,
            kind: "manager"
        });
        expect(replay).toEqual(invalidPlan);
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({ meetingVersion: fallbackStatus.meetingVersion });
        await runtime.dispose();
    });

    it("continues scanning healthy Meetings before surfacing one repository failure", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-timeout-isolation-"));
        roots.push(root);
        let time = 0;
        const rejectedMeeting: { id?: string } = {};
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            timeoutScanSleep: async (_delay, signal) =>
                new Promise<void>((resolve) => {
                    signal.addEventListener("abort", resolve, { once: true });
                }),
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: ({ snapshot, command }) => {
                    if (
                        snapshot.meetingId === rejectedMeeting.id &&
                        command.commandKind === "expire_speaker_attempt"
                    )
                        throw new RepositoryError(
                            "CORRUPT_DATABASE",
                            false,
                            snapshot.meetingId,
                            "fixture repository failure"
                        );
                }
            },
            now: () => time
        });
        const captain = {
            sessionId: "captain-isolation",
            kind: "captain" as const,
            agent: { id: "captain-isolation" } as never
        };
        const meetingInput = {
            ...input,
            agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
            participants: [input.participants[0]!],
            limits: {
                maxSpeakersPerTurn: 1,
                speakerAttemptTimeoutMs: 5,
                maxConsecutiveAttemptFailuresPerParticipant: 1
            }
        };
        const broken = await runtime.createMeeting(
            { ...meetingInput, requestId: "create-broken" },
            captain,
            new AbortController().signal
        );
        const healthy = await runtime.createMeeting(
            { ...meetingInput, requestId: "create-healthy" },
            captain,
            new AbortController().signal
        );
        if (!broken.ok || !healthy.ok) throw new Error("create failed");
        rejectedMeeting.id = broken.result.meetingId;

        time = 5;
        await expect(runtime.scanExpiredSpeakerAttempts()).rejects.toMatchObject({
            code: "CORRUPT_DATABASE"
        });
        const healthyStatus = await runtime.getStatus(
            { protocolVersion: 1, meetingId: healthy.result.meetingId },
            captain
        );
        expect(healthyStatus).toMatchObject({ ok: true });
        expect(healthyStatus.meetingVersion).toBeGreaterThan(healthy.meetingVersion);
        await runtime.dispose();
    });

    it("runs the timeout scan from the runtime lifecycle and stops it on dispose", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-timeout-monitor-"));
        roots.push(root);
        let time = 0;
        const sleepers: Array<() => void> = [];
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            outboxPollMs: 10,
            timeoutScanSleep: async (_delay, signal) =>
                new Promise<void>((resolve) => {
                    sleepers.push(resolve);
                    signal.addEventListener("abort", resolve, { once: true });
                }),
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => time
        });
        await vi.waitFor(() => expect(sleepers).toHaveLength(1));
        const captain = {
            sessionId: "captain-monitor",
            kind: "captain" as const,
            agent: { id: "captain-monitor" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
                participants: [input.participants[0]!],
                limits: {
                    maxSpeakersPerTurn: 1,
                    speakerAttemptTimeoutMs: 5,
                    maxConsecutiveAttemptFailuresPerParticipant: 1
                }
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        time = 5;
        sleepers.shift()!();
        await vi.waitFor(() => expect(sleepers).toHaveLength(1));
        await vi.waitFor(async () =>
            expect(
                await runtime.getStatus(
                    { protocolVersion: 1, meetingId: created.result.meetingId },
                    captain
                )
            ).toMatchObject({
                ok: true,
                result: {
                    status: "waiting",
                    waitState: {
                        reason: "required_participant_unavailable",
                        participantIds: ["participant-one"]
                    }
                }
            })
        );
        const sleepCount = sleepers.length;
        await runtime.dispose();
        await Promise.resolve();
        expect(sleepers).toHaveLength(sleepCount);
    });

    it("commits proposal and caller-bound position once, while rejecting stale decision proposal submissions", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-proposal-position-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
                participants: [input.participants[0]!]
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const meetingId = created.result.meetingId;
        const participant = {
            sessionId: `${meetingId}-participant-participant-one`,
            meetingId,
            participantId: "participant-one",
            kind: "participant" as const
        };
        const submission = {
            protocolVersion: 1 as const,
            meetingId,
            turnId: "turn-1",
            stepId: "step-participant-one-0",
            attemptId: "attempt-0",
            deliveryId: "delivery-0",
            agendaItemId: "agenda-agenda-1",
            kind: "proposal" as const,
            content: "Use SQLite",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic" as const,
            changes: {
                proposals: [{ title: "Storage", description: "Use SQLite." }],
                positions: [
                    {
                        proposalId: "delivery-0-proposal-1",
                        proposalRevision: 1,
                        position: "accept" as const,
                        blocking: false
                    }
                ],
                agendaCandidates: [
                    {
                        title: "Follow-up",
                        reason: "Separate discussion",
                        relationToActiveAgenda: "adjacent" as const,
                        urgency: "later" as const,
                        suggestedParticipants: ["participant-one"]
                    }
                ]
            }
        };
        const committed = await runtime.submitTurn(submission, participant);
        expect(committed).toMatchObject({ ok: true, meetingVersion: 2 });
        await expect(runtime.submitTurn(submission, participant)).resolves.toEqual(committed);
        await expect(
            runtime.submitTurn(
                {
                    ...submission,
                    deliveryId: "delivery-1",
                    changes: {
                        decisionProposals: [
                            {
                                proposalId: "delivery-0-proposal-1",
                                proposalRevision: 1,
                                statement: "Accept",
                                rationale: "Supported"
                            }
                        ]
                    }
                },
                participant
            )
        ).resolves.toMatchObject({ ok: false, code: "STALE_ATTEMPT" });
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            meetingVersion: 2,
            result: { messages: [expect.objectContaining({ id: "message-delivery-0" })] }
        });
        await runtime.dispose();
    });

    it("lets the authenticated Captain dispose a submitted risk without a Participant identity", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-captain-risk-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                objectiveContract: {
                    ...input.objectiveContract,
                    requiredOutputs: [{ key: "done", description: "Done output" }]
                },
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
                participants: [input.participants[0]!]
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const meetingId = created.result.meetingId;
        const submitted = await runtime.submitTurn(
            {
                protocolVersion: 1,
                meetingId,
                turnId: "turn-1",
                stepId: "step-participant-one-0",
                attemptId: "attempt-0",
                deliveryId: "delivery-0",
                agendaItemId: "agenda-agenda-1",
                kind: "statement",
                content: "The output has a bounded risk.",
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic",
                changes: {
                    issues: [
                        {
                            title: "Bounded risk",
                            description: "The output has a low-impact risk.",
                            affectedOutputIds: ["output-done"],
                            affectedCriterionIds: [],
                            violatedConstraintIds: [],
                            impact: "low",
                            urgency: "before_release",
                            safeDefaultAvailable: true
                        }
                    ]
                }
            },
            {
                sessionId: `${meetingId}-participant-participant-one`,
                meetingId,
                participantId: "participant-one",
                kind: "participant" as const
            }
        );
        if (!submitted.ok) throw new Error("risk submission failed");

        const disposition = {
            protocolVersion: 1 as const,
            meetingId,
            expectedMeetingVersion: submitted.meetingVersion,
            requestId: "dispose-risk-1",
            issueId: "issue-delivery-0-1",
            decision: "accept" as const,
            reason: "Captain accepted the bounded risk.",
            evidenceMessageIds: ["message-delivery-0"]
        };
        const disposed = await runtime.disposeRisk(disposition, captain);
        expect(disposed).toMatchObject({
            ok: true,
            meetingVersion: submitted.meetingVersion + 1,
            result: {
                issueId: "issue-delivery-0-1",
                disposition: "accepted"
            }
        });
        await expect(runtime.disposeRisk(disposition, captain)).resolves.toEqual(disposed);
        await runtime.dispose();
    });

    it("revokes the current attempt before Captain reassignment and rejects its late submission", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-reassign-turn-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one", "two"] }],
                limits: { maxSpeakersPerTurn: 2 }
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const meetingId = created.result.meetingId;
        const reassigned = await runtime.reassignTurn(
            {
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: created.meetingVersion,
                currentAttemptId: "attempt-0",
                action: "reassign",
                replacementParticipantId: "participant-three",
                reason: "Captain reassigned the current speaker.",
                requestId: "reassign-1"
            },
            captain,
            new AbortController().signal
        );
        expect(reassigned).toMatchObject({
            ok: true,
            meetingVersion: 2,
            result: { revokedAttemptId: "attempt-0", action: "reassign" }
        });
        if (!reassigned.ok || !reassigned.result.replacementAttemptId)
            throw new Error("reassignment did not create a replacement attempt");
        await expect(
            runtime.submitTurn(
                {
                    protocolVersion: 1,
                    meetingId,
                    turnId: "turn-1",
                    stepId: "step-participant-one-0",
                    attemptId: "attempt-0",
                    deliveryId: "delivery-0",
                    agendaItemId: "agenda-agenda-1",
                    kind: "statement",
                    content: "late submission",
                    mentions: [],
                    taskIds: [],
                    agendaRelation: "on_topic",
                    changes: {}
                },
                {
                    sessionId: `${meetingId}-participant-participant-one`,
                    meetingId,
                    participantId: "participant-one",
                    kind: "participant" as const
                }
            )
        ).resolves.toMatchObject({ ok: false, code: "STALE_ATTEMPT" });
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            result: { currentSpeakerId: "participant-three" }
        });
        await expect(
            runtime.reassignTurn(
                {
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: 2,
                    currentAttemptId: reassigned.result.replacementAttemptId,
                    action: "skip",
                    reason: "Captain skipped the reassigned speaker.",
                    requestId: "skip-1"
                },
                captain,
                new AbortController().signal
            )
        ).resolves.toMatchObject({
            ok: true,
            meetingVersion: 3,
            result: { action: "skip", revokedAttemptId: reassigned.result.replacementAttemptId }
        });
        await runtime.dispose();
    });

    it("binds loopback skip to the fixed local source and preserves replay and stale gates", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-local-skip-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-local-skip",
            kind: "captain" as const,
            agent: { id: "captain-local-skip" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one", "two"] }],
                participants: [input.participants[0]!, input.participants[1]!]
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const request = {
            protocolVersion: 1 as const,
            meetingId: created.result.meetingId,
            expectedMeetingVersion: created.meetingVersion,
            currentAttemptId: "attempt-0",
            action: "skip" as const,
            reason: "Local user skipped the current speaker.",
            requestId: "local-skip-1"
        };
        const skipped = await runtime.reassignLocalTurn(request);
        expect(skipped).toMatchObject({
            ok: true,
            meetingVersion: created.meetingVersion + 1,
            result: { action: "skip", revokedAttemptId: "attempt-0" }
        });
        await expect(runtime.reassignLocalTurn(request)).resolves.toEqual(skipped);
        await expect(
            runtime.reassignLocalTurn({ ...request, reason: "different hash" })
        ).resolves.toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
        await expect(
            runtime.reassignLocalTurn({
                ...request,
                expectedMeetingVersion: created.meetingVersion + 1,
                requestId: "local-skip-stale",
                currentAttemptId: "attempt-0"
            })
        ).resolves.toMatchObject({ ok: false, code: "STALE_ATTEMPT" });
        await runtime.dispose();

        const recovered = localRuntime(root);
        await expect(recovered.reassignLocalTurn(request)).resolves.toEqual(skipped);
        await recovered.dispose();
    });

    it("fails local End before committing when archive cleanup capability is unavailable", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-local-end-preflight-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-local-end-preflight",
            kind: "captain" as const,
            agent: { id: "captain-local-end-preflight" } as never
        };
        const created = await runtime.createMeeting(input, captain, new AbortController().signal);
        if (!created.ok) throw new Error("create failed");
        await expect(
            runtime.endLocalMeeting({
                protocolVersion: 1,
                meetingId: created.result.meetingId,
                expectedMeetingVersion: created.meetingVersion,
                outcome: "cancelled",
                reason: "Local user cancelled the meeting.",
                acceptedDecisionIds: [],
                deferredAgendaItemIds: [],
                waivers: [],
                requestId: "local-end-preflight-1"
            })
        ).rejects.toBeInstanceOf(LocalMeetingRecoveryUnavailableError);
        await expect(
            runtime.getLocalMeetingStatus({
                protocolVersion: 1,
                meetingId: created.result.meetingId
            })
        ).resolves.toMatchObject({
            ok: true,
            meetingVersion: created.meetingVersion,
            result: { status: "running" }
        });
        await runtime.dispose();
    });

    it("archives a local End and recovers from post-commit cleanup failure", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-local-end-archive-"));
        roots.push(root);
        const children: Array<{ id: string; label: string }> = [];
        const interrupted: string[] = [];
        const drained: string[][] = [];
        let failDrain = true;
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    children.push({ id: String(spec.childId), label: spec.label });
                    return {
                        childId: spec.childId!,
                        messageId: `initial-${String(spec.childId)}` as never
                    };
                },
                followup: async () => "followup-message" as never,
                listChildren: async () =>
                    children.map((child) => ({
                        kind: "child" as const,
                        id: child.id as never,
                        activity: "inactive" as const,
                        hasChildren: false,
                        mode: "continuable" as const,
                        label: child.label
                    })),
                interrupt: (childId) => interrupted.push(String(childId)),
                drainContinuableChildren: async (_parent, childIds) => {
                    drained.push(childIds.map(String));
                    if (failDrain) {
                        failDrain = false;
                        throw new Error("cleanup failed after termination commit");
                    }
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => 100
        });
        const captain = {
            sessionId: "captain-local-end-archive",
            kind: "captain" as const,
            agent: { id: "captain-local-end-archive" } as never
        };
        const created = await runtime.createMeeting(input, captain, new AbortController().signal);
        if (!created.ok) throw new Error("create failed");
        const request = {
            protocolVersion: 1,
            meetingId: created.result.meetingId,
            expectedMeetingVersion: created.meetingVersion,
            outcome: "cancelled",
            reason: "Local user cancelled the meeting.",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: [],
            requestId: "local-end-archive-1"
        } as const;
        const ended = await runtime.endLocalMeeting(request);
        expect(ended).toMatchObject({ ok: true, result: { status: "cancelled" } });
        await expect(
            runtime.getLocalMeetingStatus({
                protocolVersion: 1,
                meetingId: created.result.meetingId
            })
        ).resolves.toMatchObject({ ok: true, result: { status: "archiving" } });
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId: created.result.meetingId }, captain)
        ).resolves.toMatchObject({ ok: true, result: { status: "archived" } });
        expect(interrupted).toEqual(
            expect.arrayContaining([
                `${created.result.meetingId}-manager-manager`,
                `${created.result.meetingId}-participant-participant-one`
            ])
        );
        expect(drained).toHaveLength(2);
        await runtime.dispose();

        const recovered = localRuntime(root);
        await expect(recovered.endLocalMeeting(request)).resolves.toEqual(ended);
        await recovered.dispose();
    });

    it("delivers the MeetingTask execution and request bindings", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-task-envelope-"));
        roots.push(root);
        const prompts: string[] = [];
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            outboxPollMs: 5,
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async (_parent, _sessionId, prompt) => {
                    const text = prompt[0]?.type === "text" ? prompt[0].text : undefined;
                    if (typeof text === "string") prompts.push(text);
                    return "followup-message" as never;
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const created = await runtime.createMeeting(
            {
                ...input,
                agenda: [
                    {
                        ...input.agenda[0]!,
                        requiredParticipantKeys: ["one"]
                    }
                ],
                participants: [input.participants[0]!]
            },
            {
                sessionId: "captain-1",
                kind: "captain",
                agent: { id: "captain-1" } as never
            },
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const meetingId = created.result.meetingId;
        const participant = {
            sessionId: `${meetingId}-participant-participant-one`,
            meetingId,
            participantId: "participant-one",
            kind: "participant" as const
        };
        await vi.waitFor(() => expect(prompts).toHaveLength(1));
        const task = await runtime.createMeetingTask(
            {
                protocolVersion: 1,
                meetingId,
                attemptId: "attempt-0",
                requestId: "task-request",
                title: "Inspect release",
                description: "Inspect the release evidence",
                blocking: true
            },
            participant
        );
        if (!task.ok) throw new Error("task creation failed");

        const submitted = await runtime.submitTurn(
            {
                protocolVersion: 1,
                meetingId,
                turnId: "turn-1",
                stepId: "step-participant-one-0",
                attemptId: "attempt-0",
                deliveryId: "delivery-0",
                agendaItemId: "agenda-agenda-1",
                kind: "statement",
                content: "Task queued",
                mentions: [],
                taskIds: [task.result.meetingTaskId],
                agendaRelation: "on_topic",
                changes: {}
            },
            participant
        );
        if (!submitted.ok) throw new Error(JSON.stringify(submitted));

        const executionId = `${task.result.meetingTaskId}-execution`;
        const deliveryId = `${task.result.meetingTaskId}-delivery`;
        await vi.waitFor(() => expect(prompts.length).toBeGreaterThan(1), { timeout: 5_000 });
        expect(prompts).toEqual(
            expect.arrayContaining([
                expect.stringContaining(`executionId: ${executionId}`),
                expect.stringContaining(`deliveryId: ${deliveryId}`)
            ])
        );
        await runtime.dispose();
    });

    it.each([
        { status: "failed" as const, pauseBeforeFinish: false, blocking: true },
        { status: "completed" as const, pauseBeforeFinish: false, blocking: true },
        { status: "completed" as const, pauseBeforeFinish: true, blocking: true },
        { status: "completed" as const, pauseBeforeFinish: false, blocking: false }
    ])(
        "finishes a $status task with the matching hand raise contract (paused: $pauseBeforeFinish, blocking: $blocking)",
        async ({ status, pauseBeforeFinish, blocking }) => {
            const root = await mkdtemp(join(tmpdir(), "convivium-tools-failed-task-"));
            roots.push(root);
            const prompts: string[] = [];
            const runtime = createCreateStatusRuntime({
                storageDomain: storagePort(root),
                provider: "spawn",
                outboxPollMs: 5,
                continuable: {
                    startContinuable: async (spec) => ({
                        childId: spec.childId!,
                        messageId: `initial-${String(spec.childId)}` as never
                    }),
                    followup: async (_parent, _sessionId, prompt) => {
                        const text = prompt[0]?.type === "text" ? prompt[0].text : undefined;
                        if (typeof text === "string") prompts.push(text);
                        return `followup-message-${prompts.length}` as never;
                    }
                },
                authorizationValidator: {
                    validateCreate: () => undefined,
                    validateCommand: () => undefined
                }
            });
            const created = await runtime.createMeeting(
                {
                    ...input,
                    objectiveContract: {
                        ...input.objectiveContract,
                        requiredOutputs: [
                            { key: "task-output", description: "Completed task evidence" }
                        ],
                        acceptanceCriteria: [
                            { key: "task-followup", description: "Submit completed task evidence" }
                        ]
                    },
                    agenda: [
                        {
                            ...input.agenda[0]!,
                            completionCriteria: ["task-followup"],
                            requiredParticipantKeys: ["one"]
                        }
                    ],
                    participants: [input.participants[0]!, input.participants[1]!],
                    selectionMode: "manager"
                },
                { sessionId: "captain-1", kind: "captain", agent: { id: "captain-1" } as never },
                new AbortController().signal
            );
            if (!created.ok) throw new Error("create failed");
            await vi.waitFor(() => expect(prompts).toHaveLength(1));
            const meetingId = created.result.meetingId;
            const captain = {
                sessionId: "captain-1",
                kind: "captain" as const,
                agent: { id: "captain-1" } as never
            };
            const manager = {
                sessionId: `${meetingId}-manager-manager`,
                meetingId,
                kind: "manager" as const
            };
            const planned = await runtime.submitManagerPlan(
                {
                    protocolVersion: 1,
                    meetingId,
                    requestId: "initial-plan",
                    planningAttemptId: `${meetingId}-planning-1`,
                    observedMeetingVersion: 1,
                    agendaItemId: "agenda-agenda-1",
                    intent: "explore",
                    objective: "Start task evidence flow",
                    expectedOutputs: [],
                    prohibitedTopics: [],
                    steps: [
                        {
                            participantId: "participant-one",
                            instruction: "Queue the task",
                            reason: "manager_selected"
                        }
                    ]
                },
                manager
            );
            expect(planned).toMatchObject({ ok: true });
            if (!planned.ok) throw new Error("initial plan failed");
            const participant = {
                sessionId: `${meetingId}-participant-participant-one`,
                meetingId,
                participantId: "participant-one",
                kind: "participant" as const
            };
            const task = await runtime.createMeetingTask(
                {
                    protocolVersion: 1,
                    meetingId,
                    attemptId: planned.result.firstAttemptId,
                    requestId: "task-request",
                    title: "Inspect release",
                    description: "Inspect the release evidence",
                    blocking
                },
                participant
            );
            if (!task.ok) throw new Error("task creation failed");
            const submitted = await runtime.submitTurn(
                {
                    protocolVersion: 1,
                    meetingId,
                    turnId: planned.result.turnId,
                    stepId: planned.result.firstStepId,
                    attemptId: planned.result.firstAttemptId,
                    deliveryId: `${planned.result.turnId}-delivery-0`,
                    agendaItemId: "agenda-agenda-1",
                    kind: "statement",
                    content: "Queue failing task",
                    mentions: [],
                    taskIds: [task.result.meetingTaskId],
                    agendaRelation: "on_topic",
                    changes: {}
                },
                participant
            );
            if (!submitted.ok) throw new Error(JSON.stringify(submitted));
            if (blocking) {
                await vi.waitFor(() => expect(prompts.length).toBeGreaterThan(1), {
                    timeout: 5_000
                });
            } else {
                await vi.waitFor(async () => {
                    const taskStatus = await runtime.meetingTaskStatus(
                        {
                            protocolVersion: 1,
                            meetingId,
                            meetingTaskId: task.result.meetingTaskId
                        },
                        participant
                    );
                    expect(taskStatus).toMatchObject({
                        ok: true,
                        result: { task: { status: "queued" } }
                    });
                });
            }
            const executionId = `${task.result.meetingTaskId}-execution`;
            const started = await runtime.startMeetingTask(
                {
                    protocolVersion: 1,
                    meetingId,
                    meetingTaskId: task.result.meetingTaskId,
                    requestId: "failed-start",
                    executionId
                } as never,
                participant
            );
            expect(started).toMatchObject({ ok: true });
            if (!started.ok) throw new Error("task start failed");
            if (pauseBeforeFinish) {
                await expect(
                    runtime.pause(
                        {
                            protocolVersion: 1,
                            meetingId,
                            expectedMeetingVersion: started.meetingVersion,
                            requestId: "pause-before-finish",
                            reason: "verify paused task completion"
                        },
                        {
                            sessionId: "captain-1",
                            kind: "captain",
                            agent: { id: "captain-1" } as never
                        }
                    )
                ).resolves.toMatchObject({ ok: true });
            }
            const finishInput = {
                protocolVersion: 1,
                meetingId,
                meetingTaskId: task.result.meetingTaskId,
                requestId: "failed-finish",
                executionId,
                status,
                ...(status === "completed"
                    ? { resultSummary: "fixture result" }
                    : { failureReason: "fixture failure" })
            };
            const finished = await runtime.finishMeetingTask(finishInput, participant);
            expect(finished).toMatchObject({
                ok: true,
                result: { status }
            });
            if (!finished.ok) throw new Error("finish failed");
            if (status === "completed") {
                expect(finished.result.handRaiseId).toBe(`${task.result.meetingTaskId}-hand-raise`);
                if (!pauseBeforeFinish) {
                    const nextPlan = await runtime.submitManagerPlan(
                        {
                            protocolVersion: 1,
                            meetingId,
                            requestId: "next-plan",
                            planningAttemptId: `${meetingId}-planning-2`,
                            observedMeetingVersion: finished.meetingVersion,
                            agendaItemId: "agenda-agenda-1",
                            intent: "explore",
                            objective: "Continue after task evidence",
                            expectedOutputs: [],
                            prohibitedTopics: [],
                            steps: [
                                {
                                    participantId: "participant-one",
                                    instruction: "Continue the meeting",
                                    reason: "manager_selected"
                                }
                            ]
                        },
                        manager
                    );
                    expect(nextPlan).toMatchObject({ ok: true });
                }
            } else {
                expect(finished.result).not.toHaveProperty("handRaiseId");
            }
            await expect(runtime.finishMeetingTask(finishInput, participant)).resolves.toEqual(
                finished
            );
            await runtime.dispose();

            const recoveredRuntime = createCreateStatusRuntime({
                storageDomain: storagePort(root),
                provider: "spawn",
                continuable: {
                    startContinuable: async () => {
                        throw new Error("recovery must not create Sessions");
                    },
                    followup: async () => {
                        throw new Error("recovery must not dispatch a terminal task");
                    }
                },
                authorizationValidator: {
                    validateCreate: () => undefined,
                    validateCommand: () => undefined
                }
            });
            await expect(
                recoveredRuntime.getStatus({ protocolVersion: 1, meetingId }, captain)
            ).resolves.toMatchObject({
                ok: true,
                result: {
                    status: pauseBeforeFinish ? "paused" : expect.any(String)
                }
            });
            await expect(
                recoveredRuntime.meetingTaskStatus(
                    {
                        protocolVersion: 1,
                        meetingId,
                        meetingTaskId: task.result.meetingTaskId
                    },
                    participant
                )
            ).resolves.toMatchObject({
                ok: true,
                result: {
                    task: { status },
                    meetingTerminal: false,
                    mayExecute: false
                }
            });
            await recoveredRuntime.dispose();
        }
    );

    it("scopes request-derived HandRaise IDs to the Participant", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-scoped-ids-"));
        roots.push(root);
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => 100
        });
        const created = await runtime.createMeeting(
            input,
            {
                sessionId: "captain-1",
                kind: "captain",
                agent: { id: "captain-1" } as never
            },
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const request = {
            protocolVersion: 1 as const,
            meetingId: created.result.meetingId,
            requestId: "shared-request",
            reason: "new_evidence" as const,
            summary: "New evidence",
            taskIds: [],
            priority: "normal" as const
        };
        const first = await runtime.raiseHand(request, {
            sessionId: `${created.result.meetingId}-participant-participant-one`,
            meetingId: created.result.meetingId,
            participantId: "participant-one",
            kind: "participant"
        });
        const second = await runtime.raiseHand(request, {
            sessionId: `${created.result.meetingId}-participant-participant-two`,
            meetingId: created.result.meetingId,
            participantId: "participant-two",
            kind: "participant"
        });

        expect(first).toMatchObject({ ok: true });
        expect(second).toMatchObject({ ok: true });
        if (!first.ok || !second.ok) throw new Error("raise hand failed");
        expect(first.result.handRaiseId).not.toBe(second.result.handRaiseId);
        await runtime.dispose();
    });

    it("returns an existing equivalent pending hand raise without advancing the meeting", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-duplicate-raise-"));
        roots.push(root);
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => 100
        });
        const created = await runtime.createMeeting(
            input,
            {
                sessionId: "captain-1",
                kind: "captain",
                agent: { id: "captain-1" } as never
            },
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const caller = {
            sessionId: `${created.result.meetingId}-participant-participant-one`,
            meetingId: created.result.meetingId,
            participantId: "participant-one",
            kind: "participant" as const
        };
        const request = {
            protocolVersion: 1 as const,
            meetingId: created.result.meetingId,
            reason: "new_evidence" as const,
            summary: "New evidence",
            taskIds: [],
            priority: "normal" as const
        };
        const first = await runtime.raiseHand({ ...request, requestId: "raise-1" }, caller);
        if (!first.ok) throw new Error("first raise failed");
        const second = await runtime.raiseHand({ ...request, requestId: "raise-2" }, caller);

        expect(second).toMatchObject({
            ok: true,
            meetingVersion: first.meetingVersion,
            result: { handRaiseId: first.result.handRaiseId, status: "pending" }
        });
        await runtime.dispose();
    });

    it("commits completion claims with the turn and rejects unavailable task evidence atomically", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-completion-"));
        roots.push(root);
        const children: Array<{ id: string; label: string }> = [];
        const interrupted: string[] = [];
        const drained: string[][] = [];
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    children.push({ id: String(spec.childId), label: spec.label });
                    return {
                        childId: spec.childId!,
                        messageId: `initial-${String(spec.childId)}` as never
                    };
                },
                followup: async () => "followup-message" as never,
                listChildren: async () =>
                    children.map((child) => ({
                        kind: "child" as const,
                        id: child.id as never,
                        activity: "inactive" as const,
                        hasChildren: false,
                        mode: "continuable" as const,
                        label: child.label
                    })),
                interrupt: (childId) => {
                    interrupted.push(String(childId));
                },
                drainContinuableChildren: async (_parent, childIds) => {
                    drained.push(childIds.map(String));
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => 100
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                objectiveContract: {
                    ...input.objectiveContract,
                    requiredOutputs: [{ key: "done", description: "Done output" }],
                    acceptanceCriteria: [{ key: "done", description: "Done criterion" }]
                },
                agenda: [
                    {
                        ...input.agenda[0]!,
                        completionCriteria: ["output-done", "criterion-done"],
                        requiredParticipantKeys: ["one"]
                    }
                ],
                participants: [input.participants[0]!]
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const meetingId = created.result.meetingId;
        const participant = {
            sessionId: `${meetingId}-participant-participant-one`,
            meetingId,
            participantId: "participant-one",
            kind: "participant" as const
        };
        const submission = {
            protocolVersion: 1 as const,
            meetingId,
            turnId: "turn-1",
            stepId: "step-participant-one-0",
            attemptId: "attempt-0",
            deliveryId: "delivery-0",
            agendaItemId: "agenda-agenda-1",
            kind: "evidence" as const,
            content: "Completion evidence",
            mentions: [],
            taskIds: [],
            agendaRelation: "on_topic" as const,
            changes: {}
        };

        await expect(runtime.submitTurn(submission, captain)).resolves.toMatchObject({
            ok: false,
            code: "UNAUTHORIZED_CALLER"
        });
        await expect(
            runtime.submitTurn(submission, {
                ...participant,
                sessionId: `${meetingId}-participant-other`,
                participantId: "participant-other"
            })
        ).resolves.toMatchObject({ ok: false, code: "STALE_ATTEMPT" });

        await expect(
            runtime.submitTurn(
                {
                    ...submission,
                    completionClaims: {
                        outputClaims: [
                            {
                                subjectId: "output-done",
                                evidenceMessageIds: [],
                                taskIds: ["task-1"]
                            }
                        ]
                    }
                },
                participant
            )
        ).resolves.toMatchObject({ ok: false, code: "INVALID_STATE_TRANSITION" });
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            meetingVersion: 1,
            result: { messages: [] }
        });

        const validSubmission = {
            ...submission,
            completionClaims: {
                outputClaims: [
                    {
                        subjectId: "output-done",
                        evidenceMessageIds: ["message-delivery-0"],
                        taskIds: []
                    }
                ],
                criterionClaims: [
                    {
                        subjectId: "criterion-done",
                        evidenceMessageIds: ["message-delivery-0"],
                        taskIds: []
                    }
                ],
                agendaResolution: {
                    agendaItemId: "agenda-agenda-1",
                    resolution: "Done",
                    evidenceMessageIds: ["message-delivery-0"]
                }
            }
        };
        const committed = await runtime.submitTurn(validSubmission, participant);
        expect(committed).toMatchObject({
            ok: true,
            meetingVersion: 2,
            result: { messageSeq: 1, meetingStatus: "converging" }
        });
        await expect(runtime.submitTurn(validSubmission, participant)).resolves.toEqual(committed);
        const endInput = {
            protocolVersion: 1 as const,
            meetingId,
            expectedMeetingVersion: 2,
            outcome: "completed" as const,
            reason: "Objective contract is satisfied",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: [],
            requestId: "end-1"
        };
        await expect(runtime.endMeeting(endInput, participant)).resolves.toMatchObject({
            ok: false,
            code: "UNAUTHORIZED_CALLER"
        });
        await expect(
            runtime.endMeeting({ ...endInput, expectedMeetingVersion: 1 }, captain)
        ).resolves.toMatchObject({ ok: false, code: "VERSION_CONFLICT", retryable: true });
        const ended = await runtime.endMeeting(endInput, captain);
        expect(ended).toMatchObject({
            ok: true,
            meetingVersion: 3,
            result: { status: "completed", terminationCode: "objective_satisfied" }
        });
        expect(interrupted).toEqual(
            expect.arrayContaining([
                `${meetingId}-manager-manager`,
                `${meetingId}-participant-participant-one`
            ])
        );
        expect(drained).toEqual([
            expect.arrayContaining([
                `${meetingId}-manager-manager`,
                `${meetingId}-participant-participant-one`
            ])
        ]);
        expect(children.map((child) => child.id)).toEqual(
            expect.arrayContaining([
                `${meetingId}-manager-manager`,
                `${meetingId}-participant-participant-one`
            ])
        );
        await expect(runtime.endMeeting(endInput, captain)).resolves.toEqual(ended);
        await expect(
            runtime.endMeeting({ ...endInput, reason: "Different request hash" }, captain)
        ).resolves.toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
        await expect(
            runtime.submitTurn(
                {
                    ...submission,
                    deliveryId: "delivery-after-terminal",
                    content: "late write"
                },
                participant
            )
        ).resolves.toMatchObject({ ok: false, code: "IMMUTABLE_MEETING" });
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            meetingVersion: 5,
            result: {
                status: "archived",
                archive: { package: { meetingId }, archivedAt: 100 }
            }
        });
        await runtime.dispose();
        const restarted = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        await expect(
            restarted.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            result: {
                status: "archived",
                archive: {
                    package: { meetingId, finalSummary: "Objective contract is satisfied" },
                    archivedAt: 100
                }
            }
        });
        await restarted.dispose();
    });

    it("retries a transient dispatch through the configured outbox loop", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-outbox-retry-"));
        roots.push(root);
        let followups = 0;
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            outboxPollMs: 5,
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => {
                    followups += 1;
                    if (followups === 1) {
                        throw new Error("provider unavailable");
                    }
                    return "followup-message" as never;
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };

        await expect(
            runtime.createMeeting(input, captain, new AbortController().signal)
        ).resolves.toMatchObject({ ok: true });
        await vi.waitFor(() => expect(followups).toBe(2));
        await runtime.dispose();
    });

    it("keeps committed Manager commands successful when asynchronous dispatch fails", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-manager-dispatch-"));
        roots.push(root);
        let followups = 0;
        const managerContexts: Record<string, unknown>[] = [];
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async (_parent, _sessionId, prompt) => {
                    followups += 1;
                    const text = prompt[0]?.type === "text" ? prompt[0].text : undefined;
                    if (typeof text === "string" && text.startsWith("{")) {
                        managerContexts.push(JSON.parse(text) as Record<string, unknown>);
                    }
                    throw Object.assign(new Error("provider unavailable"), {
                        retryable: false
                    });
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const managerInput = {
            ...input,
            selectionMode: "manager" as const,
            agenda: [
                {
                    ...input.agenda[0]!,
                    requiredParticipantKeys: ["one"]
                }
            ],
            participants: [input.participants[0]!]
        };
        const created = await runtime.createMeeting(
            managerInput,
            captain,
            new AbortController().signal
        );
        expect(created).toMatchObject({ ok: true, result: { status: "running" } });
        if (!created.ok) throw new Error("create failed");
        await vi.waitFor(() => expect(followups).toBe(1), { timeout: 5000 });
        const meetingId = created.result.meetingId;
        expect(managerContexts[0]).toMatchObject({
            protocolVersion: 1,
            meetingId,
            meetingVersion: 1,
            planningAttemptId: `${meetingId}-planning-1`,
            activeAgendaItem: { id: "agenda-agenda-1" },
            requiredSpeakerIds: ["participant-one"],
            dispatchableParticipantIds: ["participant-one"],
            planningReason: "initial_plan"
        });
        const manager = {
            sessionId: `${meetingId}-manager-manager`,
            meetingId,
            kind: "manager" as const
        };
        const plan = {
            protocolVersion: 1 as const,
            meetingId,
            planningAttemptId: `${meetingId}-planning-1`,
            agendaItemId: "agenda-agenda-1",
            intent: "explore",
            objective: "Resolve scope",
            expectedOutputs: [],
            prohibitedTopics: [],
            steps: [
                {
                    participantId: "participant-one",
                    instruction: "Address scope",
                    reason: "manager_selected"
                }
            ]
        };

        await expect(
            runtime.submitManagerPlan(
                { ...plan, observedMeetingVersion: 0, requestId: "stale-plan" },
                manager
            )
        ).resolves.toMatchObject({
            ok: false,
            code: "STALE_MANAGER_ATTEMPT",
            retryable: false
        });
        await expect(
            runtime.submitManagerPlan(
                {
                    ...plan,
                    planningAttemptId: "wrong-planning-attempt",
                    observedMeetingVersion: 1,
                    requestId: "stale-attempt"
                },
                manager
            )
        ).resolves.toMatchObject({
            ok: false,
            code: "STALE_MANAGER_ATTEMPT",
            retryable: false
        });

        const planned = await runtime.submitManagerPlan(
            { ...plan, observedMeetingVersion: 1, requestId: "plan-1" },
            manager
        );
        expect(planned).toMatchObject({ ok: true });
        if (!planned.ok) throw new Error("plan failed");
        await vi.waitFor(() => expect(followups).toBe(2), { timeout: 5000 });

        await expect(
            runtime.submitTurn(
                {
                    protocolVersion: 1,
                    meetingId,
                    turnId: planned.result.turnId,
                    stepId: planned.result.firstStepId,
                    attemptId: planned.result.firstAttemptId,
                    deliveryId: "turn-1-delivery-0",
                    agendaItemId: "agenda-agenda-1",
                    kind: "statement",
                    content: "Scope response",
                    mentions: [],
                    taskIds: [],
                    agendaRelation: "supporting_context",
                    changes: {}
                },
                {
                    sessionId: `${meetingId}-participant-participant-one`,
                    meetingId,
                    participantId: "participant-one",
                    kind: "participant"
                }
            )
        ).resolves.toMatchObject({
            ok: true,
            result: { messageSeq: 1, turnStatus: "completed", meetingStatus: "running" }
        });
        await vi.waitFor(() => expect(followups).toBe(3));
        await runtime.dispose();
    });

    it("creates through Storage Domain and projects status only for the bound meeting", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-"));
        roots.push(root);
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => 100
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const created = await runtime.createMeeting(input, captain, new AbortController().signal);
        expect(created).toMatchObject({
            ok: true,
            result: { meetingVersion: 1, status: "running" }
        });
        if (!created.ok) throw new Error("create failed");

        const status = await runtime.getStatus(
            { protocolVersion: 1, meetingId: created.result.meetingId },
            { ...captain, meetingId: created.result.meetingId }
        );
        expect(status).toMatchObject({
            ok: true,
            result: { status: "running", meetingVersion: 1 }
        });

        await expect(
            runtime.getStatus(
                { protocolVersion: 1, meetingId: created.result.meetingId },
                { ...captain, sessionId: "other-captain" }
            )
        ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
    });

    it("keeps recovered meetings unbound and does not dispatch from status", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-rebind-"));
        roots.push(root);
        const captainAgent = { id: "captain-1" } as never;
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: captainAgent
        };
        const firstRuntime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                }),
                followup: async () => "initial-followup" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const created = await firstRuntime.createMeeting(
            input,
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        await firstRuntime.dispose();

        const meetingId = created.result.meetingId;
        const unboundRuntime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async () => {
                    throw new Error("recovery must not create Sessions");
                },
                followup: async () => {
                    throw new Error("an unbound recovery must not dispatch");
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        await expect(
            unboundRuntime.submitTurn(
                {
                    protocolVersion: 1,
                    meetingId,
                    turnId: "turn-1",
                    stepId: "step-participant-one-0",
                    attemptId: "turn-1-attempt-0",
                    deliveryId: "turn-1-delivery-0",
                    agendaItemId: "agenda-agenda-1",
                    kind: "statement",
                    content: "must not commit",
                    mentions: [],
                    taskIds: [],
                    agendaRelation: "on_topic",
                    changes: {}
                },
                {
                    sessionId: `${meetingId}-participant-participant-one`,
                    meetingId,
                    participantId: "participant-one",
                    kind: "participant"
                }
            )
        ).resolves.toMatchObject({ ok: false, code: "INTERNAL_ERROR", retryable: true });
        await unboundRuntime.dispose();

        let followups = 0;
        const recoveredRuntime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            outboxPollMs: 5,
            continuable: {
                startContinuable: async () => {
                    throw new Error("recovery must not create Sessions");
                },
                listDescendants: async () => {
                    throw new Error("cold status must not inspect descendants");
                },
                followup: async () => {
                    followups += 1;
                    return "recovered-followup" as never;
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        await expect(
            recoveredRuntime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({ ok: true });
        expect(followups).toBe(0);
        await recoveredRuntime.dispose();
    });

    it("rejects non-Captain creation and mismatched control callers before storage access", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-auth-"));
        roots.push(root);
        let starts = 0;
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    starts += 1;
                    return { childId: spec.childId!, messageId: "initial" as never };
                },
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const participant = { sessionId: "participant-1", kind: "participant" as const };
        await expect(
            runtime.createMeeting(input, participant, new AbortController().signal)
        ).resolves.toMatchObject({
            ok: false,
            code: "UNAUTHORIZED_CALLER"
        });
        await expect(
            runtime.pause(
                {
                    protocolVersion: 1,
                    meetingId: "meeting-1",
                    expectedMeetingVersion: 0,
                    requestId: "pause-1",
                    reason: "stop"
                },
                { sessionId: "captain-1", kind: "captain", meetingId: "other-meeting" }
            )
        ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
        expect(starts).toBe(0);
    });

    it("rejects an empty agenda before repository or Session provisioning", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-empty-agenda-"));
        roots.push(root);
        let starts = 0;
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    starts += 1;
                    return { childId: spec.childId!, messageId: "initial" as never };
                },
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const result = await runtime.createMeeting(
            { ...input, agenda: [] },
            {
                sessionId: "captain-1",
                kind: "captain",
                agent: { id: "captain-1" } as never
            },
            new AbortController().signal
        );

        expect(result).toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
        expect(starts).toBe(0);
        await expect(runtime.listLocalMeetings()).resolves.toMatchObject({
            result: { meetings: [] }
        });
        await runtime.dispose();
    });

    it("replays only the same create request for its original Captain", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-tools-idempotency-"));
        roots.push(root);
        let starts = 0;
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable: {
                startContinuable: async (spec) => {
                    starts += 1;
                    return { childId: spec.childId!, messageId: "initial" as never };
                },
                followup: async () => "followup-message" as never
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const first = await runtime.createMeeting(input, captain, new AbortController().signal);
        if (!first.ok) throw new Error("create failed");
        await runtime.pause(
            {
                protocolVersion: 1,
                meetingId: first.result.meetingId,
                expectedMeetingVersion: first.result.meetingVersion,
                requestId: "pause-before-create-replay",
                reason: "verify persisted receipt"
            },
            captain
        );
        const replay = await runtime.createMeeting(input, captain, new AbortController().signal);
        expect(replay).toEqual(first);
        expect(starts).toBe(4);

        const conflict = await runtime.createMeeting(
            { ...input, topic: "Different" },
            captain,
            new AbortController().signal
        );
        expect(conflict).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
    });

    it("skips incomplete repositories and treats an empty catalog as an empty local list", async () => {
        const missingRoot = join(tmpdir(), `convivium-missing-${Date.now()}-${Math.random()}`);
        const missingRuntime = localRuntime(missingRoot);
        await expect(missingRuntime.listLocalMeetings()).resolves.toEqual({
            protocolVersion: 1,
            ok: true,
            result: { meetings: [] }
        });
        await expect(
            missingRuntime.getLocalMeetingStatus({ protocolVersion: 1, meetingId: "unknown" })
        ).resolves.toMatchObject({ ok: false, code: "MEETING_NOT_FOUND" });
        await missingRuntime.dispose();

        const root = await mkdtemp(join(tmpdir(), "convivium-local-incomplete-"));
        roots.push(root);
        const authorization = {
            callerBinding: "fixture",
            capabilityId: "fixture"
        };
        const registry = await openTestRegistry(root);
        for (const [meetingId, failed] of [
            ["creating-meeting", false],
            ["failed-meeting", true]
        ] as const) {
            const create = {
                requestId: `create-${meetingId}`,
                authorization,
                requestHash: meetingId,
                initialState: {}
            };
            const repository = await openMeetingRepository({
                registry: Promise.resolve(registry),
                teamId: "team-1",
                meetingId,
                create
            });
            if (failed) {
                await repository.updateBootstrap({
                    status: "creation_failed",
                    failureCode: "fixture"
                });
            }
        }
        await registry.close();

        const runtime = localRuntime(root);
        await expect(runtime.listLocalMeetings()).resolves.toMatchObject({
            result: { meetings: [] }
        });
        await runtime.dispose();
    });

    it("includes active, execution-terminal, archiving, and archived repositories", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-local-statuses-"));
        roots.push(root);
        const authorization = { callerBinding: "fixture", capabilityId: "fixture" };
        const statuses = ["running", "completed", "archiving", "archived"] as const;
        const registry = await openTestRegistry(root);
        for (const [index, status] of statuses.entries()) {
            const meetingId = `meeting-${status}`;
            const create = {
                requestId: `create-${status}`,
                authorization,
                requestHash: status,
                initialState: { topic: `${status} topic`, status },
                createdAt: index + 1
            };
            const repository = await openMeetingRepository({
                registry: Promise.resolve(registry),
                teamId: "team-1",
                meetingId,
                create
            });
            await repository.recordSessionOwnership(
                {
                    sessionId: `${meetingId}-manager`,
                    parentSessionId: "captain-1",
                    sessionLabel: `convivium:meeting-manager:team-1:${meetingId}`,
                    provider: "spawn",
                    role: "manager",
                    lifecycleStatus: "provisioning",
                    capabilityStatus: "active"
                },
                index + 1
            );
            await repository.completeCreate({
                requestId: `create-${status}`,
                authorization,
                requestHash: status,
                initialState: { topic: `${status} topic`, status },
                createResult: { meetingId, meetingVersion: 0, status: "created", participants: [] },
                createdAt: index + 1
            });
        }
        await registry.close();

        const runtime = localRuntime(root);
        const listed = await runtime.listLocalMeetings();
        expect(new Set(listed.result.meetings.map(({ status }) => status))).toEqual(
            new Set(statuses)
        );
        await runtime.dispose();
    });

    it("lists exact local summaries and controls a live Meeting with replay protection", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-local-control-"));
        roots.push(root);
        let clock = 100;
        const runtime = localRuntime(root, { now: () => clock++ });
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const first = await runtime.createMeeting(input, captain, new AbortController().signal);
        const second = await runtime.createMeeting(
            { ...input, requestId: "create-2", topic: "Second meeting" },
            captain,
            new AbortController().signal
        );
        if (!first.ok || !second.ok) throw new Error("fixture create failed");

        const listed = await runtime.listLocalMeetings();
        expect(listed.result.meetings).toHaveLength(2);
        expect(listed.result.meetings[0]?.meetingId).toBe(second.result.meetingId);
        expect(Object.keys(listed.result.meetings[0]!).sort()).toEqual(
            ["meetingId", "teamId", "topic", "status", "meetingVersion", "updatedAt"].sort()
        );

        const pauseInput = {
            protocolVersion: 1 as const,
            meetingId: first.result.meetingId,
            expectedMeetingVersion: first.meetingVersion,
            requestId: "local-pause-1",
            reason: "local control"
        };
        const paused = await runtime.pauseLocalMeeting(pauseInput);
        expect(paused).toMatchObject({ ok: true, result: { status: "paused", changed: true } });
        await expect(runtime.pauseLocalMeeting(pauseInput)).resolves.toEqual(paused);
        await expect(
            runtime.pauseLocalMeeting({ ...pauseInput, reason: "conflicting replay" })
        ).resolves.toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
        await expect(
            runtime.pauseLocalMeeting({
                ...pauseInput,
                requestId: "local-pause-stale"
            })
        ).resolves.toMatchObject({ ok: false, code: "VERSION_CONFLICT" });

        const status = await runtime.getLocalMeetingStatus({
            protocolVersion: 1,
            meetingId: first.result.meetingId
        });
        expect(status).toMatchObject({
            ok: true,
            result: {
                status: "paused",
                pauseControl: {
                    pausedBy: { kind: "local_host", actorId: "loopback-web" }
                }
            }
        });
        if (!status.ok) throw new Error("local status failed");
        const resumeInput = {
            protocolVersion: 1,
            meetingId: first.result.meetingId,
            expectedMeetingVersion: status.meetingVersion,
            requestId: "local-resume-1"
        } as const;
        const resumed = await runtime.resumeLocalMeeting(resumeInput);
        expect(resumed).toMatchObject({ ok: true, result: { status: "running" } });
        if (!resumed.ok) throw new Error("local resume failed");

        const pausedAgain = await runtime.pauseLocalMeeting({
            ...pauseInput,
            expectedMeetingVersion: resumed.meetingVersion,
            requestId: "local-pause-2"
        });
        expect(pausedAgain).toMatchObject({ ok: true, result: { status: "paused" } });
        if (!pausedAgain.ok) throw new Error("second local pause failed");
        await expect(
            runtime.resumeLocalMeeting({
                protocolVersion: 1,
                meetingId: first.result.meetingId,
                expectedMeetingVersion: pausedAgain.meetingVersion,
                requestId: "local-resume-2"
            })
        ).resolves.toMatchObject({ ok: true, result: { status: "running" } });
        await runtime.dispose();

        const coldReplay = localRuntime(root);
        await expect(coldReplay.resumeLocalMeeting(resumeInput)).resolves.toEqual(resumed);
        await coldReplay.dispose();
    });

    it("runs rule-based and non-arbitrated hybrid creation without Manager planning", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-selection-modes-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };

        for (const selectionMode of ["rule_based", "hybrid"] as const) {
            const created = await runtime.createMeeting(
                {
                    ...input,
                    requestId: `create-${selectionMode}`,
                    selectionMode
                },
                captain,
                new AbortController().signal
            );
            expect(created).toMatchObject({ ok: true, result: { status: "running" } });
            if (!created.ok) throw new Error("create failed");
            await expect(
                runtime.getStatus(
                    { protocolVersion: 1, meetingId: created.result.meetingId },
                    captain
                )
            ).resolves.toMatchObject({
                ok: true,
                result: {
                    status: "running",
                    currentTurn: { reason: "explore" }
                }
            });
        }
        await runtime.dispose();
    });

    it("creates one replay-stable waiting state when required speakers exceed the turn limit", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-required-overflow-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const createInput = {
            ...input,
            requestId: "create-required-overflow",
            selectionMode: "rule_based" as const,
            limits: { maxSpeakersPerTurn: 1 }
        };
        const created = await runtime.createMeeting(
            createInput,
            captain,
            new AbortController().signal
        );
        expect(created).toMatchObject({ ok: true, result: { status: "waiting" } });
        if (!created.ok) throw new Error("create failed");
        const replay = await runtime.createMeeting(
            createInput,
            captain,
            new AbortController().signal
        );
        expect(replay).toEqual(created);
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId: created.result.meetingId }, captain)
        ).resolves.toMatchObject({
            ok: true,
            result: {
                status: "waiting",
                waitState: {
                    reason: "required_participant_unavailable",
                    taskIds: [],
                    participantIds: ["participant-three", "participant-two"]
                }
            }
        });
        await expect(
            runtime.resumeLocalMeeting({
                protocolVersion: 1,
                meetingId: created.result.meetingId,
                expectedMeetingVersion: created.meetingVersion,
                requestId: "resume-required-overflow"
            })
        ).resolves.toMatchObject({ ok: false, code: "REQUIRED_SPEAKER_UNAVAILABLE" });
        await runtime.dispose();
    });

    it("isolates selected Meeting recovery from an unrelated corrupt ready repository", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-local-isolation-"));
        roots.push(root);
        const creator = localRuntime(root);
        const captain = {
            sessionId: "captain-1",
            kind: "captain" as const,
            agent: { id: "captain-1" } as never
        };
        const healthy = await creator.createMeeting(input, captain, new AbortController().signal);
        const corrupt = await creator.createMeeting(
            { ...input, requestId: "create-corrupt", topic: "Corrupt target" },
            captain,
            new AbortController().signal
        );
        if (!healthy.ok || !corrupt.ok) throw new Error("fixture create failed");
        await creator.dispose();

        const corruptDomain = await storagePort(root).open(
            createMeetingDomainSpec(meetingDomainName(input.teamId, corrupt.result.meetingId))
        );
        await corruptDomain.table("commits").delete(seqKey(1));
        await corruptDomain.close();

        const runtime = localRuntime(root);
        await expect(runtime.listLocalMeetings()).rejects.toBeInstanceOf(
            LocalMeetingRecoveryUnavailableError
        );
        await expect(
            runtime.getLocalMeetingStatus({
                protocolVersion: 1,
                meetingId: healthy.result.meetingId
            })
        ).resolves.toMatchObject({ ok: true, result: { status: "running" } });
        await expect(
            runtime.getLocalMeetingStatus({
                protocolVersion: 1,
                meetingId: corrupt.result.meetingId
            })
        ).rejects.toBeInstanceOf(LocalMeetingRecoveryUnavailableError);
        await runtime.dispose();

        const unexpected = localRuntime(root, {
            validateCommand: () => {
                throw new RepositoryError(
                    "CONSTRAINT_VIOLATION",
                    false,
                    healthy.result.meetingId,
                    "unexpected repository failure"
                );
            }
        });
        await expect(
            unexpected.pauseLocalMeeting({
                protocolVersion: 1,
                meetingId: healthy.result.meetingId,
                expectedMeetingVersion: healthy.meetingVersion,
                requestId: "unexpected-pause",
                reason: "verify error classification"
            })
        ).rejects.toMatchObject({
            code: "CONSTRAINT_VIOLATION",
            message: "unexpected repository failure"
        });
        await unexpected.dispose();

        const cold = localRuntime(root);
        const paused = await cold.pauseLocalMeeting({
            protocolVersion: 1,
            meetingId: healthy.result.meetingId,
            expectedMeetingVersion: healthy.meetingVersion,
            requestId: "cold-pause",
            reason: "verify cold control"
        });
        expect(paused).toMatchObject({ ok: true });
        if (!paused.ok) throw new Error("cold pause failed");
        await expect(
            cold.resumeLocalMeeting({
                protocolVersion: 1,
                meetingId: healthy.result.meetingId,
                expectedMeetingVersion: paused.meetingVersion,
                requestId: "cold-resume"
            })
        ).rejects.toBeInstanceOf(LocalMeetingRecoveryUnavailableError);
        await cold.dispose();
    });
});
