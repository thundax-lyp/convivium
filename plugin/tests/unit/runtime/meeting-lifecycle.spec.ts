import { describe, expect, it, vi } from "vitest";
import {
    activateTargetMeetingApplication,
    createTargetMeetingEffectDispatcher,
    getLocalMeetingWebRuntime
} from "@/runtime/meeting-lifecycle.ts";
import { StorageDomainRepositoryRegistry } from "@/repository/storage-domain/storage-domain-repository-registry.ts";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import roleResources from "../../../config/definitions.json" with { type: "json" };

const item = (kind: string) =>
    ({
        id: `effect-${kind}`,
        deliveryId: `effect-${kind}`,
        kind: "dispatch",
        priority: 1,
        payload: { kind, recommendationId: "recommendation-1", admissionId: "recommendation-1" },
        attempts: 1,
        leaseOwner: "worker",
        leaseToken: "token",
        leaseDeadline: 2
    }) as never;

describe("target Meeting effect routing", () => {
    it("dispatches identity_provision through the identity effect handler", async () => {
        const identity = { dispatch: vi.fn(async () => undefined) };
        const notice = { dispatch: vi.fn(async () => undefined) };
        const archive = { dispatch: vi.fn(async () => undefined) };
        const review = { dispatch: vi.fn(async () => undefined) };
        const reviewDelivery = { dispatch: vi.fn(async () => undefined) };
        const dispatch = createTargetMeetingEffectDispatcher({
            identity,
            notice,
            archive,
            review,
            reviewDelivery
        });
        const effect = item("identity_provision");
        const signal = new AbortController().signal;

        await dispatch(effect, signal);

        expect(identity.dispatch).toHaveBeenCalledWith(effect, signal);
        expect(notice.dispatch).not.toHaveBeenCalled();
        expect(archive.dispatch).not.toHaveBeenCalled();
        expect(review.dispatch).not.toHaveBeenCalled();
        expect(reviewDelivery.dispatch).not.toHaveBeenCalled();
    });
});

describe("target Meeting list", () => {
    it("registers tools before recovery and rejects a list with an unavailable Meeting", async () => {
        const state = makeRunningMeetingStateV1();
        let toolsReady = false;
        const ready = {
            bootstrap: { status: "ready" },
            snapshot: {
                meetingId: state.id,
                version: state.version,
                state,
                createdAt: 0,
                updatedAt: 1
            },
            sessionOwnership: []
        };
        const unavailable = {
            bootstrap: { status: "ready" },
            snapshot: undefined,
            sessionOwnership: []
        };
        const registry = {
            listMeetings: () => {
                if (!toolsReady) {
                    throw new Error("Meeting tools must register before recovery");
                }
                return [{ meetingId: state.id }, { meetingId: "meeting-unavailable" }];
            },
            openMeeting: async ({ meetingId }: { meetingId: string }) => ({
                recover: async () => (meetingId === state.id ? ready : unavailable)
            }),
            close: async () => undefined
        };
        const open = vi
            .spyOn(StorageDomainRepositoryRegistry, "open")
            .mockResolvedValue(registry as never);
        const owner = {
            storageDomain: {},
            logger: () => ({ error: vi.fn() }),
            subagents: {
                getProvider: () => ({
                    name: "spawn",
                    capabilities: { outputSchema: true },
                    prepareContinuable: async () => ({})
                })
            },
            agents: { get: () => undefined }
        };
        const config = {
            provider: "spawn",
            maxParticipants: 3,
            speakerTimeoutMs: 60_000,
            outboxPollMs: 1_000,
            agentDefinitions: roleResources.definitions
        };
        const dispose = await activateTargetMeetingApplication(owner as never, config, {
            rolePackageRoot: "/fixture",
            onBeforeRecovery: () => {
                toolsReady = true;
            }
        });

        try {
            await expect(
                getLocalMeetingWebRuntime(owner).list(new AbortController().signal)
            ).rejects.toThrow("Meeting is not ready.");
        } finally {
            await dispose();
            open.mockRestore();
        }
    });
});

it("refreshes safe ACP diagnostics at the committed domain version without writing Meeting facts", async () => {
    const state = makeRunningMeetingStateV1();
    state.identities[0].sessionOwnershipId = "owner";
    const snapshot = {
        meetingId: state.id,
        version: state.version,
        state,
        createdAt: 0,
        updatedAt: 1
    };
    let records: { meetingId: string }[] = [];
    const repository = {
        recover: async () => ({
            snapshot,
            sessionOwnership: [
                {
                    id: "owner",
                    meetingId: state.id,
                    identityId: state.identities[0].id,
                    sessionId: "root"
                }
            ]
        }),
        readCommittedEvents: async () => ({ events: [] })
    };
    const registry = {
        listMeetings: () => records,
        openMeeting: async () => repository,
        close: vi.fn(async () => {})
    };
    const open = vi
        .spyOn(StorageDomainRepositoryRegistry, "open")
        .mockResolvedValue(registry as never);
    let block: { code: "ACP_CODEX_OUTCOME_UNKNOWN"; since: number; path: string } | undefined;
    let notify!: (root: string) => void;
    const unsubscribe = vi.fn();
    const ctx = {
        storageDomain: {},
        logger: () => ({ error: vi.fn() }),
        agents: { get: () => undefined },
        subagents: {
            getProvider: () => ({
                name: "spawn",
                capabilities: { outputSchema: true },
                prepareContinuable: async () => ({})
            })
        }
    };
    const dispose = await activateTargetMeetingApplication(
        ctx as never,
        {
            provider: "spawn",
            maxParticipants: 3,
            speakerTimeoutMs: 60000,
            outboxPollMs: 1000,
            agentDefinitions: roleResources.definitions
        },
        {
            rolePackageRoot: "/fixture",
            acpCodex: {
                blockFor: () => block,
                subscribeBlocks: (listener) => {
                    notify = listener;
                    return unsubscribe;
                }
            }
        }
    );
    const signal = new AbortController();
    try {
        const runtime = getLocalMeetingWebRuntime(ctx);
        expect(
            (await runtime.read({ protocolVersion: 1, meetingId: state.id }, signal.signal))
                .executionBlocks
        ).toBeUndefined();
        records = [{ meetingId: state.id }];
        const stream = runtime.subscribeRefresh(signal.signal);
        const next = stream.next();
        block = { code: "ACP_CODEX_OUTCOME_UNKNOWN", since: 123, path: "/private/internal" };
        notify("root");
        expect((await next).value).toEqual({
            kind: "refresh",
            meetingId: state.id,
            committedVersion: state.version
        });
        const view = await runtime.read({ protocolVersion: 1, meetingId: state.id }, signal.signal);
        expect(view.executionBlocks).toEqual([
            {
                identityId: state.identities[0].id,
                code: block.code,
                since: 123,
                allowedActions: ["pause_meeting", "end_meeting"]
            }
        ]);
        expect(JSON.stringify(view)).not.toContain("/private/internal");
        signal.abort();
        await stream.return();
    } finally {
        signal.abort();
        await dispose();
        open.mockRestore();
    }
    expect(unsubscribe).toHaveBeenCalledOnce();
});
