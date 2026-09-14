import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomainPlugin from "@deepseek-ai/dsh-storage-domain";
import * as storageSqlite from "@deepseek-ai/dsh-storage-sqlite";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { JsonObjectSchema } from "@/repository/domain/schemas.js";
import {
    applyContributionCommand,
    endMeeting,
    isMeetingStateV2,
    assertContributionCapacity,
    transitionMeeting,
    createContributionState,
    type MeetingState
} from "@/domain/index.js";
import { encodeMeetingSessionLabel } from "@/dsh/index.js";
import { recoverContributionWork } from "@/runtime/services/contribution-runtime-service.js";
import { createCreateStatusRuntime } from "@/runtime/application-service/index.js";
import { recoverArchive } from "@/runtime/services/meeting-archive-service.js";
import { encodeCanonicalJson } from "@/repository/domain/canonical-json.js";
import type { MeetingDomain } from "@/repository/domain/specs.js";
import { contributionMeeting, contributionNow as now } from "../fixtures/contribution.js";

async function fixture(
    status: "running" | "waiting" | "paused" = "running",
    prepare?: (state: MeetingState) => void
) {
    const root = await mkdtemp(join(tmpdir(), "convivium-contribution-recovery-"));
    const contexts: Context[] = [];
    const registries: DomainRepositoryRegistry[] = [];
    const commitBytes: number[] = [];
    const validator = { validateCreate() {}, validateCommand() {} };
    async function open() {
        const ctx = new Context();
        contexts.push(ctx);
        await ctx.plugin(Storage);
        await ctx.plugin(storageSqlite, { path: join(root, "storage.sqlite"), journalMode: "wal" });
        await ctx.plugin(
            {
                name: storageDomainPlugin.name,
                inject: storageDomainPlugin.inject,
                apply: storageDomainPlugin.apply
            },
            { backend: "sqlite" }
        );
        let meetingDomain: MeetingDomain | undefined;
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: {
                async open(spec) {
                    const domain = await ctx.storageDomain.open(spec);
                    if (spec.name.startsWith("convivium_m_"))
                        meetingDomain = domain as MeetingDomain;
                    return domain;
                }
            },
            onProjectionCommitted() {
                for (const [, record] of meetingDomain?.table("commits").entries() ?? [])
                    commitBytes.push(encodeCanonicalJson(record).byteLength);
            },
            authorizationValidator: validator
        });
        registries.push(registry);
        return { ctx, registry };
    }
    async function close() {
        for (const registry of registries.reverse()) await registry.close();
        for (const ctx of contexts.reverse()) await ctx.fiber.dispose();
        await rm(root, { recursive: true, force: true });
    }
    try {
        const first = await open();
        let state = contributionMeeting();
        state.meetingTasks = [];
        delete state.termination;
        state.contributions = createContributionState("participant-2", now);
        const context = {
            now,
            actor: { kind: "manager" as const },
            newContributionId: "contribution-1",
            newEvidenceId: "evidence-1",
            completionFactId: (_kind: string, index: number) => `fact-${index}`
        };
        state = applyContributionCommand(
            state,
            {
                action: "assign",
                participantId: "participant-1",
                agendaItemId: "agenda-1",
                instruction: "Research",
                targetIds: [],
                requiredForCompletion: false,
                requiresEvidenceReview: false
            },
            context
        ).state;
        state = applyContributionCommand(
            state,
            {
                action: "save_evidence",
                contributionId: "contribution-1",
                generation: 1,
                expectedEvidenceRevision: 0,
                material: {
                    kind: "document",
                    title: "Stored source",
                    source: "fixture",
                    sourceDate: "fixture",
                    collectedAt: "fixture",
                    locator: "fixture",
                    observation: "fixture",
                    methodAndConditions: "fixture",
                    limitations: "fixture",
                    dependencies: "fixture",
                    material: { kind: "text", text: "原文 amber-47" }
                }
            },
            { ...context, actor: { kind: "participant", participantId: "participant-1" } }
        ).state;
        state.status = status;
        if (status === "waiting")
            state.waitState = {
                reason: "captain_action",
                waitingSince: now,
                taskIds: [],
                participantIds: [],
                resumeAgendaItemId: "agenda-1"
            };
        if (status === "paused") {
            state.pausedFromStatus = "running";
            state.pausedAt = now;
            state.pauseReason = "Fixture pause";
            state.pausedBy = { kind: "captain", actorId: "captain-1" };
        }
        const create = {
            requestId: "create",
            requestHash: "create",
            authorization: {
                callerBinding: "session:captain-1",
                capabilityId: "captain:captain-1"
            },
            initialState: JsonObjectSchema.parse(JSON.parse(JSON.stringify(state))),
            createdAt: now
        };
        const repository = await first.registry.openMeeting({
            teamId: "team-1",
            meetingId: "meeting-1",
            create
        });
        await repository.completeCreate(create);
        if (prepare !== undefined) {
            const expanded = structuredClone(state);
            prepare(expanded);
            for (const field of ["evidence", "tasks"] as const) {
                const entries = Object.entries(expanded.contributions![field]);
                for (let offset = 0; offset < entries.length; offset += 8) {
                    await repository.execute({
                        requestId: `fixture-${field}-${offset}`,
                        requestHash: `fixture-${field}-${offset}`,
                        commandKind: "fixture_capacity",
                        authorization: { callerBinding: "runtime", capabilityId: "runtime" },
                        expectedMeetingVersion: (await repository.read()).version,
                        transition(snapshot) {
                            const next = structuredClone(snapshot.state) as unknown as MeetingState;
                            Object.assign(
                                next.contributions![field],
                                Object.fromEntries(entries.slice(offset, offset + 8))
                            );
                            if (offset === 0) {
                                if (
                                    field === "evidence" &&
                                    !("evidence-1:1" in expanded.contributions!.evidence)
                                )
                                    delete next.contributions!.evidence["evidence-1:1"];
                                if (
                                    field === "tasks" &&
                                    !("contribution-1" in expanded.contributions!.tasks)
                                )
                                    delete next.contributions!.tasks["contribution-1"];
                            }
                            if (field === "tasks" && offset + 8 >= entries.length) {
                                next.agenda = expanded.agenda;
                                next.transcript = expanded.transcript;
                                next.messageSeq = expanded.messageSeq;
                            }
                            return {
                                state: JsonObjectSchema.parse(JSON.parse(JSON.stringify(next))),
                                result: {},
                                events: [
                                    {
                                        type: "meeting.replanned",
                                        payload: { reason: "capacity fixture" }
                                    }
                                ],
                                outbox: []
                            };
                        }
                    });
                }
            }
        }
        for (const [sessionId, role, participantId] of [
            ["manager-1", "manager", undefined],
            ["author-1", "participant", "participant-1"],
            ["reviewer-1", "participant", "participant-2"]
        ] as const) {
            await repository.recordSessionOwnership(
                {
                    sessionId,
                    parentSessionId: "captain-1",
                    role,
                    ...(participantId === undefined ? {} : { participantId }),
                    sessionLabel: encodeMeetingSessionLabel(
                        role === "manager"
                            ? { role, meetingId: "meeting-1", teamId: "team-1" }
                            : {
                                  role,
                                  participantId: participantId!,
                                  meetingId: "meeting-1",
                                  teamId: "team-1"
                              }
                    ),
                    provider: "fixture",
                    initialMessageId: `initial-${sessionId}`,
                    lifecycleStatus: "active",
                    capabilityStatus: "active"
                },
                now
            );
        }
        const original = await repository.read();
        await first.registry.close();
        await first.ctx.fiber.dispose();
        const reopened = await open();
        const repo = await reopened.registry.openMeeting({
            teamId: "team-1",
            meetingId: "meeting-1"
        });
        return { ...reopened, repo, original, validator, close, open, commitBytes };
    } catch (error) {
        await close();
        throw error;
    }
}

