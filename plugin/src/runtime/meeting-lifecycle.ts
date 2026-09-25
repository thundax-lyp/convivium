import dshAgentPackage from "@deepseek-ai/dsh-agent/package.json" with { type: "json" };
import type { Context } from "@deepseek-ai/cordis";
import { randomUUID } from "node:crypto";
import type { Config } from "@/config.js";
import type { MeetingState } from "@/domain/index.js";
import type { MeetingCommand, ReadMeetingRequest } from "@/protocol/index.js";
import { MeetingCommandResultSchema } from "@/protocol/index.js";
import { projectMeetingSummary, projectMeetingView } from "@/projection/index.js";
import { decodeMeetingState, encodeMeetingState } from "@/repository/domain/meeting-state-codec.js";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import {
    createMeetingCommandApplication,
    DEADLINE_HANDLER_PRINCIPAL_ID,
    RUNTIME_RECOVERY_PRINCIPAL_ID,
    type MeetingCommandApplication
} from "./application-service/meeting-command.js";
import { createMeetingIdentityEffectHandler } from "./application-service/meeting-identity.js";
import { createMeetingCreationCoordinator } from "./meeting-runtime.js";
import { requireContinuableProvider, type RoleCatalogPort } from "@/dsh/index.js";
import type { MeetingOwnershipLookup } from "@/dsh/index.js";
import type { LocalMeetingWebRuntime } from "./index.js";
import { createOutboxWorker } from "./outbox-worker.js";
import { createMeetingNoticeDispatcher } from "./services/meeting-notice-dispatch.js";
import {
    createMeetingIdentityReader,
    type MeetingIdentityReader
} from "./services/meeting-identity-read.js";
import { createMeetingArchiveDispatcher } from "./services/meeting-archive.js";
import {
    createEvidenceReviewDispatcher,
    createReviewDeliveryDispatcher
} from "./services/evidence-review-dispatch.js";
import { provisionMeetingIdentity } from "./services/meeting-identity-provision.js";
import type { MeetingIdentityProvisionDependencies } from "./services/meeting-identity-provision.js";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { OutboxItem } from "@/repository/types.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";

export function createTargetMeetingEffectDispatcher(dependencies: {
    readonly parent: Agent;
    readonly identity: { dispatch(item: OutboxItem, signal: AbortSignal): Promise<void> };
    readonly notice: {
        dispatch(input: {
            outboxItem: OutboxItem;
            parent: Agent;
            signal: AbortSignal;
        }): Promise<void>;
    };
    readonly archive: {
        dispatch(input: {
            outboxItem: OutboxItem;
            parent: Agent;
            signal: AbortSignal;
        }): Promise<void>;
    };
    readonly review: {
        dispatch(input: {
            outboxItem: OutboxItem;
            parent: Agent;
            signal: AbortSignal;
        }): Promise<void>;
    };
    readonly reviewDelivery: {
        dispatch(input: {
            outboxItem: OutboxItem;
            parent: Agent;
            signal: AbortSignal;
        }): Promise<void>;
    };
}): (item: OutboxItem, signal: AbortSignal) => Promise<void> {
    return async (item, signal) => {
        const payload = item.payload as { kind?: string; noticeKind?: string };
        if (payload.kind === "identity_provision")
            return dependencies.identity.dispatch(item, signal);
        if (payload.kind === "agent_notice" && payload.noticeKind === "review_request")
            return dependencies.review.dispatch({
                outboxItem: item,
                parent: dependencies.parent,
                signal
            });
        if (payload.kind === "agent_notice")
            return dependencies.notice.dispatch({
                outboxItem: item,
                parent: dependencies.parent,
                signal
            });
        if (payload.kind === "archive")
            return dependencies.archive.dispatch({
                outboxItem: item,
                parent: dependencies.parent,
                signal
            });
        if (payload.kind === "review_delivery")
            return dependencies.reviewDelivery.dispatch({
                outboxItem: item,
                parent: dependencies.parent,
                signal
            });
        throw new Error("OUTBOX_ROUTE_UNAVAILABLE");
    };
}

