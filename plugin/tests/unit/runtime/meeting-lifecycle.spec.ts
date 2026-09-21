import { describe, expect, it, vi } from "vitest";
import {
    createTargetMeetingEffectDispatcher,
    recoverTargetMeetingDeliveries
} from "@/runtime/meeting-lifecycle.js";

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
        const parent = { id: "captain-1" };
        const dispatch = createTargetMeetingEffectDispatcher({
            parent: parent as never,
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