function maximumContributions(state: MeetingState): void {
    const contribution = state.contributions!;
    const template = contribution.tasks["contribution-1"]!;
    const material = contribution.evidence["evidence-1:1"]!;
    contribution.evidence = Object.fromEntries(
        Array.from({ length: 128 }, (_, index) => {
            const evidenceId = `source-${index}`;
            return [
                `${evidenceId}:1`,
                {
                    ...material,
                    evidenceId,
                    key: `${evidenceId}:1`,
                    material: { kind: "text", text: `材料-${index}:` + "amber-47 ".repeat(650) }
                }
            ];
        })
    );
    contribution.evidence["source-0:1"]!.kind = "code";
    contribution.evidence["source-0:1"]!.code = {
        repository: "fixture",
        revision: "fixed",
        pathsAndSymbols: "fixture",
        patchEvidenceKeys: ["source-1:1"],
        validation: "static_only",
        reproduction: "fixture",
        expected: "fixture",
        observed: "fixture",
        notCovered: "execution"
    };
    contribution.tasks = Object.fromEntries(
        Array.from({ length: 64 }, (_, index) => {
            const id = `task-${index}`;
            return [
                id,
                {
                    ...template,
                    id,
                    phase: index === 0 ? "published" : "cancelled",
                    currentDraftRevision: 2,
                    drafts: Object.fromEntries(
                        [1, 2].map((revision) => [
                            String(revision),
                            {
                                revision,
                                basedOnSeq: 0,
                                submittedAt: now,
                                message: {
                                    id: `${id}-${revision}`,
                                    content: index === 0 ? "Public observation" : "Private draft",
                                    kind: "statement",
                                    mentions: [],
                                    taskIds: [],
                                    agendaRelation: "on_topic",
                                    createdAt: now
                                },
                                claims: {
                                    questions: [],
                                    issues: [],
                                    proposals: [],
                                    positions: [],
                                    agendaCandidates: [],
                                    decisionCandidates: []
                                },
                                citations: [
                                    {
                                        evidenceKey: `source-${index * 2}:1`,
                                        claim: "Observation",
                                        locator: "fixture",
                                        inference: "none"
                                    }
                                ]
                            }
                        ])
                    ),
                    boundaryReviews:
                        index === 0
                            ? [
                                  {
                                      draftRevision: 2,
                                      decision: "approve",
                                      reason: "In scope",
                                      checkedThroughSeq: 0,
                                      actor: "manager",
                                      reviewedAt: now
                                  }
                              ]
                            : [],
                    ...(index === 0 ? { messageId: "task-0-2" } : {})
                }
            ];
        })
    );
    state.transcript = [
        {
            ...contribution.tasks["task-0"]!.drafts["2"]!.message,
            seq: 1,
            speaker: "participant-1",
            agendaItemId: "agenda-1",
            contributionId: "task-0",
            contributionRevision: 2
        }
    ];
    state.messageSeq = 1;
    expect(isMeetingStateV2(state)).toBe(true);
    expect(() => assertContributionCapacity(state)).not.toThrow();
}

