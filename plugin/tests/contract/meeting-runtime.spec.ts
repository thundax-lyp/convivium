import {
    CaptainAttendanceDispositionInputSchema,
    CaptainAttendanceDispositionResultSchema
} from "../../src/protocol/index.js";
import { roleCompositionDefinitions } from "../fixtures/role-composition.js";
import { MeetingArchivePackageSchema } from "../../src/protocol/status.js";

import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WebRoute } from "@deepseek-ai/dsh-host-webserver";
import { registerLocalMeetingHttpRoutes } from "../../src/http/index.js";
import {
    CaptainDecisionAcceptanceInputSchema,
    CaptainDecisionDispositionInputSchema,
    CaptainRiskDispositionInputSchema,
    MeetingStatusResultSchema
} from "../../src/protocol/index.js";
import { createLocalDecisionRiskState } from "../fixtures/local-decision-risk.js";
import {
    createFakeCatalogDomain,
    createFakeMeetingDomain,
    type FakeMeetingDomain
} from "../fixtures/domain-storage.js";
import { loadProjection } from "../../src/repository/domain/projection.js";
import { catalogDomainSpec } from "../../src/repository/domain/specs.js";
import type { MeetingState } from "../../src/domain/model.js";
import type { JsonObject } from "../../src/repository/types.js";
import { now as localNow } from "../unit/domain/transitions/fixtures.js";
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
import type { AgentCatalogPort } from "../../src/runtime/services/agent-catalog.js";

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
        agentCatalog?: AgentCatalogPort;
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
        now: options.now,
        agentCatalog: options.agentCatalog
    });
}

