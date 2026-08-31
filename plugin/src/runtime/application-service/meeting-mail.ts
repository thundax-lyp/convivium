import { createHash } from "node:crypto";
import type {
    FinishMeetingMailInputV1,
    MeetingMailResultV1,
    ProtocolErrorV1,
    ProtocolSuccessV1,
    SendMeetingMessageInputV1
} from "../../protocol/index.js";
import {
    commandFailure,
    commandSuccess,
    mapCommandError
} from "../services/command-result-service.js";
import type { MeetingRehydrationService } from "../services/meeting-recovery-service.js";
import type { MeetingDeliveryWorkerService } from "../services/types.js";
import type { CreateStatusRuntimeOptions, MeetingToolCaller } from "./index.js";
import type { StoredMeeting } from "./types.js";

function stableId(kind: string, requestId: string): string {
    return `${kind}-${createHash("sha256").update(requestId).digest("hex").slice(0, 32)}`;
}

export function createMeetingMailApplication(dependencies: {
    readonly options: CreateStatusRuntimeOptions;
    readonly meetings: Map<string, StoredMeeting>;
    readonly recovery: MeetingRehydrationService;
    readonly deliveryWorkers: MeetingDeliveryWorkerService;
}) {
    return {
        async sendMeetingMessage(
            input: SendMeetingMessageInputV1,
            caller: MeetingToolCaller
        ): Promise<ProtocolSuccessV1<MeetingMailResultV1> | ProtocolErrorV1> {
            await dependencies.recovery.rehydrate();
            const stored = dependencies.meetings.get(input.meetingId);
            if (!stored) return commandFailure("MEETING_NOT_FOUND", "Meeting not found.");
            if (
                caller.kind !== "participant" ||
                caller.meetingId !== input.meetingId ||
                !caller.participantId
            )
                return commandFailure(
                    "UNAUTHORIZED_CALLER",
                    "Only the authenticated meeting Participant can send mail."
                );
            if (input.recipient.kind !== "meeting_participant")
                return commandFailure(
                    "UNSUPPORTED_CAPABILITY",
                    "Only meeting-scoped recipients are supported."
                );
            if (
                input.recipient.meetingId !== input.meetingId ||
                input.meetingContext.meetingId !== input.meetingId
            )
                return commandFailure(
                    "INVALID_ARGUMENT",
                    "Meeting mail must remain in one Meeting."
                );
            try {
                const snapshot = await stored.repository.read();
                const state = snapshot.state as unknown as {
                    participants: { id: string }[];
                    messageSeq: number;
                };
                if (
                    !state.participants.some((item) => item.id === caller.participantId) ||
                    !state.participants.some((item) => item.id === input.recipient.participantId)
                )
                    return commandFailure(
                        "UNAUTHORIZED_CALLER",
                        "Sender and recipient must be Meeting Participants."
                    );
                if (input.meetingContext.contextThroughSeq > state.messageSeq)
                    return commandFailure(
                        "INVALID_ARGUMENT",
                        "Mail context exceeds the authorized transcript snapshot."
                    );
                const mailId = stableId("mail", `${caller.participantId}:${input.requestId}`);
                const handlingAttemptId = stableId(
                    "mail-handling",
                    `${input.recipient.participantId}:${input.requestId}`
                );
                const deliveryId = stableId(
                    "mail-delivery",
                    `${input.recipient.participantId}:${input.requestId}`
                );
                const committed = await stored.repository.sendPrivateMeetingMail({
                    requestId: input.requestId,
                    requestHash: JSON.stringify(input),
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `participant:${caller.participantId}`
                    },
                    expectedMeetingVersion: input.expectedMeetingVersion,
                    mail: {
                        mailId,
                        handlingAttemptId,
                        meetingId: input.meetingId,
                        senderParticipantId: caller.participantId,
                        recipientParticipantId: input.recipient.participantId,
                        content: input.content,
                        meetingContext: input.meetingContext as never,
                        ...(input.replyToMailId === undefined
                            ? {}
                            : { replyToMailId: input.replyToMailId }),
                        snapshotThroughSeq: input.meetingContext.contextThroughSeq,
                        createdAt: dependencies.options.now?.() ?? Date.now()
                    },
                    outbox: {
                        deliveryId,
                        kind: "dispatch",
                        priority: 0,
                        payload: {
                            role: "meeting_mail",
                            mailId,
                            participantId: input.recipient.participantId
                        }
                    }
                });
                dependencies.deliveryWorkers.wake(input.meetingId);
                return commandSuccess(input.meetingId, committed.meetingVersion, {
                    ...committed.result,
                    status: "pending"
                });
            } catch (error) {
                return mapCommandError(
                    error,
                    "INVALID_ENTITY_STATE",
                    "Meeting mail could not be sent.",
                    { meetingId: input.meetingId },
                    { INVALID_INPUT: "INVALID_ARGUMENT" }
                );
            }
        },
        async finishMeetingMail(
            input: FinishMeetingMailInputV1,
            caller: MeetingToolCaller
        ): Promise<ProtocolSuccessV1<MeetingMailResultV1> | ProtocolErrorV1> {
            await dependencies.recovery.rehydrate();
            const stored = dependencies.meetings.get(input.meetingId);
            if (!stored) return commandFailure("MEETING_NOT_FOUND", "Meeting not found.");
            if (
                caller.kind !== "participant" ||
                caller.meetingId !== input.meetingId ||
                !caller.participantId
            )
                return commandFailure(
                    "UNAUTHORIZED_CALLER",
                    "Only a matching recipient Participant can finish mail."
                );
            try {
                const mail = await stored.repository.readPrivateMeetingMail(input.mailId);
                if (
                    !mail ||
                    mail.recipientParticipantId !== caller.participantId ||
                    mail.handlingAttemptId !== input.handlingAttemptId ||
                    mail.deliveryId !== input.deliveryId
                )
                    return commandFailure(
                        "UNAUTHORIZED_CALLER",
                        "Mail does not belong to this Participant."
                    );
                const snapshot = await stored.repository.read();
                const finished = await stored.repository.finishPrivateMeetingMail({
                    requestId: input.requestId,
                    requestHash: JSON.stringify(input),
                    expectedMeetingVersion: snapshot.version,
                    mailId: input.mailId,
                    handlingAttemptId: input.handlingAttemptId,
                    deliveryId: input.deliveryId,
                    status: input.status,
                    authorization: {
                        callerBinding: `session:${caller.sessionId}`,
                        capabilityId: `participant:${caller.participantId}`
                    }
                });
                return commandSuccess(input.meetingId, (await stored.repository.read()).version, {
                    mailId: finished.mailId,
                    handlingAttemptId: finished.handlingAttemptId,
                    status: finished.status
                });
            } catch (error) {
                return mapCommandError(
                    error,
                    "INVALID_ENTITY_STATE",
                    "Meeting mail could not be finished.",
                    { meetingId: input.meetingId }
                );
            }
        }
    };
}