describe("contribution archive recovery", () => {
    it("archives capacity-sized private state by reference, then retries failed cleanup without copying materials", async () => {
        const f = await fixture("running", maximumContributions);
        try {
            const original = (await f.repo.read()).state;
            await f.repo.execute({
                requestId: "end-archive",
                commandKind: "end_meeting",
                requestHash: "end-archive",
                authorization: {
                    callerBinding: "session:captain-1",
                    capabilityId: "captain:captain-1"
                },
                expectedMeetingVersion: (await f.repo.read()).version,
                transition(snapshot) {
                    const ended = endMeeting(snapshot.state as unknown as MeetingState, {
                        meetingId: "meeting-1",
                        captainBinding: "captain-1",
                        outcome: "partial",
                        reason: "Archive test",
                        acceptedDecisionIds: [],
                        deferredAgendaItemIds: [],
                        waivers: [],
                        now: now + 1,
                        factId: (index) => `archive-${index}`
                    });
                    return {
                        state: JsonObjectSchema.parse(JSON.parse(JSON.stringify(ended.state))),
                        result: {},
                        events: ended.effect.events.map((event) => ({
                            type: event.type,
                            payload: JsonObjectSchema.parse(
                                JSON.parse(JSON.stringify(event.payload))
                            )
                        })),
                        outbox: []
                    };
                }
            });
            const ownerships = (await f.repo.recover()).sessionOwnership;
            const drain = vi
                .fn()
                .mockRejectedValueOnce(new Error("cleanup unavailable"))
                .mockResolvedValue(undefined);
            const runtime = {
                interrupt: vi.fn(),
                drainContinuableChildren: drain,
                listChildren: async () =>
                    ownerships.map((item) => ({
                        kind: "child",
                        id: item.sessionId,
                        mode: "continuable",
                        label: item.sessionLabel
                    })) as never
            };
            const input = {
                repository: f.repo,
                parent: { id: "captain-1" } as never,
                runtime,
                signal: new AbortController().signal,
                now: now + 2
            };
            await expect(recoverArchive(input)).rejects.toThrow("cleanup unavailable");
            const pending = (await f.repo.read()).state as unknown as MeetingState;
            expect(pending.status).toBe("archiving");
            expect(pending.archive!.package.contributionRefs).toEqual({
                taskIds: ["task-0"],
                evidenceKeys: ["source-0:1", "source-1:1"]
            });
            for (const evidenceKeys of [
                ["source-0:1"],
                ["source-1:1", "source-0:1"],
                ["source-0:1", "source-1:1", "source-2:1"]
            ]) {
                const terminal = { ...pending, status: "partial" as const };
                const archive = structuredClone(pending.archive!.package);
                archive.contributionRefs = { taskIds: ["task-0"], evidenceKeys };
                expect(() =>
                    transitionMeeting(terminal, "archiving", {
                        now: now + 2,
                        archive: { package: archive }
                    })
                ).toThrowError(expect.objectContaining({ code: "INVALID_ENTITY_STATE" }));
            }
            expect(JSON.stringify(pending.archive!.package)).not.toContain("Private draft");
            expect(JSON.stringify(pending.archive!.package)).not.toContain("amber-47");
            await recoverArchive(input);
            const archived = await f.repo.read();
            expect(archived.state.status).toBe("archived");
            expect(archived.state.contributions).toEqual(original.contributions);
            expect(
                (await f.repo.recover()).sessionOwnership.every(
                    (item) =>
                        item.capabilityStatus === "revoked" && item.lifecycleStatus === "closed"
                )
            ).toBe(true);
            await recoverArchive(input);
            expect(await f.repo.read()).toEqual(archived);
            expect(drain).toHaveBeenCalledTimes(2);
            expect(f.commitBytes.length).toBeGreaterThan(30);
            expect(Math.max(...f.commitBytes)).toBeLessThanOrEqual(65536);
            await f.registry.close();
            const reopened = await f.open();
            const repo = await reopened.registry.openMeeting({
                teamId: "team-1",
                meetingId: "meeting-1"
            });
            expect(await repo.read()).toEqual(archived);
        } finally {
            await f.close();
        }
    });
});