afterEach(async () => {
    await Promise.all(storageContexts.map(async (context) => (await context).fiber.dispose()));
    storageContexts.length = 0;
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agenda candidate disposition runtime", () => {
    async function setup() {
        const root = await mkdtemp(join(tmpdir(), "convivium-agenda-candidate-dispose-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-disposition",
            kind: "captain" as const,
            agent: { id: "captain-disposition" } as never
        };
        const created = await runtime.createMeeting(
            {
                ...input,
                requestId: `create-${root}`,
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
                content: "Follow-up",
                mentions: [],
                taskIds: [],
                agendaRelation: "new_topic_candidate",
                changes: {
                    agendaCandidates: [
                        {
                            title: "Follow-up",
                            reason: "Separate discussion",
                            relationToActiveAgenda: "adjacent",
                            urgency: "later",
                            suggestedParticipants: ["participant-one"]
                        }
                    ]
                }
            },
            participant
        );
        if (!submitted.ok) throw new Error("candidate submission failed");
        return { runtime, captain, meetingId, candidateId: "delivery-0-agenda-candidate-1" };
    }

    it("promotes a pending candidate atomically", async () => {
        const { runtime, captain, meetingId, candidateId } = await setup();
        const command = {
            protocolVersion: 1 as const,
            meetingId,
            expectedMeetingVersion: 2,
            requestId: "dispose-promote-1",
            candidateId,
            action: "promote" as const,
            agendaItem: {
                objective: "Decide follow-up",
                inScope: [],
                outOfScope: [],
                completionCriteria: [],
                requiredParticipants: []
            }
        };
        await expect(
            runtime.disposeAgendaCandidate(command, captain, new AbortController().signal)
        ).resolves.toMatchObject({
            ok: true,
            meetingVersion: 3,
            result: {
                candidateId,
                action: "promote",
                agendaItemId: `${candidateId}-agenda-item`
            }
        });
        await runtime.dispose();
    });

    it("parks and rejects only pending candidates", async () => {
        for (const action of ["park", "reject"] as const) {
            const { runtime, captain, meetingId, candidateId } = await setup();
            await expect(
                runtime.disposeAgendaCandidate(
                    {
                        protocolVersion: 1,
                        meetingId,
                        expectedMeetingVersion: 2,
                        requestId: `dispose-${action}`,
                        candidateId,
                        action
                    },
                    captain,
                    new AbortController().signal
                )
            ).resolves.toMatchObject({
                ok: true,
                meetingVersion: 3,
                result: { candidateId, action }
            });
            await runtime.dispose();
        }
    });

    it("replays the same request and rejects a hash conflict", async () => {
        const { runtime, captain, meetingId, candidateId } = await setup();
        const command = {
            protocolVersion: 1 as const,
            meetingId,
            expectedMeetingVersion: 2,
            requestId: "dispose-replay-1",
            candidateId,
            action: "park" as const
        };
        const first = await runtime.disposeAgendaCandidate(
            command,
            captain,
            new AbortController().signal
        );
        await expect(
            runtime.disposeAgendaCandidate(command, captain, new AbortController().signal)
        ).resolves.toEqual(first);
        await expect(
            runtime.disposeAgendaCandidate(
                { ...command, action: "reject" },
                captain,
                new AbortController().signal
            )
        ).resolves.toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
        await runtime.dispose();
    });

    it("rejects unauthorized and unknown candidates without a commit", async () => {
        const { runtime, captain, meetingId } = await setup();
        const participant = {
            sessionId: `${meetingId}-participant-participant-one`,
            meetingId,
            participantId: "participant-one",
            kind: "participant" as const
        };
        await expect(
            runtime.disposeAgendaCandidate(
                {
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: 2,
                    requestId: "dispose-unauthorized",
                    candidateId: "delivery-0-agenda-candidate-1",
                    action: "park"
                },
                participant,
                new AbortController().signal
            )
        ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
        await expect(
            runtime.disposeAgendaCandidate(
                {
                    protocolVersion: 1,
                    meetingId,
                    expectedMeetingVersion: 2,
                    requestId: "dispose-missing",
                    candidateId: "missing",
                    action: "park"
                },
                captain,
                new AbortController().signal
            )
        ).resolves.toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
        await expect(
            runtime.getStatus({ protocolVersion: 1, meetingId }, captain)
        ).resolves.toMatchObject({ meetingVersion: 2 });
        await runtime.dispose();
    });
});

describe("create/status meeting runtime", () => {
    it("captures Catalog exactly once for an initial Manager attempt and not for rule planning", async () => {
        const snapshot = {
            protocolVersion: 1 as const,
            catalogId: "catalog-1",
            catalogVersion: "2026-09-04",
            teamId: input.teamId,
            capturedAt: 100,
            roles: [
                {
                    roleDefinitionId: "generalist" as const,
                    version: "1",
                    displayName: "Generalist",
                    summary: "General meeting support",
                    expertiseTags: [],
                    evidenceScopes: [],
                    responsibilities: ["Review"],
                    nonResponsibilities: []
                }
            ],
            candidates: []
        };
        const readSnapshot = vi.fn(async () => ({ ok: true as const, snapshot }));
        const managerCatalog: AgentCatalogPort = { readSnapshot };
        const managerRoot = await mkdtemp(join(tmpdir(), "convivium-catalog-initial-"));
        roots.push(managerRoot);
        const managerRuntime = localRuntime(managerRoot, { agentCatalog: managerCatalog });
        const captain = {
            sessionId: "captain-catalog",
            kind: "captain" as const,
            agent: { id: "captain-catalog" } as never
        };
        const managerMeeting = await managerRuntime.createMeeting(
            {
                ...input,
                selectionMode: "manager",
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
                participants: [input.participants[0]!]
            },
            captain,
            new AbortController().signal
        );
        expect(managerMeeting).toMatchObject({ ok: true });
        expect(readSnapshot).toHaveBeenCalledTimes(1);
        expect(readSnapshot).toHaveBeenCalledWith({
            teamId: input.teamId,
            meetingId: expect.any(String),
            captainSessionId: captain.sessionId
        });
        await managerRuntime.dispose();

        const ruleRoot = await mkdtemp(join(tmpdir(), "convivium-catalog-rule-"));
        roots.push(ruleRoot);
        const ruleReadSnapshot = vi.fn(async () => ({ ok: true as const, snapshot }));
        const ruleRuntime = localRuntime(ruleRoot, {
            agentCatalog: { readSnapshot: ruleReadSnapshot }
        });
        const ruleMeeting = await ruleRuntime.createMeeting(
            {
                ...input,
                requestId: "create-rule-catalog",
                selectionMode: "rule_based",
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
                participants: [input.participants[0]!]
            },
            captain,
            new AbortController().signal
        );
        expect(ruleMeeting).toMatchObject({ ok: true });
        expect(ruleReadSnapshot).not.toHaveBeenCalled();
        await ruleRuntime.dispose();
    });

    it("accepts a recommendation only from the attempt-bound Catalog snapshot", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-catalog-claim-"));
        roots.push(root);
        const readSnapshot = vi.fn(async () => ({
            ok: true as const,
            snapshot: {
                protocolVersion: 1 as const,
                catalogId: "catalog-claim",
                catalogVersion: "v1",
                teamId: input.teamId,
                capturedAt: 100,
                roles: [
                    {
                        roleDefinitionId: "domain_architect" as const,
                        version: "1",
                        displayName: "Domain Architect",
                        summary: "Architecture review",
                        expertiseTags: ["architecture"],
                        evidenceScopes: [],
                        responsibilities: ["Review"],
                        nonResponsibilities: []
                    }
                ],
                candidates: [
                    {
                        candidateId: "candidate-claim",
                        roleDefinitionId: "domain_architect" as const,
                        roleDefinitionVersion: "1",
                        sourceMemberName: "private-member",
                        agentDefinitionId: "private-definition",
                        availability: "available" as const
                    }
                ]
            }
        }));
        const captain = {
            sessionId: "captain-claim",
            kind: "captain" as const,
            agent: { id: "captain-claim" } as never
        };
        const runtime = localRuntime(root, {
            agentCatalog: { readSnapshot }
        });
        const created = await runtime.createMeeting(
            {
                ...input,
                requestId: "create-catalog-claim",
                selectionMode: "manager",
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
                participants: [input.participants[0]!]
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const manager = {
            sessionId: `${created.result.meetingId}-manager-manager`,
            meetingId: created.result.meetingId,
            kind: "manager" as const
        };
        const plan = {
            protocolVersion: 1 as const,
            meetingId: created.result.meetingId,
            requestId: "catalog-claim-plan",
            planningAttemptId: `${created.result.meetingId}-planning-1`,
            observedMeetingVersion: created.meetingVersion,
            agendaItemId: "agenda-agenda-1",
            intent: "explore",
            objective: "Review scope",
            expectedOutputs: [],
            prohibitedTopics: [],
            attendanceRecommendations: [
                {
                    candidateId: "candidate-claim",
                    agendaItemId: "agenda-agenda-1",
                    rationale: "Architecture coverage is needed.",
                    expectedContribution: "Review the scope.",
                    evidenceGapIds: [],
                    urgency: "current_agenda" as const
                }
            ],
            steps: [
                {
                    participantId: "participant-one",
                    instruction: "Review the scope",
                    reason: "manager_selected"
                }
            ]
        };
        const committed = await runtime.submitManagerPlan(plan, manager);
        expect(committed).toMatchObject({
            ok: true,
            result: { status: "planned", fallbackApplied: false }
        });
        expect(readSnapshot).toHaveBeenCalledTimes(1);
        await expect(runtime.submitManagerPlan(plan, manager)).resolves.toEqual(committed);
        await runtime.dispose();
    });

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
                            safeDefaultAvailable: true,
                            riskLevel: "low"
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
            const startInput = {
                protocolVersion: 1,
                meetingId,
                meetingTaskId: task.result.meetingTaskId,
                requestId: "failed-start",
                executionId
            } as never;
            const started = await runtime.startMeetingTask(startInput, participant);
            expect(started).toMatchObject({ ok: true });
            if (!started.ok) throw new Error("task start failed");
            await expect(runtime.startMeetingTask(startInput, participant)).resolves.toEqual(
                started
            );
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
        let releaseManagerDelivery: (() => void) | undefined;
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
                    if (followups === 1) {
                        await new Promise<void>((resolve) => {
                            releaseManagerDelivery = resolve;
                        });
                        return "manager-delivered" as never;
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
        releaseManagerDelivery?.();
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

describe("referenced minutes runtime", () => {
    it("authorizes, commits, replays and recovers a draft without an extra message", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-minutes-"));
        roots.push(root);
        let revoked = false;
        const runtime = localRuntime(root, {
            validateCommand: () => {
                if (revoked)
                    throw new RepositoryError("UNAUTHORIZED_CALLER", false, "meeting-1", "revoked");
            }
        });
        const captain = {
            sessionId: "captain-minutes",
            kind: "captain" as const,
            agent: { id: "captain-minutes" } as never
        };
        let meetingId = "";
        let expected: unknown;
        try {
            const created = await runtime.createMeeting(
                input,
                captain,
                new AbortController().signal
            );
            if (!created.ok) throw new Error("create failed");
            meetingId = created.result.meetingId;
            const caller = (key: string) => ({
                sessionId: `${meetingId}-participant-participant-${key}`,
                meetingId,
                participantId: `participant-${key}`,
                kind: "participant" as const
            });
            const source = {
                protocolVersion: 1 as const,
                meetingId,
                turnId: "turn-1",
                stepId: "step-participant-one-0",
                attemptId: "attempt-0",
                deliveryId: "delivery-0",
                agendaItemId: "agenda-agenda-1",
                kind: "statement" as const,
                content: "source-a",
                mentions: [],
                taskIds: [],
                agendaRelation: "on_topic" as const,
                changes: {}
            };
            expect(await runtime.submitTurn(source, caller("one"))).toMatchObject({ ok: true });
            const draft = {
                ...source,
                stepId: "step-participant-two-1",
                attemptId: "turn-1-attempt-1",
                deliveryId: "turn-1-delivery-1",
                kind: "summary" as const,
                content: "Minutes based on source-a",
                minutesDraft: {
                    coverage: { fromSeq: 1, throughSeq: 1 },
                    referencedMessageIds: ["message-delivery-0"]
                }
            };
            const before = await runtime.getStatus({ protocolVersion: 1, meetingId }, captain);
            for (const denied of [
                captain,
                { ...caller("two"), kind: "manager" as const },
                caller("one"),
                { ...caller("two"), meetingId: "other" }
            ])
                expect(await runtime.submitTurn(draft, denied)).toMatchObject({ ok: false });
            expect(
                await runtime.submitTurn(
                    {
                        ...draft,
                        minutesDraft: { ...draft.minutesDraft, referencedMessageIds: ["missing"] }
                    },
                    caller("two")
                )
            ).toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
            expect(await runtime.getStatus({ protocolVersion: 1, meetingId }, captain)).toEqual(
                before
            );
            const committed = await runtime.submitTurn(draft, caller("two"));
            expect(committed).toMatchObject({
                ok: true,
                result: { messageId: "message-turn-1-delivery-1", messageSeq: 2 }
            });
            expect(await runtime.submitTurn(draft, caller("two"))).toEqual(committed);
            for (const changed of [
                { ...draft, content: "changed" },
                {
                    ...draft,
                    minutesDraft: { ...draft.minutesDraft, coverage: { fromSeq: 1, throughSeq: 2 } }
                },
                {
                    ...draft,
                    minutesDraft: { ...draft.minutesDraft, referencedMessageIds: ["other"] }
                }
            ])
                expect(await runtime.submitTurn(changed, caller("two"))).toMatchObject({
                    ok: false,
                    code: "IDEMPOTENCY_CONFLICT"
                });
            expect(
                await runtime.submitTurn(
                    {
                        ...source,
                        stepId: "step-participant-three-2",
                        attemptId: "turn-1-attempt-2",
                        deliveryId: "turn-1-delivery-2"
                    },
                    caller("three")
                )
            ).toMatchObject({ ok: true });
            expect(await runtime.submitTurn(draft, caller("two"))).toEqual(committed);
            revoked = true;
            expect(await runtime.submitTurn(draft, caller("two"))).toMatchObject({ ok: false });
            revoked = false;
            const status = await runtime.getStatus({ protocolVersion: 1, meetingId }, captain);
            expect(status).toMatchObject({
                ok: true,
                result: {
                    messages: expect.arrayContaining([
                        expect.objectContaining({
                            id: "message-turn-1-delivery-1",
                            content: draft.content
                        })
                    ])
                }
            });
            expected = status;
        } finally {
            await runtime.dispose();
        }
        const registry = await openTestRegistry(root);
        try {
            const recovered = await registry.openMeeting({ teamId: "team-1", meetingId });
            const state = (await recovered.read()).state;
            expect(state.transcript[1]).toMatchObject({
                content: "Minutes based on source-a",
                minutesDraft: {
                    status: "draft",
                    coverage: { fromSeq: 1, throughSeq: 1 },
                    referencedMessageIds: ["message-delivery-0"]
                }
            });
        } finally {
            await registry.close();
        }
        const reopened = localRuntime(root);
        try {
            expect(await reopened.getStatus({ protocolVersion: 1, meetingId }, captain)).toEqual(
                expected
            );
        } finally {
            await reopened.dispose();
        }
    });
});

describe("FR14 creation and replay contract", () => {
    const selected = {
        ...input,
        managerAgentDefinitionId: "fr14-manager",
        participants: [
            { participantKey: "a", displayName: "A", agentDefinitionId: "fr14-participant" },
            { participantKey: "b", displayName: "B" },
            { participantKey: "c", displayName: "C" }
        ],
        agenda: [{ ...input.agenda[0], requiredParticipantKeys: ["a", "b", "c"] }]
    };
    async function fixture(failure?: "child" | "abort") {
        const root = await mkdtemp(join(tmpdir(), "convivium-fr14-contract-"));
        roots.push(root);
        const definitions = structuredClone([...roleCompositionDefinitions]);
        const starts = [];
        const interrupted = [];
        const drained = [];
        const controller = new AbortController();
        const skill = {
            name: "fr14-fixture",
            content: "FR14 fixture",
            invocation: { modelInvocable: true }
        };
        const get = vi.fn(async () => skill);
        const captain = {
            kind: "captain" as const,
            sessionId: "fr14-captain",
            agent: {
                id: "fr14-captain",
                session: { header: { cwd: root } },
                ctx: {
                    get: (key) =>
                        key === "agentPresets" ? { composedPreset: () => "minimal" } : { get }
                }
            }
        };
        const runtime = createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            agentDefinitions: definitions,
            now: () => 100,
            continuable: {
                startContinuable: async (spec) => {
                    starts.push(spec);
                    if (failure && starts.length === 2) {
                        if (failure === "abort") controller.abort(new Error("cancelled"));
                        throw new Error(failure);
                    }
                    return { childId: spec.childId, messageId: `initial-${spec.childId}` };
                },
                followup: async () => "followup",
                listChildren: async () =>
                    starts.map((s) => ({
                        kind: "child",
                        id: s.childId,
                        activity: "inactive",
                        hasChildren: false,
                        mode: "continuable",
                        label: s.label
                    })),
                listDescendants: async () => [],
                interrupt: (id) => {
                    interrupted.push(id);
                },
                drainContinuableChildren: async (_parent, ids) => {
                    drained.push(ids);
                }
            },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
        return {
            root,
            runtime,
            definitions,
            starts,
            interrupted,
            drained,
            controller,
            captain,
            get,
            skill
        };
    }
    it("keeps ready and archived replay independent of current definitions and skills", async () => {
        const f = await fixture();
        try {
            const created = await f.runtime.createMeeting(selected, f.captain, f.controller.signal);
            if (!created.ok) throw new Error(JSON.stringify(created));
            const meetingId = created.result.meetingId;
            expect(f.get).toHaveBeenCalledTimes(1);
            expect(f.starts[0].request.persona).toBe("FR14_MANAGER_V1");
            expect(f.starts[1].request.persona).toBe("FR14_PARTICIPANT_V1");
            f.definitions[0].persona = "FR14_MANAGER_V2";
            f.definitions[0].definitionVersion = "2.0.0";
            f.get.mockResolvedValue(undefined);
            expect(await f.runtime.createMeeting(selected, f.captain, f.controller.signal)).toEqual(
                created
            );
            expect(f.get).toHaveBeenCalledTimes(1);
            expect(
                await f.runtime.createMeeting(
                    { ...selected, managerAgentDefinitionId: "other" },
                    f.captain,
                    f.controller.signal
                )
            ).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
            const status = await f.runtime.getStatus({ protocolVersion: 1, meetingId }, f.captain);
            if (!status.ok) throw new Error("status unavailable");
            expect(MeetingStatusResultSchema(status.result)).toEqual(status.result);
            expect(JSON.stringify(status)).not.toMatch(
                /FR14_MANAGER|FR14_PARTICIPANT|requiredSkillNames|toolFilter|agentDefinition/
            );
            const ended = await f.runtime.endLocalMeeting({
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: status.meetingVersion,
                requestId: "fr14-end",
                outcome: "cancelled",
                reason: "Fixture completed",
                acceptedDecisionIds: [],
                deferredAgendaItemIds: [],
                waivers: []
            });
            expect(ended).toMatchObject({ ok: true });
            const archived = await f.runtime.getStatus(
                { protocolVersion: 1, meetingId },
                f.captain
            );
            expect(archived).toMatchObject({ ok: true, result: { status: "archived" } });
            expect(JSON.stringify(archived)).not.toMatch(
                /FR14_MANAGER|FR14_PARTICIPANT|requiredSkillNames|toolFilter|agentDefinition/
            );
            if (!archived.ok || archived.result.status !== "archived")
                throw new Error("archive unavailable");
            const archivePackage = archived.result.archive.package;
            for (const privateFields of [
                { persona: "PRIVATE_ROLE_PERSONA" },
                { toolFilter: { deny: ["convivium_role_probe"] } },
                { requiredSkillNames: ["fr14-fixture"], skillContent: "PRIVATE_SKILL_BODY" }
            ]) {
                expect(() =>
                    MeetingStatusResultSchema({ ...status.result, ...privateFields })
                ).toThrow();
                expect(() =>
                    MeetingArchivePackageSchema({ ...archivePackage, ...privateFields })
                ).toThrow();
            }

            expect(await f.runtime.createMeeting(selected, f.captain, f.controller.signal)).toEqual(
                created
            );
            expect(await f.runtime.getStatus({ protocolVersion: 1, meetingId }, f.captain)).toEqual(
                archived
            );
            expect(f.get).toHaveBeenCalledTimes(1);
            expect(f.starts).toHaveLength(4);
            f.get.mockResolvedValue(f.skill);
            const fresh = await f.runtime.createMeeting(
                { ...selected, requestId: "fresh-config" },
                f.captain,
                f.controller.signal
            );
            expect(fresh).toMatchObject({ ok: true });
            expect(f.starts[4].request.persona).toBe("FR14_MANAGER_V2");
            await f.runtime.dispose();
            const registry = await openTestRegistry(f.root);
            try {
                const repository = await registry.openMeeting({ teamId: "team-1", meetingId });
                const old = await repository.recover();
                expect(
                    old.sessionOwnership.find((o) => o.role === "manager")?.agentDefinition
                ).toMatchObject({
                    agentDefinitionId: "fr14-manager",
                    definitionVersion: "1.0.0",
                    definitionHash: expect.stringMatching(/^[a-f0-9]{64}$/)
                });
                expect(
                    old.sessionOwnership.find((o) => o.participantId === "participant-a")
                        ?.agentDefinition?.definitionVersion
                ).toBe("1.0.0");
                expect(old.sessionOwnership.every((o) => o.capabilityStatus === "revoked")).toBe(
                    true
                );
            } finally {
                await registry.close();
            }
        } finally {
            await f.runtime.dispose();
        }
    });
    it("fails closed before child creation for invalid role selection or missing skills", async () => {
        const f = await fixture();
        try {
            const bad = {
                ...selected,
                participants: selected.participants.map((p, i) =>
                    i === 2 ? { ...p, agentDefinitionId: "fr14-manager" } : p
                )
            };
            expect(
                await f.runtime.createMeeting(bad, f.captain, f.controller.signal)
            ).toMatchObject({
                ok: false,
                code: "UNSUPPORTED_CAPABILITY",
                retryable: false,
                message: "Meeting role composition is unavailable."
            });
            expect(f.starts).toEqual([]);
            expect(f.get).not.toHaveBeenCalled();
            f.get.mockResolvedValue(undefined);
            expect(
                await f.runtime.createMeeting(
                    { ...selected, requestId: "missing-skill" },
                    f.captain,
                    f.controller.signal
                )
            ).toMatchObject({ ok: false, code: "UNSUPPORTED_CAPABILITY" });
            expect(f.starts).toEqual([]);
            expect(await f.runtime.listLocalMeetings()).toMatchObject({ result: { meetings: [] } });
        } finally {
            await f.runtime.dispose();
        }
    });
    it.each(["child", "abort"] as const)(
        "revokes allocated identities after %s failure without publishing a meeting",
        async (failure) => {
            const f = await fixture(failure);
            try {
                expect(
                    await f.runtime.createMeeting(selected, f.captain, f.controller.signal)
                ).toMatchObject({ ok: false });
                expect(f.starts).toHaveLength(2);
                expect(f.interrupted).toHaveLength(2);
                expect(f.drained).toHaveLength(1);
                expect(await f.runtime.listLocalMeetings()).toMatchObject({
                    result: { meetings: [] }
                });
            } finally {
                await f.runtime.dispose();
            }
        }
    );
});

describe("local decision and risk runtime", () => {
    async function setupLocalControlRuntime(
        state: MeetingState = createLocalDecisionRiskState()
    ): Promise<{
        runtime: ReturnType<typeof createCreateStatusRuntime>;
        registry: DomainRepositoryRegistry;
        meeting: FakeMeetingDomain;
        facility: DomainFacilityPort;
    }> {
        const catalog = createFakeCatalogDomain();
        const meeting = createFakeMeetingDomain(meetingDomainName("team-1", "meeting-1"));
        const facility: DomainFacilityPort = {
            async open<S extends DomainSpec>(spec: S): Promise<Domain<S>> {
                if (spec.name === catalogDomainSpec.name) return catalog as unknown as Domain<S>;
                if (spec.name === meetingDomainName("team-1", "meeting-1"))
                    return meeting as unknown as Domain<S>;
                throw new Error(`Unexpected domain ${spec.name}`);
            }
        };
        const authorizationValidator = {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        };
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator
        });
        const create = {
            requestId: "create-local",
            requestHash: "create-local",
            authorization: {
                callerBinding: "session:captain-1",
                capabilityId: "captain:captain-1"
            },
            initialState: JSON.parse(JSON.stringify({ ...state, meetingTasks: [] })) as JsonObject,
            createdAt: localNow
        };
        const repository = await registry.openMeeting({
            teamId: "team-1",
            meetingId: "meeting-1",
            create
        });
        await repository.recordSessionOwnership(
            {
                sessionId: "manager-1",
                initialMessageId: "manager-initial-1",
                parentSessionId: "captain-1",
                sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
                provider: "spawn",
                role: "manager",
                lifecycleStatus: "active",
                capabilityStatus: "active"
            },
            localNow
        );
        await repository.completeCreate(create);
        const runtime = createCreateStatusRuntime({
            storageDomain: facility,
            provider: "spawn",
            authorizationValidator,
            now: () => localNow,
            continuable: {
                startContinuable: vi.fn(async () => {
                    throw new Error("Unexpected Session start");
                }),
                followup: vi.fn(async () => {
                    throw new Error("Unexpected Session followup");
                }),
                listDescendants: vi.fn(async () => [])
            }
        });
        return { runtime, registry, meeting, facility };
    }
    const common = {
        protocolVersion: 1 as const,
        meetingId: "meeting-1",
        reason: "Reviewed evidence",
        evidenceMessageIds: ["message-1"]
    };
    const captain = {
        kind: "captain" as const,
        sessionId: "captain-1",
        agent: { id: "captain-1" } as never
    };
    function commands(
        runtime: ReturnType<typeof createCreateStatusRuntime>,
        source: "local" | "captain" = "local"
    ) {
        return [
            (version: number, patch = {}) => {
                const value = {
                    ...common,
                    requestId: "local-accept",
                    expectedMeetingVersion: version,
                    decisionCandidateId: "candidate-1",
                    ...patch
                };
                return source === "local"
                    ? runtime.acceptLocalDecision(value)
                    : runtime.acceptDecision(value, captain);
            },
            (version: number, patch = {}) => {
                const value = {
                    ...common,
                    requestId: "local-replace",
                    expectedMeetingVersion: version,
                    decisionId: "decision-candidate-1",
                    action: "supersede" as const,
                    replacementCandidateId: "candidate-2",
                    ...patch
                };
                return source === "local"
                    ? runtime.disposeLocalDecision(value)
                    : runtime.disposeDecision(value, captain);
            },
            (version: number, patch = {}) => {
                const value = {
                    ...common,
                    requestId: "local-revoke",
                    expectedMeetingVersion: version,
                    decisionId: "decision-candidate-2",
                    action: "revoke" as const,
                    ...patch
                };
                return source === "local"
                    ? runtime.disposeLocalDecision(value)
                    : runtime.disposeDecision(value, captain);
            },
            (version: number, patch = {}) => {
                const value = {
                    ...common,
                    requestId: "local-risk-accept",
                    expectedMeetingVersion: version,
                    issueId: "risk-1",
                    decision: "accept" as const,
                    ...patch
                };
                return source === "local"
                    ? runtime.disposeLocalRisk(value)
                    : runtime.disposeRisk(value, captain);
            },
            (version: number, patch = {}) => {
                const value = {
                    ...common,
                    requestId: "local-risk-reject",
                    expectedMeetingVersion: version,
                    issueId: "risk-1",
                    decision: "reject" as const,
                    ...patch
                };
                return source === "local"
                    ? runtime.disposeLocalRisk(value)
                    : runtime.disposeRisk(value, captain);
            }
        ];
    }
    it.each(["local", "captain"] as const)(
        "commits five %s actions with isolated replay and version gates",
        async (source) => {
            const { runtime, registry, meeting } = await setupLocalControlRuntime();
            try {
                // Recover selected state without binding a live parent for either command source.
                await runtime.getLocalMeetingStatus({ protocolVersion: 1, meetingId: "meeting-1" });
                const steps = commands(runtime, source);
                const other = commands(runtime, source === "local" ? "captain" : "local");
                for (const [index, step] of steps.entries()) {
                    const before = loadProjection({ domain: meeting });
                    const version = before.snapshot!.version;
                    const result = await step(version);
                    expect(result).toMatchObject({ ok: true, meetingVersion: version + 1 });
                    const after = loadProjection({ domain: meeting });
                    expect(after.snapshot!.version).toBe(version + 1);
                    expect(Object.keys(after.receipts)).toHaveLength(
                        Object.keys(before.receipts).length + 1
                    );
                    expect(Object.keys(after.outbox)).toHaveLength(0);
                    expect(await step(version)).toEqual(result);
                    expect(await step(version, { reason: "Changed evidence" })).toMatchObject({
                        ok: false,
                        code: "IDEMPOTENCY_CONFLICT"
                    });
                    expect(await step(version, { requestId: `stale-${index}` })).toMatchObject({
                        ok: false,
                        code: "VERSION_CONFLICT"
                    });
                    expect(await other[index]!(version)).toMatchObject({
                        ok: false,
                        code: "VERSION_CONFLICT"
                    });
                    expect(loadProjection({ domain: meeting })).toEqual(after);
                }
                const projection = loadProjection({ domain: meeting });
                const state = projection.snapshot!.state as unknown as MeetingState;
                expect(state.decisions.map(({ status }) => status)).toEqual([
                    "superseded",
                    "revoked"
                ]);
                expect(state.issues[0]).toMatchObject({
                    status: "open",
                    disposition: "blocking",
                    blocking: true
                });
                expect(state.completionFacts).toHaveLength(6);
                for (const fact of state.completionFacts)
                    expect(fact).toMatchObject({
                        authority: source === "local" ? "local_host" : "captain",
                        assertedBy:
                            source === "local" ? "local-host:loopback-web" : "captain:captain-1"
                    });
                expect(
                    Object.values(projection.events)
                        .slice(1)
                        .map(({ type }) => type)
                ).toEqual([
                    "decision.accepted",
                    "decision.accepted",
                    "decision.superseded",
                    "decision.revoked",
                    "completion_fact.added",
                    "completion_fact.added"
                ]);
            } finally {
                await runtime.dispose();
                await registry.close();
            }
        }
    );
    it.each([false, true])("preserves completion event order (completed=%s)", async (completed) => {
        const state = createLocalDecisionRiskState();
        if (completed) state.agenda[0]!.status = "resolved";
        const { runtime, registry, meeting } = await setupLocalControlRuntime(state);
        try {
            expect(await commands(runtime)[3]!(0)).toMatchObject({
                ok: true,
                meetingVersion: 1,
                result: { meetingStatus: completed ? "converging" : "running" }
            });
            const projection = loadProjection({ domain: meeting });
            const events = Object.values(projection.events).slice(1);
            expect(events.map(({ type }) => type)).toEqual(
                completed
                    ? ["completion_fact.added", "meeting.replanned"]
                    : ["completion_fact.added"]
            );
            expect(events.map(({ eventSeq }) => eventSeq)).toEqual(completed ? [2, 3] : [2]);
            expect(events.every(({ meetingVersion }) => meetingVersion === 1)).toBe(true);
            if (completed) {
                expect(events[1]?.payload).toMatchObject({
                    from: "running",
                    to: "converging",
                    meetingVersion: 0,
                    reason: "objective_satisfied"
                });
                expect(projection.snapshot?.state.currentTurn).toBeUndefined();
                expect(projection.snapshot?.state.waitState).toBeUndefined();
            }
            expect(Object.keys(projection.outbox)).toHaveLength(0);
        } finally {
            await runtime.dispose();
            await registry.close();
        }
    });
    it("rejects other callers and unknown meetings without mutation", async () => {
        const { runtime, registry, meeting } = await setupLocalControlRuntime();
        try {
            await runtime.getLocalMeetingStatus({ protocolVersion: 1, meetingId: "meeting-1" });
            const before = loadProjection({ domain: meeting });
            for (const caller of [
                { ...captain, kind: "manager" as const },
                { ...captain, kind: "participant" as const, participantId: "participant-1" },
                { ...captain, sessionId: "wrong" },
                { ...captain, meetingId: "wrong" }
            ]) {
                expect(
                    await runtime.acceptDecision(
                        {
                            ...common,
                            requestId: "denied-accept",
                            expectedMeetingVersion: 0,
                            decisionCandidateId: "candidate-1"
                        },
                        caller
                    )
                ).toMatchObject({ code: "UNAUTHORIZED_CALLER" });
                expect(
                    await runtime.disposeDecision(
                        {
                            ...common,
                            requestId: "denied-revoke",
                            expectedMeetingVersion: 0,
                            decisionId: "decision-candidate-1",
                            action: "revoke"
                        },
                        caller
                    )
                ).toMatchObject({ code: "UNAUTHORIZED_CALLER" });
                expect(
                    await runtime.disposeRisk(
                        {
                            ...common,
                            requestId: "denied-risk",
                            expectedMeetingVersion: 0,
                            issueId: "risk-1",
                            decision: "accept"
                        },
                        caller
                    )
                ).toMatchObject({ code: "UNAUTHORIZED_CALLER" });
            }
            for (const step of commands(runtime))
                expect(await step(0, { meetingId: "unknown" })).toMatchObject({
                    code: "MEETING_NOT_FOUND"
                });
            expect(loadProjection({ domain: meeting })).toEqual(before);
        } finally {
            await runtime.dispose();
            await registry.close();
        }
    });
    it.each<MeetingState["status"]>([
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed",
        "archiving",
        "archived"
    ])("rejects new writes in %s", async (status) => {
        const state = createLocalDecisionRiskState();
        state.status = status;
        const { runtime, registry, meeting } = await setupLocalControlRuntime(state);
        try {
            const before = loadProjection({ domain: meeting });
            for (const step of commands(runtime))
                expect(await step(0)).toMatchObject({
                    ok: false,
                    code: expect.stringMatching(/IMMUTABLE_MEETING|ARCHIVED_MEETING/)
                });
            expect(loadProjection({ domain: meeting })).toEqual(before);
        } finally {
            await runtime.dispose();
            await registry.close();
        }
    });
    it("surfaces selected recovery failures without a command commit", async () => {
        const { runtime, registry, meeting } = await setupLocalControlRuntime();
        try {
            await runtime.getLocalMeetingStatus({ protocolVersion: 1, meetingId: "meeting-1" });
            const before = loadProjection({ domain: meeting });
            const failure = vi.spyOn(meeting, "table").mockImplementation(() => {
                throw new Error("selected storage unavailable");
            });
            try {
                for (const step of commands(runtime))
                    await expect(step(0)).rejects.toBeInstanceOf(
                        LocalMeetingRecoveryUnavailableError
                    );
            } finally {
                failure.mockRestore();
            }
            expect(loadProjection({ domain: meeting })).toEqual(before);
        } finally {
            await runtime.dispose();
            await registry.close();
        }
    });
    it("replays committed acceptance before terminal mutation guards", async () => {
        const { runtime, registry, meeting, facility } = await setupLocalControlRuntime();
        const result = await commands(runtime)[0]!(0);
        expect(result).toMatchObject({ ok: true });
        await runtime.dispose();
        await registry.close();
        const authorizationValidator = {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        };
        const reopened = await DomainRepositoryRegistry.open({
            storageDomain: facility,
            authorizationValidator
        });
        const repository = await reopened.openMeeting({ teamId: "team-1", meetingId: "meeting-1" });
        await repository.execute({
            requestId: "test-terminal",
            commandKind: "test_terminal",
            authorization: { callerBinding: "fixture", capabilityId: "fixture" },
            requestHash: "terminal",
            expectedMeetingVersion: 1,
            transition: (snapshot) => ({
                state: { ...snapshot.state, status: "partial" },
                result: {},
                events: [
                    {
                        type: "meeting.ended",
                        payload: {
                            meetingId: "meeting-1",
                            from: "running",
                            to: "partial",
                            meetingVersion: 2,
                            reason: "test terminal"
                        }
                    }
                ],
                outbox: []
            })
        });
        await reopened.close();
        const cold = createCreateStatusRuntime({
            storageDomain: facility,
            provider: "spawn",
            authorizationValidator,
            now: () => localNow,
            continuable: {
                startContinuable: async () => {
                    throw new Error("Unexpected start");
                },
                followup: async () => {
                    throw new Error("Unexpected followup");
                },
                listDescendants: async () => []
            }
        });
        try {
            const before = loadProjection({ domain: meeting });
            expect(await commands(cold)[0]!(0)).toEqual(result);
            expect(await commands(cold)[0]!(2, { requestId: "new-terminal" })).toMatchObject({
                ok: false,
                code: "IMMUTABLE_MEETING"
            });
            expect(loadProjection({ domain: meeting })).toEqual(before);
        } finally {
            await cold.dispose();
        }
    });
    async function invokeLocalControl(
        handler: WebRoute["handler"],
        method: string,
        url: string,
        options: { body?: string; contentType?: string } = {}
    ): Promise<{ status: number; headers: Map<string, string>; body: string; json: unknown }> {
        const req = Readable.from(options.body === undefined ? [] : [Buffer.from(options.body)]);
        Object.assign(req, {
            method,
            url,
            headers:
                options.contentType === undefined ? {} : { "content-type": options.contentType }
        });
        const headers = new Map<string, string>();
        let body = "";
        const res = {
            statusCode: 200,
            setHeader(name: string, value: string | number | readonly string[]) {
                headers.set(name.toLowerCase(), String(value));
            },
            end(chunk?: string | Buffer) {
                if (chunk !== undefined) body += chunk.toString();
            }
        };
        await handler(req as IncomingMessage, res as unknown as ServerResponse);
        return {
            status: res.statusCode,
            headers,
            body,
            json: body === "" ? undefined : JSON.parse(body)
        };
    }
    it("commits the complete HTTP chain and preserves receipts through cold Runtime recovery", async () => {
        const { runtime, registry, meeting, facility } = await setupLocalControlRuntime();
        let route: WebRoute | undefined;
        registerLocalMeetingHttpRoutes(
            {
                register: (value: WebRoute) => {
                    route = value;
                    return () => undefined;
                }
            },
            runtime
        );
        const requests = [
            [
                "accept-decision",
                {
                    ...common,
                    requestId: "local-accept",
                    expectedMeetingVersion: 0,
                    decisionCandidateId: "candidate-1"
                }
            ],
            [
                "dispose-decision",
                {
                    ...common,
                    requestId: "local-replace",
                    expectedMeetingVersion: 1,
                    decisionId: "decision-candidate-1",
                    action: "supersede",
                    replacementCandidateId: "candidate-2"
                }
            ],
            [
                "dispose-decision",
                {
                    ...common,
                    requestId: "local-revoke",
                    expectedMeetingVersion: 2,
                    decisionId: "decision-candidate-2",
                    action: "revoke"
                }
            ],
            [
                "dispose-risk",
                {
                    ...common,
                    requestId: "local-risk-accept",
                    expectedMeetingVersion: 3,
                    issueId: "risk-1",
                    decision: "accept"
                }
            ],
            [
                "dispose-risk",
                {
                    ...common,
                    requestId: "local-risk-reject",
                    expectedMeetingVersion: 4,
                    issueId: "risk-1",
                    decision: "reject"
                }
            ]
        ] as const;
        const responses: unknown[] = [];
        try {
            for (const [suffix, body] of requests) {
                const before = loadProjection({ domain: meeting });
                const url = `/api/convivium/meetings/meeting-1/${suffix}`;
                const invalid = await invokeLocalControl(route!.handler, "POST", url, {
                    body: JSON.stringify({
                        ...body,
                        evidenceMessageIds: ["message-1", "external-message"]
                    }),
                    contentType: "application/json"
                });
                expect(invalid.status).toBe(400);
                expect(invalid.json).toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
                expect(loadProjection({ domain: meeting })).toEqual(before);
                const response = await invokeLocalControl(route!.handler, "POST", url, {
                    body: JSON.stringify(body),
                    contentType: "application/json"
                });
                expect(response.status).toBe(200);
                responses.push(response.json);
                expect(loadProjection({ domain: meeting }).snapshot?.version).toBe(
                    before.snapshot!.version + 1
                );
                const detail = await invokeLocalControl(
                    route!.handler,
                    "GET",
                    "/api/convivium/meetings/meeting-1"
                );
                expect(detail.status).toBe(200);
                expect(() =>
                    MeetingStatusResultSchema((detail.json as { result: unknown }).result)
                ).not.toThrow();
            }
            const state = loadProjection({ domain: meeting }).snapshot!
                .state as unknown as MeetingState;
            expect(state.decisions.map(({ status }) => status)).toEqual(["superseded", "revoked"]);
            expect(state.issues[0]).toMatchObject({
                status: "open",
                blocking: true,
                disposition: "blocking"
            });
        } finally {
            await runtime.dispose();
            await registry.close();
        }
        const before = loadProjection({ domain: meeting });
        const cold = createCreateStatusRuntime({
            storageDomain: facility,
            provider: "spawn",
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => localNow,
            continuable: {
                startContinuable: async () => {
                    throw new Error("unexpected Session start");
                },
                followup: async () => {
                    throw new Error("unexpected Session followup");
                },
                listDescendants: async () => []
            }
        });
        try {
            for (const [index, [suffix, body]] of requests.entries()) {
                const result =
                    suffix === "accept-decision"
                        ? await cold.acceptLocalDecision(CaptainDecisionAcceptanceInputSchema(body))
                        : suffix === "dispose-decision"
                          ? await cold.disposeLocalDecision(
                                CaptainDecisionDispositionInputSchema(body)
                            )
                          : await cold.disposeLocalRisk(CaptainRiskDispositionInputSchema(body));
                expect(result).toEqual(responses[index]);
            }
            const detail = await cold.getLocalMeetingStatus({
                protocolVersion: 1,
                meetingId: "meeting-1"
            });
            expect(detail).toMatchObject({
                ok: true,
                result: {
                    pendingDecisionCandidates: [],
                    acceptedDecisions: [],
                    decisionHistory: [{ status: "superseded" }, { status: "revoked" }],
                    risks: [{ status: "open", blocking: true }]
                }
            });
            expect(loadProjection({ domain: meeting })).toEqual(before);
        } finally {
            await cold.dispose();
        }
    });
});

async function attendanceRuntimeFixture() {
    const root = await mkdtemp(join(tmpdir(), "convivium-attendance-rejection-"));
    roots.push(root);
    const readSnapshot = vi.fn(async () => ({
        ok: true as const,
        snapshot: {
            protocolVersion: 1 as const,
            catalogId: "catalog-claim",
            catalogVersion: "v1",
            teamId: input.teamId,
            capturedAt: 100,
            roles: [
                {
                    roleDefinitionId: "domain_architect" as const,
                    version: "1",
                    displayName: "Domain Architect",
                    summary: "Architecture review",
                    expertiseTags: ["architecture"],
                    evidenceScopes: [],
                    responsibilities: ["Review"],
                    nonResponsibilities: []
                }
            ],
            candidates: [
                {
                    candidateId: "candidate-claim",
                    roleDefinitionId: "domain_architect" as const,
                    roleDefinitionVersion: "1",
                    sourceMemberName: "private-member",
                    agentDefinitionId: "private-definition",
                    availability: "available" as const
                }
            ]
        }
    }));
    const captain = {
        sessionId: "captain-claim",
        kind: "captain" as const,
        agent: { id: "captain-claim" } as never
    };
    const runtime = localRuntime(root, {
        agentCatalog: { readSnapshot },
        now: () => 100
    });
    const created = await runtime.createMeeting(
        {
            ...input,
            requestId: "create-catalog-claim",
            selectionMode: "manager",
            agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
            participants: [input.participants[0]!]
        },
        captain,
        new AbortController().signal
    );
    if (!created.ok) throw new Error("create failed");
    const manager = {
        sessionId: `${created.result.meetingId}-manager-manager`,
        meetingId: created.result.meetingId,
        kind: "manager" as const
    };
    const plan = {
        protocolVersion: 1 as const,
        meetingId: created.result.meetingId,
        requestId: "catalog-claim-plan",
        planningAttemptId: `${created.result.meetingId}-planning-1`,
        observedMeetingVersion: created.meetingVersion,
        agendaItemId: "agenda-agenda-1",
        intent: "explore",
        objective: "Review scope",
        expectedOutputs: [],
        prohibitedTopics: [],
        attendanceRecommendations: [
            {
                candidateId: "candidate-claim",
                agendaItemId: "agenda-agenda-1",
                rationale: "Architecture coverage is needed.",
                expectedContribution: "Review the scope.",
                evidenceGapIds: [],
                urgency: "current_agenda" as const
            }
        ],
        steps: [
            {
                participantId: "participant-one",
                instruction: "Review the scope",
                reason: "manager_selected"
            }
        ]
    };
    const committed = await runtime.submitManagerPlan(plan, manager);

    if (!committed.ok) throw new Error("plan failed");
    const request = CaptainAttendanceDispositionInputSchema({
        protocolVersion: 1,
        meetingId: created.result.meetingId,
        expectedMeetingVersion: committed.meetingVersion,
        requestId: "reject-1",
        recommendationId: `${created.result.meetingId}-planning-1-attendance-0`,
        decision: "reject",
        reason: " Not needed "
    });
    return { root, runtime, captain, manager, readSnapshot, request };
}

describe("Captain attendance rejection runtime", () => {
    it("commits only the rejection, replays and recovers without new provisioning", async () => {
        const f = await attendanceRuntimeFixture();
        const statusInput = { protocolVersion: 1 as const, meetingId: f.request.meetingId };
        let restarted: ReturnType<typeof localRuntime> | undefined;
        try {
            const before = await f.runtime.getStatus(statusInput, f.captain);
            const rejected = await f.runtime.disposeAttendanceRecommendation(
                f.request,
                f.captain,
                new AbortController().signal
            );
            expect(rejected).toMatchObject({
                ok: true,
                meetingVersion: f.request.expectedMeetingVersion + 1,
                result: {
                    requestId: "reject-1",
                    recommendationId: f.request.recommendationId,
                    disposition: "rejected"
                }
            });
            if (!rejected.ok) throw new Error("reject failed");
            expect(CaptainAttendanceDispositionResultSchema(rejected.result)).toEqual(
                rejected.result
            );
            const after = await f.runtime.getStatus(statusInput, f.captain);
            if (!before.ok || !after.ok) throw new Error("status failed");
            expect(after.result).toEqual({
                ...before.result,
                meetingVersion: rejected.meetingVersion,
                attendanceRecommendations: expect.arrayContaining([
                    expect.objectContaining({
                        recommendationId: f.request.recommendationId,
                        status: "rejected"
                    })
                ])
            });
            expect(f.readSnapshot).toHaveBeenCalledTimes(1);
            await expect(
                f.runtime.disposeAttendanceRecommendation(
                    f.request,
                    f.captain,
                    new AbortController().signal
                )
            ).resolves.toEqual(rejected);
            await expect(
                f.runtime.disposeAttendanceRecommendation(
                    { ...f.request, reason: "Different" },
                    f.captain,
                    new AbortController().signal
                )
            ).resolves.toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
            await expect(
                f.runtime.disposeAttendanceRecommendation(
                    {
                        ...f.request,
                        requestId: "new",
                        expectedMeetingVersion: rejected.meetingVersion
                    },
                    f.captain,
                    new AbortController().signal
                )
            ).resolves.toMatchObject({
                ok: false,
                code: "ATTENDANCE_RECOMMENDATION_NOT_PENDING",
                message: "Attendance recommendation is not pending.",
                retryable: false
            });
            await f.runtime.dispose();
            restarted = localRuntime(f.root, {
                now: () => 100,
                agentCatalog: { readSnapshot: f.readSnapshot }
            });
            await expect(restarted.getStatus(statusInput, f.captain)).resolves.toEqual(after);
            await expect(
                restarted.disposeAttendanceRecommendation(
                    f.request,
                    f.captain,
                    new AbortController().signal
                )
            ).resolves.toEqual(rejected);
            expect(f.readSnapshot).toHaveBeenCalledTimes(1);
        } finally {
            await f.runtime.dispose();
            await restarted?.dispose();
        }
    });
    it("rejects invalid authority, targets, stale input and direct approve with zero effects", async () => {
        const f = await attendanceRuntimeFixture();
        const signal = new AbortController().signal;
        try {
            const before = await f.runtime.getStatus(
                { protocolVersion: 1, meetingId: f.request.meetingId },
                f.captain
            );
            for (const caller of [
                f.manager,
                {
                    kind: "participant" as const,
                    sessionId: "participant-one",
                    meetingId: f.request.meetingId
                },
                { ...f.captain, sessionId: "other" },
                { ...f.captain, meetingId: "other" }
            ]) {
                await expect(
                    f.runtime.disposeAttendanceRecommendation(f.request, caller, signal)
                ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
            }
            await expect(
                f.runtime.disposeAttendanceRecommendation(
                    { ...f.request, meetingId: "missing" },
                    f.captain,
                    signal
                )
            ).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
            await expect(
                f.runtime.disposeAttendanceRecommendation(
                    { ...f.request, recommendationId: "missing" },
                    f.captain,
                    signal
                )
            ).resolves.toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
            await expect(
                f.runtime.disposeAttendanceRecommendation(
                    { ...f.request, expectedMeetingVersion: 0 },
                    f.captain,
                    signal
                )
            ).resolves.toMatchObject({ ok: false, code: "VERSION_CONFLICT", retryable: true });
            const approve = { ...f.request };
            Reflect.set(approve, "decision", "approve");
            await expect(
                f.runtime.disposeAttendanceRecommendation(approve, f.captain, signal)
            ).resolves.toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
            await expect(
                f.runtime.disposeAttendanceRecommendation(
                    { ...f.request, reason: " " },
                    f.captain,
                    signal
                )
            ).resolves.toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
            await expect(
                f.runtime.getStatus(
                    { protocolVersion: 1, meetingId: f.request.meetingId },
                    f.captain
                )
            ).resolves.toEqual(before);
            expect(f.readSnapshot).toHaveBeenCalledTimes(1);
        } finally {
            await f.runtime.dispose();
        }
    });
    it("allows exactly one concurrent request to win", async () => {
        const f = await attendanceRuntimeFixture();
        try {
            const results = await Promise.all(
                ["reject-a", "reject-b"].map((requestId) =>
                    f.runtime.disposeAttendanceRecommendation(
                        { ...f.request, requestId },
                        f.captain,
                        new AbortController().signal
                    )
                )
            );
            expect(results.filter((result) => result.ok)).toHaveLength(1);
            expect(results.filter((result) => !result.ok)).toMatchObject([
                { code: "VERSION_CONFLICT" }
            ]);
        } finally {
            await f.runtime.dispose();
        }
    });
});

it("archives and reopens a Captain attendance rejection", async () => {
    const root = await mkdtemp(join(tmpdir(), "convivium-attendance-rejection-"));
    roots.push(root);
    const readSnapshot = vi.fn(async () => ({
        ok: true as const,
        snapshot: {
            protocolVersion: 1 as const,
            catalogId: "catalog-claim",
            catalogVersion: "v1",
            teamId: input.teamId,
            capturedAt: 100,
            roles: [
                {
                    roleDefinitionId: "domain_architect" as const,
                    version: "1",
                    displayName: "Domain Architect",
                    summary: "Architecture review",
                    expertiseTags: ["architecture"],
                    evidenceScopes: [],
                    responsibilities: ["Review"],
                    nonResponsibilities: []
                }
            ],
            candidates: [
                {
                    candidateId: "candidate-claim",
                    roleDefinitionId: "domain_architect" as const,
                    roleDefinitionVersion: "1",
                    sourceMemberName: "private-member",
                    agentDefinitionId: "private-definition",
                    availability: "available" as const
                }
            ]
        }
    }));
    const captain = {
        sessionId: "captain-claim",
        kind: "captain" as const,
        agent: { id: "captain-claim" } as never
    };
    const children: Array<{ id: string; label: string }> = [];
    const drained: string[][] = [];
    const interrupted: string[] = [];
    const continuable = {
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
    };
    const createRuntime = () =>
        createCreateStatusRuntime({
            storageDomain: storagePort(root),
            provider: "spawn",
            continuable,
            agentCatalog: { readSnapshot },
            now: () => 100,
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            }
        });
    const runtime = createRuntime();
    try {
        const created = await runtime.createMeeting(
            {
                ...input,
                requestId: "create-catalog-claim",
                selectionMode: "manager",
                agenda: [{ ...input.agenda[0]!, requiredParticipantKeys: ["one"] }],
                participants: [input.participants[0]!]
            },
            captain,
            new AbortController().signal
        );
        if (!created.ok) throw new Error("create failed");
        const manager = {
            sessionId: `${created.result.meetingId}-manager-manager`,
            meetingId: created.result.meetingId,
            kind: "manager" as const
        };
        const plan = {
            protocolVersion: 1 as const,
            meetingId: created.result.meetingId,
            requestId: "catalog-claim-plan",
            planningAttemptId: `${created.result.meetingId}-planning-1`,
            observedMeetingVersion: created.meetingVersion,
            agendaItemId: "agenda-agenda-1",
            intent: "explore",
            objective: "Review scope",
            expectedOutputs: [],
            prohibitedTopics: [],
            attendanceRecommendations: [
                {
                    candidateId: "candidate-claim",
                    agendaItemId: "agenda-agenda-1",
                    rationale: "Architecture coverage is needed.",
                    expectedContribution: "Review the scope.",
                    evidenceGapIds: [],
                    urgency: "current_agenda" as const
                }
            ],
            steps: [
                {
                    participantId: "participant-one",
                    instruction: "Review the scope",
                    reason: "manager_selected"
                }
            ]
        };
        const committed = await runtime.submitManagerPlan(plan, manager);

        if (!committed.ok) throw new Error("plan failed");
        const request = CaptainAttendanceDispositionInputSchema({
            protocolVersion: 1,
            meetingId: created.result.meetingId,
            expectedMeetingVersion: committed.meetingVersion,
            requestId: "reject-1",
            recommendationId: `${created.result.meetingId}-planning-1-attendance-0`,
            decision: "reject",
            reason: " Not needed "
        });
        const rejected = await runtime.disposeAttendanceRecommendation(
            request,
            captain,
            new AbortController().signal
        );
        expect(rejected.ok).toBe(true);
        if (!rejected.ok) throw new Error("reject failed");
        const ended = await runtime.endMeeting(
            {
                protocolVersion: 1,
                meetingId: request.meetingId,
                expectedMeetingVersion: rejected.meetingVersion,
                requestId: "attendance-rejection-end",
                outcome: "cancelled",
                reason: "Close attendance rejection test",
                acceptedDecisionIds: [],
                deferredAgendaItemIds: [],
                waivers: []
            },
            captain,
            new AbortController().signal
        );
        expect(ended).toMatchObject({ ok: true, result: { status: "cancelled" } });
        const statusInput = { protocolVersion: 1 as const, meetingId: request.meetingId };
        const archived = await runtime.getStatus(statusInput, captain);
        expect(archived).toMatchObject({
            ok: true,
            result: {
                status: "archived",
                archive: {
                    package: {
                        attendanceRejections: [
                            {
                                recommendationId: request.recommendationId,
                                candidateId: "candidate-claim",
                                roleDefinitionId: "domain_architect",
                                displayName: "Domain Architect",
                                agendaItemId: "agenda-agenda-1",
                                reason: "Not needed",
                                rejectedAt: 100
                            }
                        ]
                    }
                }
            }
        });
        expect(drained.flat().sort()).toEqual(children.map((c) => c.id).sort());
        expect(children).toHaveLength(2);
        expect(interrupted.sort()).toEqual(children.map((c) => c.id).sort());
        await runtime.dispose();
        const reopened = createRuntime();
        try {
            const current = await reopened.getStatus(statusInput, captain);
            expect(current).toEqual(archived);
            if (!current.ok) throw new Error("status failed");
            expect(
                await reopened.disposeAttendanceRecommendation(
                    {
                        ...request,
                        requestId: "after-archive",
                        expectedMeetingVersion: current.meetingVersion
                    },
                    captain,
                    new AbortController().signal
                )
            ).toMatchObject({ ok: false, code: "ARCHIVED_MEETING" });
            expect(
                await reopened.disposeAttendanceRecommendation(
                    request,
                    captain,
                    new AbortController().signal
                )
            ).toEqual(rejected);
            expect(await reopened.getStatus(statusInput, captain)).toEqual(archived);
        } finally {
            await reopened.dispose();
        }
    } finally {
        await runtime.dispose();
    }
});
