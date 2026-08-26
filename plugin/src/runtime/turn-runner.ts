import type { MeetingMessage, MeetingTurn, SpeakerStep } from "../domain/model.js";

export interface TurnAttemptInput {
    readonly meetingId: string;
    readonly attemptId: string;
    readonly deliveryId: string;
    readonly participantId: string;
    readonly turnId: string;
    readonly stepId: string;
    readonly agendaItemId: string;
    readonly contextFromSeq: number;
    readonly contextThroughSeq: number;
    readonly objective: string;
    readonly instruction: string;
    readonly priorMessages: readonly MeetingMessage[];
}

export interface TurnRunnerDependencies {
    readonly meetingId: string;
    readonly turn: MeetingTurn;
    readonly readCommittedTranscript: () => Promise<readonly MeetingMessage[]>;
    readonly allocateAttemptId: (step: SpeakerStep, index: number) => string;
    readonly allocateDeliveryId: (step: SpeakerStep, index: number) => string;
    /** Performs the adapter followup and resolves only after DSH accepts it. */
    readonly dispatch: (input: TurnAttemptInput) => Promise<void>;
    /** Waits for the submit_turn tool to produce a candidate message. */
    readonly waitForSubmission: (input: TurnAttemptInput) => Promise<MeetingMessage>;
    /** Commits the validated candidate and returns only after SQLite commits. */
    readonly commitSubmission: (
        attempt: TurnAttemptInput,
        message: MeetingMessage
    ) => Promise<void>;
}

export interface TurnRunnerResult {
    readonly turnId: string;
    readonly submittedAttemptIds: readonly string[];
    readonly submittedMessageIds: readonly string[];
}

function relevantMessages(
    transcript: readonly MeetingMessage[],
    agendaItemId: string
): readonly MeetingMessage[] {
    return transcript
        .filter((message) => message.agendaItemId === agendaItemId)
        .sort((left, right) => left.seq - right.seq);
}

function isLegalSubmission(message: MeetingMessage, attempt: TurnAttemptInput): boolean {
    return (
        message.id.length > 0 &&
        message.turnId === attempt.turnId &&
        message.stepId === attempt.stepId &&
        message.attemptId === attempt.attemptId &&
        message.speaker === attempt.participantId &&
        message.agendaItemId === attempt.agendaItemId
    );
}

export function createTurnRunner() {
    const activeTurns = new Set<string>();

    return {
        async run(input: TurnRunnerDependencies): Promise<TurnRunnerResult> {
            const key = `${input.meetingId}:${input.turn.id}`;
            if (activeTurns.has(key)) {
                throw new Error(
                    `Turn ${input.turn.id} is already running for meeting ${input.meetingId}`
                );
            }
            activeTurns.add(key);

            const submittedAttemptIds: string[] = [];
            const submittedMessageIds: string[] = [];
            try {
                for (const [index, step] of input.turn.steps.entries()) {
                    if (step.status !== "pending") {
                        throw new Error(`Turn step ${step.id} is not pending`);
                    }
                    const transcript = await input.readCommittedTranscript();
                    const priorMessages = relevantMessages(transcript, input.turn.agendaItemId);
                    const contextFromSeq = priorMessages[0]?.seq ?? 0;
                    const contextThroughSeq = priorMessages.at(-1)?.seq ?? 0;
                    const attempt: TurnAttemptInput = {
                        meetingId: input.meetingId,
                        attemptId: input.allocateAttemptId(step, index),
                        deliveryId: input.allocateDeliveryId(step, index),
                        participantId: step.speaker,
                        turnId: input.turn.id,
                        stepId: step.id,
                        agendaItemId: input.turn.agendaItemId,
                        contextFromSeq,
                        contextThroughSeq,
                        objective: input.turn.objective,
                        instruction: step.instruction,
                        priorMessages
                    };

                    // The await boundary is intentional: the next attempt cannot exist until
                    // this delivery is committed, so active attempt count stays at one.
                    await input.dispatch(attempt);
                    let message: MeetingMessage;
                    do {
                        message = await input.waitForSubmission(attempt);
                    } while (!isLegalSubmission(message, attempt));
                    await input.commitSubmission(attempt, message);
                    submittedAttemptIds.push(attempt.attemptId);
                    submittedMessageIds.push(message.id);
                }
            } finally {
                activeTurns.delete(key);
            }

            return {
                turnId: input.turn.id,
                submittedAttemptIds,
                submittedMessageIds
            };
        }
    };
}
