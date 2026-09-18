import dshAgentPackage from "@deepseek-ai/dsh-agent/package.json" with { type: "json" };
import type { Context } from "@deepseek-ai/cordis";
import { randomUUID } from "node:crypto";
import type { Config } from "@/config.js";
import type { MeetingState } from "@/domain/index.js";
import type { MeetingCommandV1, ReadMeetingRequestV1 } from "@/protocol/index.js";
import { MeetingCommandResultV1Schema } from "@/protocol/index.js";
import { projectMeetingSummaryV1, projectMeetingViewV1 } from "@/projection/index.js";
import {
    decodeMeetingStateV1,
    encodeMeetingStateV1
} from "@/repository/domain/meeting-state-codec-v1.js";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import {
    createMeetingCommandApplicationV1,
    type MeetingCommandApplicationV1
} from "./application-service/meeting-command-v1.js";
import { createMeetingCreationCoordinatorV1 } from "./meeting-runtime.js";
import { requireContinuableProvider } from "@/dsh/index.js";
import type { MeetingOwnershipLookupV1 } from "@/dsh/index.js";
import type { LocalMeetingWebRuntime } from "./index.js";
import { createMeetingDeliveryWorkerService } from "./services/meeting-dispatch-service.js";
import { createMeetingNoticeDispatcherV1 } from "./services/meeting-notice-dispatch-v1.js";
import { createMeetingArchiveDispatcherV1 } from "./services/meeting-archive-v1.js";
import {
    createEvidenceReviewDispatcherV1,
    createReviewDeliveryDispatcherV1
} from "./services/evidence-review-dispatch-v1.js";

const applications = new WeakMap<object, MeetingCommandApplicationV1>();
const runtimes = new WeakMap<object, LocalMeetingWebRuntime & MeetingOwnershipLookupV1>();
const deliveryEnsurers = new WeakMap<
    object,
    (meetingId: string, parent: import("@deepseek-ai/dsh-agent").Agent) => void
>();

export function ensureTargetMeetingDeliveryV1(
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
        "arxiv_research_analyst",
        "web_research_analyst"
    ]);
    if (
        definitions.length !== 8 ||
        new Set(definitions.map((item) => item.roleDefinitionId)).size !== 8 ||
        definitions.some((item) => !expected.has(item.roleDefinitionId))
    )
        throw new Error("Convivium requires the exact eight Meeting role definitions.");
}

export function getMeetingCommandApplicationV1(owner: object): MeetingCommandApplicationV1 {
    const application = applications.get(owner);
    if (!application) throw new Error("Target Meeting application is not active.");
    return application;
}

export function getLocalMeetingWebRuntimeV1(
    owner: object
): LocalMeetingWebRuntime & MeetingOwnershipLookupV1 {
    const runtime = runtimes.get(owner);
    if (!runtime) throw new Error("Target Meeting runtime is not active.");
    return runtime;
}

export async function activateTargetMeetingApplicationV1(
    ctx: Context,
    config: Config
): Promise<() => Promise<void>> {
    assertTargetLifecycle(config, ctx);
    let sequence = 0;
    const refreshListeners = new Set<(meetingId: string, committedVersion: number) => void>();
    const registry = await DomainRepositoryRegistry.open<MeetingState>({
        storageDomain: ctx.storageDomain,
        codec: { encode: encodeMeetingStateV1, decode: decodeMeetingStateV1 },
        authorizationValidator: {
            validateCreate: () => undefined,
            validateCommand: () => undefined
        },
        onProjectionCommitted: (snapshot) => {
            for (const listener of refreshListeners) listener(snapshot.meetingId, snapshot.version);
        }
    });
    const ids = { nextId: (kind: string) => `${kind}-${++sequence}-${randomUUID()}` };
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
    const application = createMeetingCommandApplicationV1({
        registry,
        ids,
        clock: { now: Date.now },
        resolveCallerScope,
        creation: createMeetingCreationCoordinatorV1({
            registry,
            definitions: parseAgentDefinitions(config.agentDefinitions),
            agentModelOverrides: config.agentModelOverrides,
            continuable: ctx.subagents,
            provider: config.provider,
            ids
        })
    });
    const deliveryWorkers = createMeetingDeliveryWorkerService({ pollMs: 1000 });
    const ensureDelivery = (meetingId: string, parent: import("@deepseek-ai/dsh-agent").Agent) => {
        void registry.openMeeting({ meetingId }).then((repository) => {
            const notice = createMeetingNoticeDispatcherV1({
                sessions: ctx.subagents,
                repository
            });
            const archive = createMeetingArchiveDispatcherV1({
                sessions: ctx.subagents,
                repository,
                application
            });
            const review = createEvidenceReviewDispatcherV1({
                sessions: ctx.subagents,
                repository
            });
            const reviewDelivery = createReviewDeliveryDispatcherV1({
                sessions: ctx.subagents,
                repository,
                application
            });
            deliveryWorkers.ensure({
                meetingId,
                repository,
                parent,
                dispatch: (item, signal) => {
                    const payload = item.payload as { kind?: string; noticeKind?: string };
                    if (payload.kind === "agent_notice" && payload.noticeKind === "review_request")
                        return review.dispatch({ outboxItem: item, parent, signal });
                    if (payload.kind === "agent_notice")
                        return notice.dispatch({ outboxItem: item, parent, signal });
                    if (payload.kind === "archive")
                        return archive.dispatch({ outboxItem: item, parent, signal });
                    if (payload.kind === "review_delivery")
                        return reviewDelivery.dispatch({ outboxItem: item, parent, signal });
                    throw new Error("OUTBOX_ROUTE_UNAVAILABLE");
                }
            });
        });
    };
    deliveryEnsurers.set(ctx, ensureDelivery);
    const runtime = {
        async list(signal: AbortSignal) {
            signal.throwIfAborted();
            const meetings = [];
            for (const record of registry.listMeetings()) {
                const repository = await registry.openMeeting({ meetingId: record.meetingId });
                const snapshot = (await repository.recover()).snapshot;
                if (snapshot) meetings.push(projectMeetingSummaryV1(snapshot));
            }
            return { meetings };
        },
        async read(request: ReadMeetingRequestV1, signal: AbortSignal) {
            signal.throwIfAborted();
            const repository = await registry.openMeeting({ meetingId: request.meetingId });
            const snapshot = (await repository.recover()).snapshot;
            if (!snapshot) throw new Error("Meeting is not ready.");
            return projectMeetingViewV1(snapshot, { kind: "local" });
        },
        async control(command: MeetingCommandV1, signal: AbortSignal) {
            if (command.action.kind !== "end_meeting")
                return MeetingCommandResultV1Schema.parse({
                    kind: "rejected",
                    error: { code: "UNAUTHORIZED", message: "Only end_meeting is a local control." }
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
    } satisfies LocalMeetingWebRuntime & MeetingOwnershipLookupV1;
    applications.set(ctx, application);
    runtimes.set(ctx, runtime);
    return async () => {
        await deliveryWorkers.dispose();
        deliveryEnsurers.delete(ctx);
        runtimes.delete(ctx);
        applications.delete(ctx);
        refreshListeners.clear();
        await registry.close();
    };
}