describe("contribution cold recovery", () => {
    it("archives automatically completed contributions through the existing Runtime scan", async () => {
        const f = await fixture("running", (state) => {
            state.contributions!.tasks["contribution-1"]!.phase = "cancelled";
            state.agenda[0]!.status = "resolved";
        });
        const ownerships = (await f.repo.recover()).sessionOwnership;
        await f.registry.close();
        const children = ownerships.map((item) => ({
            kind: "child",
            id: item.sessionId,
            parentId: item.parentSessionId,
            mode: "continuable",
            label: item.sessionLabel,
            activity: "inactive",
            hasChildren: false
        }));
        const runtime = createCreateStatusRuntime({
            storageDomain: f.ctx.storageDomain,
            provider: "fixture",
            authorizationValidator: f.validator,
            now: () => now + 1,
            getCaptainParent: () => ({ id: "captain-1" }) as never,
            continuable: {
                startContinuable: async () => {
                    throw new Error("Unexpected provisioning");
                },
                sendMessage: async () => "accepted" as never,
                interrupt: vi.fn(),
                drainContinuableChildren: async () => undefined,
                listChildren: async () => children as never,
                listDescendants: async () => children as never
            }
        });
        try {
            await runtime.scanExpiredSpeakerAttempts();
            const result = await runtime.getStatus(
                { protocolVersion: 1, meetingId: "meeting-1" },
                { kind: "captain", sessionId: "captain-1" }
            );
            expect(result).toMatchObject({ ok: true, result: { status: "archived" } });
        } finally {
            await runtime.dispose();
            await f.close();
        }
    });
    it.each(["running", "waiting"] as const)(
        "reopens %s material and reauthorizes once per recovery receipt",
        async (status) => {
            const f = await fixture(status);
            try {
                expect((await f.repo.read()).state).toEqual(f.original.state);
                await recoverContributionWork({
                    repository: f.repo,
                    now: now + 1,
                    recoveryEpoch: "instance-a"
                });
                const recovered = await f.repo.read();
                expect(
                    (recovered.state as unknown as MeetingState).contributions!.tasks[
                        "contribution-1"
                    ]
                ).toMatchObject({ generation: 2, deadlineAt: now + 600000 });
                expect(
                    (recovered.state as unknown as MeetingState).contributions!.evidence
                ).toEqual((f.original.state as unknown as MeetingState).contributions!.evidence);
                const pending = (await f.repo.recover()).pendingOutbox;
                expect(pending).toBe(2);
                await recoverContributionWork({
                    repository: f.repo,
                    now: now + 2,
                    recoveryEpoch: "instance-a"
                });
                expect(await f.repo.read()).toEqual(recovered);
                expect((await f.repo.recover()).pendingOutbox).toBe(pending);
            } finally {
                await f.close();
            }
        }
    );
    it("does not restore paused work or expired research", async () => {
        const paused = await fixture("paused");
        const expired = await fixture();
        try {
            await recoverContributionWork({
                repository: paused.repo,
                now: now + 600001,
                recoveryEpoch: "paused"
            });
            expect(await paused.repo.read()).toEqual(paused.original);
            expect((await paused.repo.recover()).pendingOutbox).toBe(0);
            await recoverContributionWork({
                repository: expired.repo,
                now: now + 600000,
                recoveryEpoch: "expired"
            });
            expect(
                ((await expired.repo.read()).state as unknown as MeetingState).contributions!.tasks[
                    "contribution-1"
                ]
            ).toMatchObject({ phase: "captain_action", generation: 2 });
            await expired.repo.execute({
                requestId: "end",
                commandKind: "end",
                requestHash: "end",
                authorization: {
                    callerBinding: "session:captain-1",
                    capabilityId: "captain:captain-1"
                },
                expectedMeetingVersion: (await expired.repo.read()).version,
                transition(snapshot) {
                    const ended = endMeeting(snapshot.state as unknown as MeetingState, {
                        meetingId: "meeting-1",
                        captainBinding: "captain-1",
                        outcome: "partial",
                        reason: "Recovery test",
                        acceptedDecisionIds: [],
                        deferredAgendaItemIds: [],
                        waivers: [],
                        now: now + 600001,
                        factId: (index) => `end-${index}`
                    });
                    return {
                        state: JsonObjectSchema.parse(JSON.parse(JSON.stringify(ended.state))),
                        result: {},
                        events: ended.effect.events.map((event) => ({
                            type: event.type,
                            payload: JsonObjectSchema.parse(
                                JSON.parse(JSON.stringify(event.payload))
                            )
                        })),
                        outbox: []
                    };
                }
            });
            const terminal = await expired.repo.read();
            await recoverContributionWork({
                repository: expired.repo,
                now: now + 600002,
                recoveryEpoch: "terminal"
            });
            expect(await expired.repo.read()).toEqual(terminal);
        } finally {
            await paused.close();
            await expired.close();
        }
    });
    it.each([true, false])(
        "repeated Runtime reads preserve one epoch and missing-parent read-only behavior (parent=%s)",
        async (available) => {
            const f = await fixture();
            const ownerships = (await f.repo.recover()).sessionOwnership;
            await f.registry.close();
            const sendMessage = vi.fn(async () => "accepted" as never);
            const startContinuable = vi.fn(async (): Promise<never> => {
                throw new Error("must not replace identity");
            });
            const runtime = createCreateStatusRuntime({
                storageDomain: f.ctx.storageDomain,
                provider: "fixture",
                authorizationValidator: f.validator,
                now: () => now + 1,
                getCaptainParent: () => (available ? ({ id: "captain-1" } as never) : undefined),
                continuable: {
                    startContinuable,
                    sendMessage,
                    interrupt: vi.fn(),
                    drainContinuableChildren: async () => undefined,
                    listDescendants: async () =>
                        ownerships.map((item) => ({
                            kind: "child",
                            id: item.sessionId,
                            parentId: item.parentSessionId,
                            mode: "continuable",
                            label: item.sessionLabel,
                            activity: "inactive",
                            hasChildren: false
                        })) as never,
                    listChildren: async () =>
                        ownerships.map((item) => ({
                            kind: "child",
                            id: item.sessionId,
                            mode: "continuable",
                            label: item.sessionLabel,
                            activity: "inactive",
                            hasChildren: false
                        })) as never
                }
            });
            try {
                const caller = { kind: "captain" as const, sessionId: "captain-1" };
                const input = { protocolVersion: 1 as const, meetingId: "meeting-1" };
                const first = await runtime.getStatus(input, caller);
                if (!first.ok) throw new Error(JSON.stringify(first));
                expect(first).toMatchObject({
                    ok: true,
                    result: { contributions: { tasks: [{ generation: available ? 2 : 1 }] } }
                });
                expect(await runtime.getStatus(input, caller)).toEqual(first);
                expect(startContinuable).not.toHaveBeenCalled();
                if (!available) expect(sendMessage).not.toHaveBeenCalled();
                if (available) {
                    const ended = await runtime.endMeeting(
                        {
                            ...input,
                            requestId: "public-end",
                            expectedMeetingVersion: first.meetingVersion,
                            outcome: "partial",
                            reason: "Public end test",
                            acceptedDecisionIds: [],
                            deferredAgendaItemIds: [],
                            waivers: []
                        },
                        { ...caller, agent: { id: "captain-1" } as never }
                    );
                    expect(ended).toMatchObject({ ok: true });
                    expect(await runtime.getStatus(input, caller)).toMatchObject({
                        ok: true,
                        result: { status: "archived" }
                    });
                }
            } finally {
                await runtime.dispose();
                await f.close();
            }
        }
    );
});
