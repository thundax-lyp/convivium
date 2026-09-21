import { describe, expect, it } from "vitest";
import {
    cancelPrivateMail,
    completePrivateMail,
    expirePrivateMail,
    sendPrivateMail,
    startPrivateMail
} from "@/domain/transitions/private-mail.js";
import type { MeetingState } from "@/domain/meeting-state.js";
import {
    expectPrivateMailRejection as rejected,
    privateMailInput as input,
    privateMailState,
    privateMailStateWithContribution as withContribution
} from "./private-mail-fixtures.js";

describe("private mail send and start", () => {
    it("sends queued mail with fixed context, deadline, and session effect", () => {
        const before = privateMailState();
        const result = sendPrivateMail(before, {
            mailId: "mail-1",
            senderId: "sender",
            recipientId: "recipient",
            body: "hello",
            relatedIds: ["pub-1"],
            now: 10
        });
        expect(result.kind).toBe("accepted");
        if (result.kind === "accepted") {
            expect(result.state.privateMails[0]).toEqual({
                id: "mail-1",
                senderId: "sender",
                recipientId: "recipient",
                body: "hello",
                relatedIds: ["pub-1"],
                sendContextPublicationUpperBound: ["pub-1"],
                status: "queued",
                deadlineAt: 110,
                createdAt: 10
            });
            expect(result.effectRequests).toEqual([
                {
                    kind: "session_mail",
                    mailId: "mail-1",
                    recipientId: "recipient",
                    contextPublicationUpperBound: ["pub-1"]
                }
            ]);
            expect(result.state.version).toBe(2);
        }
    });
    it("starts queued mail and fixes processing context", () => {
        const sent = sendPrivateMail(privateMailState(), {
            mailId: "mail-1",
            senderId: "sender",
            recipientId: "recipient",
            body: "hello",
            relatedIds: ["pub-1"],
            now: 10
        });
        expect(sent.kind).toBe("accepted");
        if (sent.kind === "accepted") {
            const result = startPrivateMail(sent.state, {
                mailId: "mail-1",
                actorKind: "effect_dispatcher",
                now: 20
            });
            expect(result.kind).toBe("accepted");
            if (result.kind === "accepted")
                expect(result.state.privateMails[0]).toMatchObject({
                    status: "processing",
                    processingContextPublicationUpperBound: ["pub-1"],
                    processingStartedAt: 20
                });
        }
    });

    it("captures all publications added after send while preserving send prefix", () => {
        const sent = sendPrivateMail(privateMailState(), input);
        expect(sent.kind).toBe("accepted");
        if (sent.kind !== "accepted") return;
        const withLaterPublication = {
            ...sent.state,
            managerPlans: [
                ...sent.state.managerPlans,
                {
                    ...sent.state.managerPlans[0],
                    id: "plan-2"
                }
            ],
            rounds: [
                ...sent.state.rounds,
                {
                    ...sent.state.rounds[0],
                    id: "round-2",
                    planId: "plan-2",
                    publicationId: "pub-2"
                }
            ],
            publications: [
                ...sent.state.publications,
                {
                    ...sent.state.publications[0],
                    id: "pub-2",
                    roundId: "round-2",
                    seq: 2
                }
            ]
        } as MeetingState;
        const result = startPrivateMail(withLaterPublication, {
            mailId: "mail-1",
            actorKind: "effect_dispatcher",
            now: 20
        });
        expect(result.kind).toBe("accepted");
        if (result.kind === "accepted") {
            expect(result.state.privateMails[0]).toMatchObject({
                status: "processing",
                sendContextPublicationUpperBound: ["pub-1"],
                processingContextPublicationUpperBound: ["pub-1", "pub-2"],
                processingStartedAt: 20,
                deadlineAt: 110,
                createdAt: 10
            });
            expect(result.relatedIds).toEqual(["mail-1", "pub-1", "pub-2"]);
            expect(result.effectRequests).toEqual([]);
            expect(result.state.version).toBe(3);
            expect(result.state.updatedAt).toBe(20);
        }
    });

    it.each([
        ["wrong actor", { actorKind: "other", now: 20 }, "UNAUTHORIZED", "mail-1"],
        [
            "paused",
            { actorKind: "effect_dispatcher", now: 20, lifecycle: "paused" },
            "INVALID_STATE",
            "mail-1"
        ],
        [
            "before created",
            { actorKind: "effect_dispatcher", now: 9 },
            "PRECONDITION_FAILED",
            "mail-1"
        ],
        [
            "at deadline",
            { actorKind: "effect_dispatcher", now: 110 },
            "PRECONDITION_FAILED",
            "mail-1"
        ],
        [
            "after deadline",
            { actorKind: "effect_dispatcher", now: 111 },
            "PRECONDITION_FAILED",
            "mail-1"
        ]
    ] as const)("rejects start %s", (_name, overrides, code, targetId) => {
        const sent = sendPrivateMail(privateMailState(), input);
        expect(sent.kind).toBe("accepted");
        if (sent.kind !== "accepted") return;
        const { lifecycle, ...startInput } = overrides;
        const candidate = lifecycle
            ? { ...sent.state, lifecycle: { ...sent.state.lifecycle, status: lifecycle } }
            : sent.state;
        const result = startPrivateMail(
            candidate as MeetingState,
            { mailId: "mail-1", ...startInput } as never
        );
        rejected(result, code, targetId);
        expect(result.state).toBe(candidate);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    it("rejects missing start input without throwing", () => {
        const before = sendPrivateMail(privateMailState(), input);
        expect(before.kind).toBe("accepted");
        if (before.kind !== "accepted") return;
        const result = startPrivateMail(before.state, undefined as never);
        rejected(result, "INVALID_ARGUMENT");
        expect(result.state).toBe(before.state);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });
});

describe("private mail start gates", () => {
    it("rejects start when recipient owns a non-terminal Contribution", () => {
        const candidate = withContribution("preparing");
        const sent = sendPrivateMail(candidate, input);
        expect(sent.kind).toBe("accepted");
        if (sent.kind !== "accepted") return;
        const result = startPrivateMail(sent.state, {
            mailId: "mail-1",
            actorKind: "effect_dispatcher",
            now: 20
        });
        rejected(result, "PRECONDITION_FAILED", "mail-1");
        expect(result.state).toBe(sent.state);
        expect(result.relatedIds).toEqual([]);
        expect(result.effectRequests).toEqual([]);
    });

    it("allows terminal Contribution and another recipient's processing mail", () => {
        const terminalContribution = withContribution("closed", "recipient");
        const sent = sendPrivateMail(terminalContribution, input);
        expect(sent.kind).toBe("accepted");
        if (sent.kind !== "accepted") return;
        const other = {
            id: "mail-other",
            senderId: "sender",
            recipientId: "sender",
            body: "hello",
            relatedIds: ["pub-1"],
            sendContextPublicationUpperBound: ["pub-1"],
            processingContextPublicationUpperBound: ["pub-1"],
            status: "processing" as const,
            deadlineAt: 110,
            createdAt: 10,
            processingStartedAt: 20
        };
        const candidate = {
            ...sent.state,
            identities: [
                ...sent.state.identities,
                {
                    ...sent.state.identities[0],
                    id: "other",
                    displayName: "other",
                    roles: ["contributor"]
                }
            ],
            privateMails: [sent.state.privateMails[0], { ...other, recipientId: "other" }]
        } as MeetingState;
        const result = startPrivateMail(candidate, {
            mailId: "mail-1",
            actorKind: "effect_dispatcher",
            now: 30
        });
        expect(result.kind).toBe("accepted");
        if (result.kind === "accepted") {
            expect(result.state.privateMails[0].status).toBe("processing");
            expect(result.state.privateMails[1].status).toBe("processing");
        }
    });

    it.each(["processing", "completed", "cancelled", "timed_out"] as const)(
        "rejects start of %s mail as INVALID_STATE",
        (status) => {
            const sent = sendPrivateMail(privateMailState(), input);
            expect(sent.kind).toBe("accepted");
            if (sent.kind !== "accepted") return;
            let candidate = sent.state;
            if (status === "processing") {
                const started = startPrivateMail(candidate, {
                    mailId: "mail-1",
                    actorKind: "effect_dispatcher",
                    now: 20
                });
                expect(started.kind).toBe("accepted");
                if (started.kind === "accepted") candidate = started.state;
            } else if (status === "completed") {
                const started = startPrivateMail(candidate, {
                    mailId: "mail-1",
                    actorKind: "effect_dispatcher",
                    now: 20
                });
                if (started.kind !== "accepted") return;
                const completed = completePrivateMail(started.state, {
                    mailId: "mail-1",
                    recipientId: "recipient",
                    now: 30
                });
                if (completed.kind !== "accepted") return;
                candidate = completed.state;
            } else if (status === "cancelled") {
                const cancelled = cancelPrivateMail(candidate, {
                    mailId: "mail-1",
                    senderId: "sender",
                    reason: "stop",
                    now: 20
                });
                if (cancelled.kind !== "accepted") return;
                candidate = cancelled.state;
            } else {
                const expired = expirePrivateMail(candidate, {
                    mailId: "mail-1",
                    actorKind: "deadline_handler",
                    reason: "late",
                    now: 110
                });
                if (expired.kind !== "accepted") return;
                candidate = expired.state;
            }
            const result = startPrivateMail(candidate, {
                mailId: "mail-1",
                actorKind: "effect_dispatcher",
                now: 20
            });
            rejected(result, "INVALID_STATE", "mail-1");
            expect(result.state).toBe(candidate);
        }
    );
});