export async function recoverTargetMeetingDeliveries(dependencies: {
    readonly registry: Pick<DomainRepositoryRegistry<MeetingState>, "listMeetings" | "openMeeting">;
    readonly agents: Pick<Context["agents"], "get">;
    readonly ensureDelivery: (meetingId: string, parent: Agent) => void | Promise<void>;
}): Promise<void> {
    for (const record of dependencies.registry.listMeetings()) {
        const repository = await dependencies.registry.openMeeting({ meetingId: record.meetingId });
        const recovered = await repository.recover();
        if (
            recovered.bootstrap.status !== "ready" ||
            recovered.snapshot === undefined ||
            recovered.snapshot.state.lifecycle.status === "archived"
        )
            continue;
        const parentIds = new Set(recovered.sessionOwnership.map((item) => item.parentSessionId));
        if (parentIds.size !== 1) continue;
        const parentId = [...parentIds][0];
        if (parentId === undefined) continue;
        const parent = dependencies.agents.get(parentId as never);
        if (parent !== undefined) await dependencies.ensureDelivery(record.meetingId, parent);
    }
}

function createIdentityProvisionOwner(dependencies: {
    readonly repository: MeetingRepositoryPort<MeetingState>;
    readonly sessions: Context["subagents"];
    readonly parent: Agent;
}): MeetingIdentityProvisionDependencies["owner"] {
    const { repository, sessions, parent } = dependencies;
    return {
        async readOwnership(admissionId) {
            return (await repository.recover()).sessionOwnership.find(
                (candidate) => candidate.id === `session-ownership:${admissionId}`
            );
        },
        async putProvisioning(owner) {
            const current = (await repository.recover()).sessionOwnership.find(
                (candidate) => candidate.sessionId === owner.sessionId
            );
            if (current !== undefined)
                return current.id === owner.id &&
                    current.meetingId === owner.meetingId &&
                    current.identityId === owner.identityId &&
                    current.parentSessionId === owner.parentSessionId &&
                    current.sessionLabel === owner.sessionLabel &&
                    current.provider === owner.provider
                    ? { kind: "same" as const, owner: current }
                    : { kind: "conflict" as const };
            return {
                kind: "created" as const,
                owner: await repository.recordSessionOwnership(owner)
            };
        },
        async inspectOwnedChild(owner) {
            try {
                const entries = await sessions.listChildren(parent.id as never);
                const entry = entries.find((candidate) => String(candidate.id) === owner.sessionId);
                if (entry === undefined) return "absent" as const;
                return entry.kind === "child" &&
                    entry.mode === "continuable" &&
                    entry.label === owner.sessionLabel
                    ? ("present" as const)
                    : ("unavailable" as const);
            } catch {
                return "unavailable" as const;
            }
        },
        async markActive(owner) {
            if (owner.initialMessageId === undefined) throw new Error("RECOVERY_UNAVAILABLE");
            return repository.recordSessionOwnership({
                ...owner,
                lifecycleStatus: "active"
            });
        },
        async revokeAndDrainOwned(owner) {
            const entries = await sessions.listChildren(parent.id as never);
            const present = entries.some(
                (candidate) =>
                    candidate.kind === "child" &&
                    String(candidate.id) === owner.sessionId &&
                    candidate.mode === "continuable" &&
                    candidate.label === owner.sessionLabel
            );
            await repository.recordSessionOwnership({
                ...owner,
                lifecycleStatus: "closed",
                capabilityStatus: "revoked"
            });
            if (!present) return;
            sessions.interrupt(owner.sessionId as never, {
                kind: "ancestor",
                agent: parent
            });
            await sessions.drainContinuableChildren(parent, [owner.sessionId as never]);
        }
    };
}

