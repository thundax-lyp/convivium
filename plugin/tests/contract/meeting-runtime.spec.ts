import {
    roleCompositionDefinitions,
    roleCompositionModelOverrides
} from "../fixtures/role-composition.js";
import { MeetingArchivePackageSchema } from "@/protocol/status.js";
import { MeetingStatusResultSchema } from "@/protocol/index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import Storage from "@deepseek-ai/dsh-storage";
import * as storageDomainPlugin from "@deepseek-ai/dsh-storage-domain";
import type { Domain, DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import { openMeetingRepository } from "@/runtime/index.js";
import {
    DomainRepositoryRegistry,
    type DomainFacilityPort
} from "@/repository/domain/domain-repository-registry.js";
import * as storageSqlite from "@deepseek-ai/dsh-storage-sqlite";
import { createCreateStatusRuntime } from "@/runtime/application-service/index.js";
import type { AgentCatalogPort } from "@/runtime/services/agent-catalog.js";

const roots: string[] = [];
const storageContexts: Array<Promise<Context>> = [];

function storagePort(root: string): DomainFacilityPort {
    const mounting = (async () => {
        const ctx = new Context();
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
    evidenceReviewerKey: "three",
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
        startContinuable?: CreateStatusRuntimeOptions["continuable"]["startContinuable"];
    } = {}
) {
    return createCreateStatusRuntime({
        storageDomain: storagePort(root),
        provider: "spawn",
        continuable: {
            startContinuable:
                options.startContinuable ??
                (async (spec) => ({
                    childId: spec.childId!,
                    messageId: `initial-${String(spec.childId)}` as never
                })),
            sendMessage: async () => "followup-message" as never
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

describe("meeting creation input failures", () => {
    it("maps semantic preparation failures to INVALID_ARGUMENT", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-invalid-create-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const result = await runtime.createMeeting(
            {
                ...input,
                agenda: [
                    {
                        ...input.agenda[0]!,
                        completionCriteria: ["unregistered natural-language criterion"]
                    }
                ]
            },
            {
                sessionId: "captain-invalid-create",
                kind: "captain",
                agent: { id: "captain-invalid-create" } as never
            },
            new AbortController().signal
        );

        expect(result).toMatchObject({
            protocolVersion: 1,
            ok: false,
            code: "INVALID_ARGUMENT",
            retryable: false
        });
    });
});

describe("contribution meeting creation runtime", () => {
    it("starts once without a Turn, publishes one Manager notice and replays the current receipt", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-contribution-create-"));
        roots.push(root);
        const starts = vi.fn(async (spec) => ({
            childId: spec.childId!,
            messageId: `initial-${String(spec.childId)}` as never
        }));
        const runtime = localRuntime(root, { startContinuable: starts });
        const captain = {
            sessionId: "captain-contribution",
            kind: "captain" as const,
            agent: { id: "captain-contribution" } as never
        };
        const created = await runtime.createMeeting(input, captain, new AbortController().signal);
        expect(created).toMatchObject({
            ok: true,
            meetingVersion: 1,
            result: { status: "running" }
        });
        if (!created.ok) throw new Error(JSON.stringify(created));
        expect(starts).toHaveBeenCalledTimes(4);
        const status = await runtime.getStatus(
            { protocolVersion: 1, meetingId: created.result.meetingId },
            captain
        );
        expect(status).toMatchObject({
            ok: true,
            meetingVersion: 1,
            result: {
                status: "running",
                activeAgendaItem: { id: "agenda-agenda-1", status: "discussing" },
                contributions: { reviewerId: "participant-three", tasks: [] }
            }
        });
        if (!status.ok) throw new Error(JSON.stringify(status));
        expect(status.result).not.toHaveProperty("currentTurn");
        expect(await runtime.createMeeting(input, captain, new AbortController().signal)).toEqual(
            created
        );
        expect(starts).toHaveBeenCalledTimes(4);
        await runtime.dispose();
    });

    it.each([
        { evidenceReviewerKey: undefined },
        { evidenceReviewerKey: "missing" },
        { selectionMode: "round_robin" },
        { limits: { maxTurns: 1 } }
    ])("rejects invalid current creation before provisioning: %j", async (override) => {
        const root = await mkdtemp(join(tmpdir(), "convivium-contribution-invalid-"));
        roots.push(root);
        const starts = vi.fn();
        const runtime = localRuntime(root, { startContinuable: starts });
        const result = await runtime.createMeeting(
            { ...input, ...override } as never,
            {
                sessionId: "captain-invalid-contribution",
                kind: "captain",
                agent: { id: "captain-invalid-contribution" } as never
            },
            new AbortController().signal
        );
        expect(result).toMatchObject({ ok: false, code: "INVALID_ARGUMENT" });
        expect(starts).not.toHaveBeenCalled();
        expect(await runtime.listLocalMeetings()).toMatchObject({ result: { meetings: [] } });
        await runtime.dispose();
    });

    it("rejects a retired Turn write without changing the contribution meeting", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-retired-turn-"));
        roots.push(root);
        const runtime = localRuntime(root);
        const captain = {
            sessionId: "captain-retired-turn",
            kind: "captain" as const,
            agent: { id: "captain-retired-turn" } as never
        };
        const created = await runtime.createMeeting(input, captain, new AbortController().signal);
        if (!created.ok) throw new Error(JSON.stringify(created));
        const participant = {
            sessionId: `${created.result.meetingId}-participant-participant-one`,
            meetingId: created.result.meetingId,
            participantId: "participant-one",
            kind: "participant" as const
        };
        expect(
            await runtime.raiseHand(
                {
                    protocolVersion: 1,
                    meetingId: created.result.meetingId,
                    requestId: "retired-hand-raise",
                    reason: "Retired entry",
                    summary: "Must use contributions",
                    taskIds: [],
                    agendaItemId: "agenda-agenda-1",
                    priority: "normal"
                },
                participant
            )
        ).toMatchObject({ ok: false, code: "UNSUPPORTED_CAPABILITY" });
        expect(
            await runtime.getStatus(
                { protocolVersion: 1, meetingId: created.result.meetingId },
                captain
            )
        ).toMatchObject({ ok: true, meetingVersion: created.meetingVersion });
        await runtime.dispose();
    });

    it("does not provision, migrate or delete a stored Meeting without contribution state", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-legacy-create-"));
        roots.push(root);
        const captain = {
            sessionId: "captain-legacy",
            kind: "captain" as const,
            agent: { id: "captain-legacy" } as never
        };
        const initial = localRuntime(root);
        const created = await initial.createMeeting(input, captain, new AbortController().signal);
        if (!created.ok) throw new Error(JSON.stringify(created));
        await initial.dispose();

        const registry = await openTestRegistry(root);
        const repository = await openMeetingRepository({
            registry: Promise.resolve(registry),
            teamId: input.teamId,
            meetingId: created.result.meetingId
        });
        const current = await repository.read();
        await repository.execute({
            requestId: "remove-contribution-state",
            commandKind: "test_legacy_fixture",
            authorization: {
                callerBinding: "test:fixture",
                capabilityId: "test:fixture"
            },
            requestHash: "remove-contribution-state",
            expectedMeetingVersion: current.version,
            transition: (snapshot) => {
                const { contributions: _contributions, ...legacyState } = snapshot.state as {
                    readonly contributions?: unknown;
                } & Record<string, unknown>;
                return {
                    state: legacyState as never,
                    result: { status: "legacy_fixture" },
                    events: [
                        {
                            type: "meeting.started",
                            payload: { meetingId: snapshot.meetingId }
                        }
                    ],
                    outbox: []
                };
            }
        });
        const beforeRecovery = JSON.stringify((await repository.read()).state);
        await registry.close();

        const starts = vi.fn();
        const recovered = localRuntime(root, { startContinuable: starts });
        await expect(
            recovered.getStatus(
                { protocolVersion: 1, meetingId: created.result.meetingId },
                { sessionId: "captain-legacy", kind: "captain" }
            )
        ).resolves.toMatchObject({ ok: false, code: "MEETING_NOT_FOUND" });
        expect(starts).not.toHaveBeenCalled();
        await recovered.dispose();

        const verificationRegistry = await openTestRegistry(root);
        const verificationRepository = await openMeetingRepository({
            registry: Promise.resolve(verificationRegistry),
            teamId: input.teamId,
            meetingId: created.result.meetingId
        });
        expect(JSON.stringify((await verificationRepository.read()).state)).toBe(beforeRecovery);
        await verificationRegistry.close();
    });
});

const selected = {
    ...input,
    evidenceReviewerKey: "c",
    managerAgentDefinitionId: "fr14-manager",
    participants: [
        { participantKey: "a", displayName: "A", agentDefinitionId: "fr14-participant" },
        { participantKey: "b", displayName: "B" },
        { participantKey: "c", displayName: "C" }
    ],
    agenda: [{ ...input.agenda[0], requiredParticipantKeys: ["a", "b", "c"] }]
};

describe("Agent Definition creation and replay contract", () => {
    async function fixture(failure?: "child" | "abort", existingRoot?: string) {
        const root = existingRoot ?? (await mkdtemp(join(tmpdir(), "convivium-fr14-contract-")));
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
            agentModelOverrides: structuredClone(roleCompositionModelOverrides),
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
                sendMessage: async () => "followup",
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
            expect(f.starts[0].request.persona).toBe(
                "FR14_MANAGER_V1\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：fr14-fixture。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。"
            );
            expect(f.starts[1].request.persona).toBe(
                "FR14_PARTICIPANT_V1\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：fr14-fixture。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。"
            );
            expect(f.starts[0].request.agentOptions).toEqual(
                roleCompositionModelOverrides["fr14-manager"]
            );
            expect(f.starts[1].request.agentOptions).toEqual(
                roleCompositionModelOverrides["fr14-participant"]
            );
            f.definitions[0].roleDescription = "FR14_MANAGER_V2";
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
            expect(f.starts[4].request.persona).toBe(
                "FR14_MANAGER_V2\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：fr14-fixture。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。"
            );
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
    it("replays failed creation after skills recover without provisioning, including after restart", async () => {
        const f = await fixture();
        try {
            f.get.mockResolvedValue(undefined);
            const failed = await f.runtime.createMeeting(selected, f.captain, f.controller.signal);
            expect(failed).toMatchObject({
                ok: false,
                code: "UNSUPPORTED_CAPABILITY",
                retryable: false
            });
            f.get.mockResolvedValue(f.skill);
            expect(await f.runtime.createMeeting(selected, f.captain, f.controller.signal)).toEqual(
                failed
            );
            expect(f.starts).toEqual([]);
            expect(f.get).toHaveBeenCalledTimes(1);
            await f.runtime.dispose();
            const restarted = await fixture(undefined, f.root);
            try {
                expect(
                    await restarted.runtime.createMeeting(
                        selected,
                        restarted.captain,
                        restarted.controller.signal
                    )
                ).toEqual(failed);
                expect(restarted.starts).toEqual([]);
                expect(restarted.get).not.toHaveBeenCalled();
                expect(await restarted.runtime.listLocalMeetings()).toMatchObject({
                    result: { meetings: [] }
                });
                expect(
                    await restarted.runtime.createMeeting(
                        { ...selected, requestId: "recovered-skill" },
                        restarted.captain,
                        restarted.controller.signal
                    )
                ).toMatchObject({ ok: true });
                expect(restarted.starts).toHaveLength(4);
            } finally {
                await restarted.runtime.dispose();
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
