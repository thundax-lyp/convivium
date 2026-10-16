import { expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { createMeetingNoticeDispatcher } from "@/runtime/services/meeting-notice-dispatch.ts";

it.each(
    ["meeting_started", "meeting_resumed"].flatMap((noticeKind) =>
        ["flush-false", "post-revoke", "after-flush-crash"].map((mode) => ({ noticeKind, mode }))
    )
)(
    "keeps $noticeKind/$mode retryable using the original delivery id",
    async ({ noticeKind, mode }) => {
        const state = makeRunningMeetingStateV1();
        state.identities[0].sessionOwnershipId = "owner";
        const ownership = {
            id: "owner",
            meetingId: state.id,
            identityId: state.identities[0].id,
            sessionId: "peer-session",
            definition: { agentDefinitionId: "fixture" },
            role: "manager",
            lifecycleStatus: "active",
            capabilityStatus: "active"
        };
        const owner = {
            resume: vi.fn(async () => {}),
            deliver: vi.fn(async ({ authorize }) => {
                await authorize();
                if (mode === "post-revoke") {
                    ownership.capabilityStatus = "revoked";
                }
                await authorize();
                if (mode === "after-flush-crash") {
                    throw new Error("crash after persisted input");
                }
                return false;
            })
        };
        const dispatcher = createMeetingNoticeDispatcher({
            owner,
            definitions: [{ agentDefinitionId: "fixture" }],
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
                    noticeKind,
                    recipientId: ownership.identityId,
                    ...(noticeKind === "meeting_started" ? { agendaId: "agenda-v1" } : {})
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

it.each(["meeting_started", "meeting_resumed"])(
    "does not replay accepted ACP %s input when an outbox lease is reacquired after an unknown outcome",
    async (noticeKind) => {
        const state = makeRunningMeetingStateV1();
        state.identities[0].sessionOwnershipId = "owner";
        const ownership = {
            id: "owner",
            meetingId: state.id,
            identityId: state.identities[0].id,
            sessionId: "peer-session",
            definition: { agentDefinitionId: "fixture" },
            role: "manager",
            agentOptions: { provider: "acp-codex", model: "scripted-codex" },
            lifecycleStatus: "active",
            capabilityStatus: "active"
        };
        let block: { code: "ACP_CODEX_OUTCOME_UNKNOWN"; since: number } | undefined;
        const owner = {
            resume: vi.fn(async () => {}),
            deliver: vi.fn(async () => {
                block = { code: "ACP_CODEX_OUTCOME_UNKNOWN", since: Date.now() };
                throw new Error("connection lost after input acceptance");
            })
        };
        const execute = vi.fn();
        const dispatcher = createMeetingNoticeDispatcher({
            owner,
            definitions: [{ agentDefinitionId: "fixture" }],
            repository: {
                recover: async () => ({
                    snapshot: { meetingId: state.id, state },
                    sessionOwnership: [ownership]
                })
            },
            application: { execute },
            acpCodex: { blockFor: () => block }
        });
        for (const [attempts, leaseToken] of [
            [1, "original"],
            [999, "reacquired"]
        ]) {
            await expect(
                dispatcher.dispatch({
                    outboxItem: {
                        id: "effect",
                        deliveryId: "stable-delivery",
                        kind: "dispatch",
                        attempts,
                        leaseToken,
                        payload: {
                            kind: "agent_notice",
                            noticeKind,
                            recipientId: ownership.identityId,
                            ...(noticeKind === "meeting_started" ? { agendaId: "agenda-v1" } : {})
                        }
                    },
                    signal: new AbortController().signal
                })
            ).rejects.toMatchObject({
                code: "ACP_CODEX_OUTCOME_UNKNOWN",
                retryable: true,
                terminalOnAttemptLimit: false
            });
        }
        expect(owner.deliver).toHaveBeenCalledOnce();
        expect(owner.resume).toHaveBeenCalledOnce();
        expect(execute).not.toHaveBeenCalled();
    }
);