const applications = new WeakMap<object, MeetingCommandApplication>();
const runtimes = new WeakMap<object, LocalMeetingWebRuntime & MeetingOwnershipLookup>();
const identityReaders = new WeakMap<object, MeetingIdentityReader>();
const deliveryEnsurers = new WeakMap<
    object,
    (meetingId: string, parent: import("@deepseek-ai/dsh-agent").Agent) => void
>();

export function ensureTargetMeetingDelivery(
    owner: object,
    meetingId: string,
    parent: import("@deepseek-ai/dsh-agent").Agent
): void {
    deliveryEnsurers.get(owner)?.(meetingId, parent);
}

function assertTargetLifecycle(config: Config, ctx: Pick<Context, "subagents">): void {
    if (dshAgentPackage.version !== "0.1.2-rc.1")
        throw new Error("Convivium requires DSH version 0.1.2-rc.1.");
    requireContinuableProvider(ctx.subagents, config.provider);
    const spawn = ctx.subagents.getProvider("spawn");
    if (!spawn || spawn.name !== "spawn" || spawn.capabilities.outputSchema !== true)
        throw new Error('Convivium requires one-shot provider "spawn" with outputSchema.');
    const definitions = parseAgentDefinitions(config.agentDefinitions);
    const expected = new Set([
        "meeting_manager",
        "domain_architect",
        "runtime_engineer",
        "protocol_ui_engineer",
        "verification_reviewer",
        "github_research_analyst",
        "arxiv_research_analyst"
    ]);
    if (
        definitions.length !== 7 ||
        new Set(definitions.map((item) => item.roleDefinitionId)).size !== 7 ||
        definitions.some((item) => !expected.has(item.roleDefinitionId))
    )
        throw new Error("Convivium requires the exact seven enabled Meeting role definitions.");
}

export function getMeetingCommandApplication(owner: object): MeetingCommandApplication {
    const application = applications.get(owner);
    if (!application) throw new Error("Target Meeting application is not active.");
    return application;
}

export function getLocalMeetingWebRuntime(
    owner: object
): LocalMeetingWebRuntime & MeetingOwnershipLookup {
    const runtime = runtimes.get(owner);
    if (!runtime) throw new Error("Target Meeting runtime is not active.");
    return runtime;
}

export const getMeetingIdentityReader = (owner: object): MeetingIdentityReader => {
    const reader = identityReaders.get(owner);
    if (!reader) throw new Error("Target Meeting identity reader is not active.");
    return reader;
};

