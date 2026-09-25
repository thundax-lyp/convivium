import { describe, expect, it, vi } from "vitest";
import {
    activateTargetMeetingApplication,
    createTargetMeetingEffectDispatcher,
    getLocalMeetingWebRuntime,
    recoverTargetMeetingDeliveries
} from "@/runtime/meeting-lifecycle.js";
import { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
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

describe("target Meeting delivery recovery", () => {
    it("restarts delivery for a persisted non-archived Meeting with its exact live parent", async () => {
        const parent = { id: "captain-1" };
        const ensureDelivery = vi.fn(async () => undefined);
        const recover = vi.fn(async () => ({
            bootstrap: { status: "ready" },
            snapshot: { state: { lifecycle: { status: "running" } } },
            sessionOwnership: [{ parentSessionId: "captain-1" }]
        }));
        await recoverTargetMeetingDeliveries({
            registry: {
                listMeetings: () => [{ meetingId: "meeting-1" }],
                openMeeting: async () => ({ recover })
            } as never,
            agents: { get: (id: string) => (id === "captain-1" ? parent : undefined) } as never,
            ensureDelivery
        });

        expect(ensureDelivery).toHaveBeenCalledWith("meeting-1", parent);
    });
});

describe("target Meeting list", () => {
    it("rejects the whole list when a discovered Meeting has no recoverable snapshot", async () => {
        const state = makeRunningMeetingStateV1();
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
            listMeetings: () => [{ meetingId: state.id }, { meetingId: "meeting-unavailable" }],
            openMeeting: async ({ meetingId }: { meetingId: string }) => ({
                recover: async () => (meetingId === state.id ? ready : unavailable)
            }),
            close: async () => undefined
        };
        const open = vi
            .spyOn(DomainRepositoryRegistry, "open")
            .mockResolvedValue(registry as never);
        const owner = {
            storageDomain: {},
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
            rolePackageRoot: "/fixture"
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
