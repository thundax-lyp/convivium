import { DomainMeetingRepositoryCore } from "./domain-meeting-repository-core.js";
import { RepositoryError } from "@/repository/errors.js";
import { receiptKey } from "./keys.js";
import type {
    CommittedResult,
    PrivateMeetingMail,
    SendPrivateMeetingMailInput,
    StartPrivateMeetingMailInput,
    FinishPrivateMeetingMailInput,
    CancelPrivateMeetingMailInput,
    JsonObject
} from "@/repository/types.js";
import {
    validatePrivateMailSend,
    validatePrivateMailStart,
    validatePrivateMailFinish
} from "./private-mail-validation.js";

export abstract class DomainMeetingRepositoryMail<
    TState = JsonObject
> extends DomainMeetingRepositoryCore<TState> {
    async readPrivateMeetingMail(_mailId: string): Promise<PrivateMeetingMail | undefined> {
        this.ensureOpen();
        const mail = this.projection?.privateMail[_mailId];
        return mail === undefined ? undefined : structuredClone(mail);
    }
    async listOverduePrivateMeetingMail(_now: number): Promise<PrivateMeetingMail[]> {
        this.ensureOpen();
        return Object.values(this.projection?.privateMail ?? {})
            .filter(
                (mail) =>
                    mail.status === "processing" &&
                    mail.deadlineAt !== undefined &&
                    mail.deadlineAt <= _now
            )
            .sort(
                (a, b) =>
                    a.deadlineAt! - b.deadlineAt! ||
                    a.createdAt - b.createdAt ||
                    (a.mailId < b.mailId ? -1 : 1)
            )
            .map((mail) => structuredClone(mail));
    }
    async hasUnfinishedPrivateMeetingMail(): Promise<boolean> {
        this.ensureOpen();
        return Object.values(this.projection?.privateMail ?? {}).some(
            (mail) => mail.status === "pending" || mail.status === "processing"
        );
    }
    async sendPrivateMeetingMail(
        _input: SendPrivateMeetingMailInput
    ): Promise<CommittedResult<{ mailId: string; handlingAttemptId: string }>> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            if (!this.projection?.snapshot)
                throw new RepositoryError(
                    "MEETING_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Meeting does not exist"
                );
            const snapshot = structuredClone(this.projection.snapshot);
            this.authorizationValidator.validateCommand({
                snapshot: this.decodeSnapshot(snapshot),
                command: { commandKind: "send_meeting_message", authorization: input.authorization }
            });
            const key = receiptKey(
                input.requestId,
                "send_meeting_message",
                input.authorization.callerBinding
            );
            const existing = this.projection.receipts[key];
            if (existing) {
                if (existing.requestHash !== input.requestHash)
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                const replay = this.projection.privateMail[input.mail.mailId];
                if (!replay)
                    throw new RepositoryError(
                        "CORRUPT_DATABASE",
                        false,
                        this.meetingId,
                        "Mail receipt points to a missing mail"
                    );
                return {
                    requestId: input.requestId,
                    meetingId: this.meetingId,
                    meetingVersion: existing.meetingVersion,
                    result: {
                        mailId: replay.mailId,
                        handlingAttemptId: replay.handlingAttemptId
                    },
                    eventSeqs: [...existing.eventSeqs]
                };
            }
            if (!input.isNewDeliveryAvailable())
                throw new RepositoryError(
                    "UNSUPPORTED_CAPABILITY",
                    false,
                    this.meetingId,
                    "Meeting delivery is unavailable until the Captain Session is rebound"
                );
            if (snapshot.version !== input.expectedMeetingVersion)
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            validatePrivateMailSend(
                snapshot,
                Object.values(this.projection.sessionOwnership),
                input.mail.replyToMailId === undefined
                    ? undefined
                    : this.projection.privateMail[input.mail.replyToMailId],
                input
            );
            const now = input.mail.createdAt;
            return this.commit({
                operation: "mail.send",
                now,
                mutate: (projection) => {
                    if (
                        Object.values(projection.outbox).some(
                            (item) => item.deliveryId === input.outbox.deliveryId
                        )
                    )
                        throw new RepositoryError(
                            "INVALID_INPUT",
                            false,
                            this.meetingId,
                            "Outbox deliveryId already exists"
                        );
                    const mail = { ...input.mail, status: "pending" as const, updatedAt: now };
                    projection.privateMail[mail.mailId] = mail;
                    const outboxId = input.outbox.id ?? crypto.randomUUID();
                    projection.outbox[outboxId] = {
                        formatVersion: 1,
                        id: outboxId,
                        deliveryId: input.outbox.deliveryId,
                        kind: "dispatch",
                        priority: input.outbox.priority ?? 50,
                        payload: input.outbox.payload,
                        status: "pending",
                        attempts: 0,
                        availableAt: input.outbox.availableAt ?? now,
                        leaseOwner: null,
                        leaseToken: null,
                        leaseDeadline: null,
                        deliveredAt: null,
                        failedAt: null,
                        lastError: null,
                        createdAt: now
                    };
                    const result = {
                        mailId: mail.mailId,
                        handlingAttemptId: mail.handlingAttemptId
                    };
                    projection.receipts[key] = {
                        formatVersion: 1,
                        requestId: input.requestId,
                        commandKind: "send_meeting_message",
                        callerBinding: input.authorization.callerBinding,
                        requestHash: input.requestHash,
                        meetingVersion: projection.snapshot!.version,
                        result,
                        eventSeqs: [],
                        createdAt: now
                    };
                    return {
                        next: projection,
                        result: {
                            requestId: input.requestId,
                            meetingId: this.meetingId,
                            meetingVersion: projection.snapshot!.version,
                            result,
                            eventSeqs: []
                        }
                    };
                }
            });
        });
    }
    async startPrivateMeetingMail(
        _input: StartPrivateMeetingMailInput
    ): Promise<PrivateMeetingMail> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const snapshot = this.projection?.snapshot;
            if (!snapshot)
                throw new RepositoryError(
                    "MEETING_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Meeting does not exist"
                );
            this.authorizationValidator.validateCommand({
                snapshot: this.decodeSnapshot(snapshot),
                command: {
                    commandKind: "start_meeting_message",
                    authorization: input.authorization
                }
            });
            const key = receiptKey(
                input.requestId,
                "start_meeting_message",
                input.authorization.callerBinding
            );
            const receipt = this.projection?.receipts[key];
            const mail = this.projection?.privateMail[input.mailId];
            if (receipt) {
                if (receipt.requestHash !== input.requestHash)
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                if (!mail)
                    throw new RepositoryError(
                        "CORRUPT_DATABASE",
                        false,
                        this.meetingId,
                        "Mail receipt points to a missing mail"
                    );
                return structuredClone(mail);
            }
            if (snapshot.version !== input.expectedMeetingVersion)
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            if (!mail)
                throw new RepositoryError(
                    "OUTBOX_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Private mail does not exist"
                );
            const now = input.now ?? this.now();
            validatePrivateMailStart(snapshot, mail, input, now);
            return this.commit({
                operation: "mail.start",
                now,
                mutate: (projection) => {
                    const next = {
                        ...mail,
                        status: "processing" as const,
                        processingThroughSeq: input.processingThroughSeq,
                        deliveryId: input.deliveryId,
                        deadlineAt: input.deadlineAt,
                        updatedAt: now
                    };
                    projection.privateMail[input.mailId] = next;
                    projection.receipts[key] = {
                        formatVersion: 1,
                        requestId: input.requestId,
                        commandKind: "start_meeting_message",
                        callerBinding: input.authorization.callerBinding,
                        requestHash: input.requestHash,
                        meetingVersion: snapshot.version,
                        result: { mailId: input.mailId },
                        eventSeqs: [],
                        createdAt: now
                    };
                    return { next: projection, result: next };
                }
            });
        });
    }
    async finishPrivateMeetingMail(
        _input: FinishPrivateMeetingMailInput
    ): Promise<PrivateMeetingMail> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const snapshot = this.projection?.snapshot;
            if (!snapshot)
                throw new RepositoryError(
                    "MEETING_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Meeting does not exist"
                );
            const commandKind =
                input.status === "timed_out" ? "timeout_meeting_message" : "finish_meeting_message";
            this.authorizationValidator.validateCommand({
                snapshot: this.decodeSnapshot(snapshot),
                command: { commandKind, authorization: input.authorization }
            });
            const key = receiptKey(input.requestId, commandKind, input.authorization.callerBinding);
            const receipt = this.projection?.receipts[key];
            const mail = this.projection?.privateMail[input.mailId];
            if (receipt) {
                if (receipt.requestHash !== input.requestHash)
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                if (!mail)
                    throw new RepositoryError(
                        "CORRUPT_DATABASE",
                        false,
                        this.meetingId,
                        "Mail receipt points to a missing mail"
                    );
                return structuredClone(mail);
            }
            if (snapshot.version !== input.expectedMeetingVersion)
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            validatePrivateMailFinish(this.meetingId, mail, input);
            const now = input.now ?? this.now();
            return this.commit({
                operation: "mail.finish",
                now,
                mutate: (projection) => {
                    const next = {
                        ...mail,
                        status: input.status,
                        deliveryId: input.deliveryId,
                        updatedAt: now
                    };
                    projection.privateMail[input.mailId] = next;
                    projection.receipts[key] = {
                        formatVersion: 1,
                        requestId: input.requestId,
                        commandKind,
                        callerBinding: input.authorization.callerBinding,
                        requestHash: input.requestHash,
                        meetingVersion: snapshot.version,
                        result: { mailId: input.mailId, status: input.status },
                        eventSeqs: [],
                        createdAt: now
                    };
                    return { next: projection, result: next };
                }
            });
        });
    }
    async cancelUnfinishedPrivateMeetingMail(
        _input: CancelPrivateMeetingMailInput
    ): Promise<number> {
        const input = _input;
        this.ensureOpen();
        return this.enqueueMutation(async () => {
            const snapshot = this.projection?.snapshot;
            if (!snapshot)
                throw new RepositoryError(
                    "MEETING_NOT_FOUND",
                    false,
                    this.meetingId,
                    "Meeting does not exist"
                );
            const commandKind = "cancel_unfinished_meeting_message";
            this.authorizationValidator.validateCommand({
                snapshot: this.decodeSnapshot(snapshot),
                command: { commandKind, authorization: input.authorization }
            });
            const key = receiptKey(input.requestId, commandKind, input.authorization.callerBinding);
            const receipt = this.projection?.receipts[key];
            if (receipt) {
                if (receipt.requestHash !== input.requestHash)
                    throw new RepositoryError(
                        "IDEMPOTENCY_CONFLICT",
                        false,
                        this.meetingId,
                        "Request hash conflicts with receipt"
                    );
                const result = receipt.result;
                if (
                    typeof result !== "object" ||
                    result === null ||
                    Array.isArray(result) ||
                    typeof result.cancelled !== "number"
                )
                    throw new RepositoryError(
                        "CORRUPT_DATABASE",
                        false,
                        this.meetingId,
                        "Cancel receipt is invalid"
                    );
                return result.cancelled;
            }
            if (snapshot.version !== input.expectedMeetingVersion)
                throw new RepositoryError(
                    "VERSION_CONFLICT",
                    true,
                    this.meetingId,
                    "Meeting version is stale"
                );
            const now = input.now ?? this.now();
            const count = Object.values(this.projection?.privateMail ?? {}).filter(
                (mail) => mail.status === "pending" || mail.status === "processing"
            ).length;
            if (count === 0) return 0;
            return this.commit({
                operation: "mail.cancel",
                now,
                mutate: (projection) => {
                    let cancelled = 0;
                    for (const [id, mail] of Object.entries(projection.privateMail))
                        if (mail.status === "pending" || mail.status === "processing") {
                            projection.privateMail[id] = {
                                ...mail,
                                status: "cancelled",
                                updatedAt: now
                            };
                            cancelled += 1;
                        }
                    projection.receipts[key] = {
                        formatVersion: 1,
                        requestId: input.requestId,
                        commandKind,
                        callerBinding: input.authorization.callerBinding,
                        requestHash: input.requestHash,
                        meetingVersion: snapshot.version,
                        result: { cancelled },
                        eventSeqs: [],
                        createdAt: now
                    };
                    return { next: projection, result: cancelled };
                }
            });
        });
    }
}