export async function activateTargetMeetingApplication(
    ctx: Context,
    config: Config,
    options: { rolePackageRoot: string }
): Promise<() => Promise<void>> {
    const { rolePackageRoot } = options;
    if (!rolePackageRoot) throw new Error("Meeting role package root is required.");
    assertTargetLifecycle(config, ctx);
    let sequence = 0;
    const refreshListeners = new Set<(meetingId: string, committedVersion: number) => void>();
    const registry = await DomainRepositoryRegistry.open<MeetingState>({
        storageDomain: ctx.storageDomain,
        codec: { encode: encodeMeetingState, decode: decodeMeetingState },
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        },
        onProjectionCommitted: (snapshot) => {
            for (const listener of refreshListeners) listener(snapshot.meetingId, snapshot.version);
        }
    });
    const definitions = parseAgentDefinitions(config.agentDefinitions);
    const ids = { nextId: (kind: string) => `${kind}-${++sequence}-${randomUUID()}` };
    const catalog = (ctx as Context & { get?: (key: string) => unknown }).get?.(
        "convivium.agentCatalog"
    ) as RoleCatalogPort | undefined;
    const resolveCallerScope = async (input: {
        meetingId: string;
        caller: {
            channel: "dsh_tool" | "loopback_remote" | "runtime_recovery" | "deadline_handler";
            principalId: string;
            sessionBindingId?: string;
        };
    }) => {
        if (input.caller.channel === "loopback_remote")
            return {
                caller: input.caller,
                meetingId: input.meetingId,
                role: "local" as const
            };
        if (
            (input.caller.channel === "runtime_recovery" &&
                input.caller.principalId === RUNTIME_RECOVERY_PRINCIPAL_ID) ||
            (input.caller.channel === "deadline_handler" &&
                input.caller.principalId === DEADLINE_HANDLER_PRINCIPAL_ID)
        )
            return {
                caller: input.caller,
                meetingId: input.meetingId,
                role: "runtime" as const
            };
        if (input.caller.channel !== "dsh_tool" || input.caller.sessionBindingId === undefined)
            return undefined;
        const repository = await registry.openMeeting({ meetingId: input.meetingId });
        const recovery = await repository.recover();
        const ownership = recovery.sessionOwnership.find(
            (item) =>
                item.id === input.caller.sessionBindingId &&
                item.identityId === input.caller.principalId &&
                item.lifecycleStatus === "active" &&
                item.capabilityStatus === "active"
        );
        if (!ownership || !ownership.identityId) return undefined;
        return {
            caller: input.caller,
            meetingId: input.meetingId,
            identityId: ownership.identityId,
            role: ownership.role === "participant" ? ("participant" as const) : ownership.role,
            ownership
        };
    };
    const application = createMeetingCommandApplication({
        registry,
        ids,
        clock: { now: Date.now },
        resolveCallerScope,
        ...(catalog === undefined ? {} : { catalog }),
        creation: createMeetingCreationCoordinator({
            registry,
            definitions,
            agentModelOverrides: config.agentModelOverrides,
            continuable: ctx.subagents,
            provider: config.provider,
            ids
        })
    });
    const identityReader = createMeetingIdentityReader({
        registry,
        ...(catalog === undefined ? {} : { catalog })
    });
    const deliveryWorkers = new Map<string, ReturnType<typeof createOutboxWorker>>();
    const ensureDelivery = async (meetingId: string, parent: Agent): Promise<void> => {
        const repository = await registry.openMeeting({ meetingId });
        const existing = deliveryWorkers.get(meetingId);
        if (existing) {
            existing.wake();
            return;
        }
        const notice = createMeetingNoticeDispatcher({
            sessions: ctx.subagents,
            repository
        });
        const archive = createMeetingArchiveDispatcher({
            sessions: ctx.subagents,
            repository,
            application
        });
        const review = createEvidenceReviewDispatcher({
            sessions: ctx.subagents,
            repository,
            application,
            clock: { now: Date.now }
        });
        const reviewDelivery = createReviewDeliveryDispatcher({
            sessions: ctx.subagents,
            repository,
            application
        });
        const identityOwner = createIdentityProvisionOwner({
            repository,
            sessions: ctx.subagents,
            parent
        });
        const identity = createMeetingIdentityEffectHandler({
            application,
            repository,
            definitions,
            provision: (input) =>
                provisionMeetingIdentity(input, {
                    definitions,
                    agentModelOverrides: config.agentModelOverrides,
                    parent,
                    runtime: ctx.subagents,
                    provider: config.provider,
                    now: Date.now,
                    owner: identityOwner
                }),
            cleanupProvisioned: async (recommendationId) => {
                const ownership = await identityOwner.readOwnership(recommendationId);
                if (ownership !== undefined) await identityOwner.revokeAndDrainOwned(ownership);
            }
        });
        const dispatch = createTargetMeetingEffectDispatcher({
            parent,
            identity,
            notice,
            archive,
            review,
            reviewDelivery
        });
        const worker = createOutboxWorker({
            repository,
            owner: `target-worker:${meetingId}`,
            ttlMs: 60_000,
            batchSize: 1,
            pollMs: 1_000,
            dispatch
        });
        deliveryWorkers.set(meetingId, worker);
        void worker.start().catch(() => undefined);
    };
    deliveryEnsurers.set(ctx, (meetingId, parent) => {
        void ensureDelivery(meetingId, parent);
    });
    await recoverTargetMeetingDeliveries({
        registry,
        agents: ctx.agents,
        ensureDelivery
    });
    (
        ctx as Context & {
            on?: (event: "agent/created", listener: (agent: Agent) => void) => unknown;
        }
    ).on?.("agent/created", () => {
        void recoverTargetMeetingDeliveries({
            registry,
            agents: ctx.agents,
            ensureDelivery
        }).catch((error: unknown) => {
            ctx.logger("convivium:meeting").error("Meeting delivery recovery failed %o", error);
        });
    });
    const runtime = {
        async list(signal: AbortSignal) {
            signal.throwIfAborted();
            const meetings = [];
            for (const record of registry.listMeetings()) {
                const repository = await registry.openMeeting({ meetingId: record.meetingId });
                const snapshot = (await repository.recover()).snapshot;
                if (!snapshot) throw new Error("Meeting is not ready.");
                meetings.push(projectMeetingSummary(snapshot));
            }
            return { meetings };
        },
        async read(request: ReadMeetingRequest, signal: AbortSignal) {
            signal.throwIfAborted();
            const repository = await registry.openMeeting({ meetingId: request.meetingId });
            const snapshot = (await repository.recover()).snapshot;
            if (!snapshot) throw new Error("Meeting is not ready.");
            return projectMeetingView(snapshot, { kind: "local" });
        },
        async control(command: MeetingCommand, signal: AbortSignal) {
            if (!["pause_meeting", "resume_meeting", "end_meeting"].includes(command.action.kind))
                return MeetingCommandResultSchema.parse({
                    kind: "rejected",
                    error: {
                        code: "UNAUTHORIZED",
                        message: "The action is not a local Meeting control."
                    }
                });
            return application.execute(
                command,
                {
                    caller: { channel: "loopback_remote", principalId: "local-controller" }
                },
                signal
            );
        },
        async *subscribeRefresh(signal: AbortSignal) {
            const notices: { meetingId: string; committedVersion: number }[] = [];
            let wake: (() => void) | undefined;
            const listener = (meetingId: string, committedVersion: number) => {
                notices.push({ meetingId, committedVersion });
                wake?.();
            };
            refreshListeners.add(listener);
            try {
                while (!signal.aborted) {
                    if (notices.length === 0)
                        await new Promise<void>((resolve) => {
                            wake = resolve;
                            signal.addEventListener("abort", () => resolve(), { once: true });
                        });
                    while (notices.length > 0) yield { kind: "refresh", ...notices.shift()! };
                }
            } finally {
                refreshListeners.delete(listener);
                wake = undefined;
            }
        },
        async findBySessionId(sessionId: string, signal: AbortSignal) {
            signal.throwIfAborted();
            for (const record of registry.listMeetings()) {
                const repository = await registry.openMeeting({ meetingId: record.meetingId });
                const ownership = (await repository.recover()).sessionOwnership.find(
                    (item) => item.sessionId === sessionId
                );
                if (ownership) return { meetingId: record.meetingId, ownership };
            }
            return undefined;
        }
    } satisfies LocalMeetingWebRuntime & MeetingOwnershipLookup;
    applications.set(ctx, application);
    runtimes.set(ctx, runtime);
    identityReaders.set(ctx, identityReader);
    return async () => {
        for (const worker of deliveryWorkers.values()) worker.stop();
        await Promise.all([...deliveryWorkers.values()].map((worker) => worker.wait()));
        deliveryWorkers.clear();
        deliveryEnsurers.delete(ctx);
        runtimes.delete(ctx);
        identityReaders.delete(ctx);
        applications.delete(ctx);
        refreshListeners.clear();
        await registry.close();
    };
}
