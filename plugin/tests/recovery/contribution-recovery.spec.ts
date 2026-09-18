import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomainPlugin from "@deepseek-ai/dsh-storage-domain";
import * as storageSqlite from "@deepseek-ai/dsh-storage-sqlite";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { JsonObjectSchema } from "@/repository/domain/schemas.js";
import {
    applyContributionCommand,
    endMeeting,
    createContributionState,
    type LegacyMeetingState
} from "@/domain/index.js";
import { encodeMeetingSessionLabel } from "@/dsh/index.js";
import { recoverContributionWork } from "@/runtime/services/contribution-runtime-service.js";
import { contributionMeeting, contributionNow as now } from "../fixtures/contribution.js";

async function fixture(
    status: "running" | "waiting" | "paused" = "running",
    prepare?: (state: LegacyMeetingState) => void
) {
    const root = await mkdtemp(join(tmpdir(), "convivium-contribution-recovery-"));
    const contexts: Context[] = [];
    const registries: DomainRepositoryRegistry[] = [];
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
        const registry = await DomainRepositoryRegistry.open({
            storageDomain: {
                async open(spec) {
                    return await ctx.storageDomain.open(spec);
                }
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
                            const next = structuredClone(
                                snapshot.state
                            ) as unknown as LegacyMeetingState;
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
        return { ...reopened, repo, original, validator, close, open };
    } catch (error) {
        await close();
        throw error;
    }
}

describe("contribution cold recovery", () => {
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
                    (recovered.state as unknown as LegacyMeetingState).contributions!.tasks[
                        "contribution-1"
                    ]
                ).toMatchObject({ generation: 2, deadlineAt: now + 600000 });
                expect(
                    (recovered.state as unknown as LegacyMeetingState).contributions!.evidence
                ).toEqual(
                    (f.original.state as unknown as LegacyMeetingState).contributions!.evidence
                );
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
                ((await expired.repo.read()).state as unknown as LegacyMeetingState).contributions!
                    .tasks["contribution-1"]
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
                    const ended = endMeeting(snapshot.state as unknown as LegacyMeetingState, {
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
});
