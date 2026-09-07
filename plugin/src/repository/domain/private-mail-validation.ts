import { RepositoryError } from "../errors.js";
import type {
    MeetingSnapshot,
    PrivateMeetingMail,
    SessionOwnership,
    SendPrivateMeetingMailInput,
    StartPrivateMeetingMailInput,
    FinishPrivateMeetingMailInput
} from "../types.js";

// Repository owns authorization, receipt replay, version checks and the commit boundary.
// These checks only inspect the supplied values; they never access storage or mutate state.
export function validatePrivateMailSend(
    snapshot: MeetingSnapshot,
    ownerships: readonly SessionOwnership[],
    parent: PrivateMeetingMail | undefined,
    input: Pick<SendPrivateMeetingMailInput, "mail" | "outbox">
): void {
    const state = snapshot.state;
    const participants = state.participants;
    const transcript = state.transcript;
    const messageSeq = state.messageSeq;
    const context = input.mail.meetingContext;
    const contextFromSeq = context.contextFromSeq;
    const contextThroughSeq = context.contextThroughSeq;
    const relevantMessageIds = context.relevantMessageIds;
    const terminal = [
        "paused",
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed",
        "archiving",
        "archived"
    ].includes(typeof state.status === "string" ? state.status : "");
    const hasParticipant = (participantId: string): boolean =>
        Array.isArray(participants) &&
        participants.some(
            (participant) =>
                typeof participant === "object" &&
                participant !== null &&
                !Array.isArray(participant) &&
                participant.id === participantId
        );
    const recipientOwned = ownerships.some(
        (ownership) =>
            ownership.role === "participant" &&
            ownership.participantId === input.mail.recipientParticipantId &&
            ownership.lifecycleStatus === "active" &&
            ownership.capabilityStatus === "active"
    );
    const contextValid =
        context.meetingId === snapshot.meetingId &&
        typeof contextFromSeq === "number" &&
        Number.isSafeInteger(contextFromSeq) &&
        typeof contextThroughSeq === "number" &&
        Number.isSafeInteger(contextThroughSeq) &&
        contextFromSeq >= 0 &&
        contextFromSeq <= contextThroughSeq &&
        typeof messageSeq === "number" &&
        contextThroughSeq <= messageSeq &&
        input.mail.snapshotThroughSeq === contextThroughSeq;
    const messagesValid =
        contextValid &&
        Array.isArray(relevantMessageIds) &&
        relevantMessageIds.every(
            (messageId) =>
                typeof messageId === "string" &&
                Array.isArray(transcript) &&
                transcript.some(
                    (message) =>
                        typeof message === "object" &&
                        message !== null &&
                        !Array.isArray(message) &&
                        message.id === messageId &&
                        typeof message.seq === "number" &&
                        message.seq >= contextFromSeq &&
                        message.seq <= contextThroughSeq
                )
        );
    const replyValid =
        input.mail.replyToMailId === undefined ||
        (parent !== undefined &&
            new Set([parent.senderParticipantId, parent.recipientParticipantId]).size ===
                new Set([input.mail.senderParticipantId, input.mail.recipientParticipantId]).size &&
            [parent.senderParticipantId, parent.recipientParticipantId].every(
                (participantId) =>
                    participantId === input.mail.senderParticipantId ||
                    participantId === input.mail.recipientParticipantId
            ));
    if (
        terminal ||
        !hasParticipant(input.mail.senderParticipantId) ||
        !hasParticipant(input.mail.recipientParticipantId) ||
        !recipientOwned ||
        !messagesValid ||
        !replyValid ||
        input.mail.meetingId !== snapshot.meetingId ||
        input.outbox.kind !== "dispatch" ||
        input.outbox.priority !== 0 ||
        input.outbox.payload.role !== "meeting_mail" ||
        input.outbox.payload.mailId !== input.mail.mailId ||
        input.outbox.payload.participantId !== input.mail.recipientParticipantId
    )
        throw new RepositoryError(
            "INVALID_INPUT",
            false,
            snapshot.meetingId,
            "Meeting mail participants, context, or delivery are invalid"
        );
}

export function validatePrivateMailStart(
    snapshot: MeetingSnapshot,
    mail: PrivateMeetingMail,
    input: Pick<StartPrivateMeetingMailInput, "processingThroughSeq" | "deadlineAt">,
    now: number
): void {
    const status = snapshot.state.status;
    if (
        mail.status !== "pending" ||
        status === "paused" ||
        [
            "completed",
            "partial",
            "no_consensus",
            "cancelled",
            "failed",
            "archiving",
            "archived"
        ].includes(typeof status === "string" ? status : "")
    )
        throw new RepositoryError(
            "INVALID_STATE",
            status === "paused",
            snapshot.meetingId,
            "Meeting mail is not dispatchable"
        );
    const messageSeq = snapshot.state.messageSeq;
    if (
        !Number.isSafeInteger(input.processingThroughSeq) ||
        input.processingThroughSeq < 0 ||
        typeof messageSeq !== "number" ||
        input.processingThroughSeq > messageSeq ||
        !Number.isFinite(input.deadlineAt) ||
        input.deadlineAt <= now
    )
        throw new RepositoryError(
            "INVALID_INPUT",
            false,
            snapshot.meetingId,
            "Meeting mail processing bounds are invalid"
        );
}

export function validatePrivateMailFinish(
    meetingId: string,
    mail: PrivateMeetingMail | undefined,
    input: Pick<FinishPrivateMeetingMailInput, "handlingAttemptId" | "deliveryId">
): asserts mail is PrivateMeetingMail {
    if (
        !mail ||
        mail.status !== "processing" ||
        mail.handlingAttemptId !== input.handlingAttemptId ||
        mail.deliveryId !== input.deliveryId
    )
        throw new RepositoryError(
            "INVALID_STATE",
            false,
            meetingId,
            "Mail handling is stale or terminal"
        );
}
