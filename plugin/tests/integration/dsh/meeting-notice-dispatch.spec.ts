import { expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.js";
import { createMeetingNoticeDispatcher } from "@/runtime/services/meeting-notice-dispatch.js";

it.each(["flush-false", "post-revoke", "after-flush-crash"])(
    "keeps %s retryable using the original delivery id",
    async (mode) => {
        const state = makeRunningMeetingStateV1();
        state.identities[0].sessionOwnershipId = "owner";
        const ownership = {
            id: "owner",
            meetingId: state.id,
            identityId: state.identities[0].id,
            sessionId: "peer-session",
            definition: { agentDefinitionId: "fixture", definitionVersion: "1" },
            role: "manager",
            lifecycleStatus: "active",
            capabilityStatus: "active"
        };
        const owner = {
            resume: vi.fn(async () => {}),
            deliver: vi.fn(async ({ authorize }) => {
                await authorize();
                if (mode === "post-revoke") ownership.capabilityStatus = "revoked";
                await authorize();
                if (mode === "after-flush-crash") throw new Error("crash after persisted input");
                return false;
            })
        };
        const dispatcher = createMeetingNoticeDispatcher({
            owner,
            definitions: [{ agentDefinitionId: "fixture", definitionVersion: "1" }],
            repository: {
                recover: async () => ({
                    snapshot: { meetingId: state.id, state },
                    sessionOwnership: [ownership]
                })
            }
        });
        const input = {
            outboxItem: {
                id: "effect",
                deliveryId: "stable-delivery",
                kind: "dispatch",
                payload: {
                    kind: "agent_notice",
                    noticeKind: "meeting_started",
                    recipientId: ownership.identityId,
                    agendaId: "agenda-v1"
                }
            },
            signal: new AbortController().signal
        };
        await expect(dispatcher.dispatch(input)).rejects.toThrow();
        ownership.capabilityStatus = "active";
        owner.deliver.mockImplementation(async ({ authorize }) => {
            await authorize();
            await authorize();
            return true;
        });
        await expect(dispatcher.dispatch(input)).resolves.toBeUndefined();
        expect(owner.deliver.mock.calls.map(([value]) => value.deliveryId)).toEqual([
            "stable-delivery",
            "stable-delivery"
        ]);
    }
);
