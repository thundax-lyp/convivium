import { captainActorIdFor, type PersistedMeetingEvent } from "@/domain/index.ts";
import type { CommittedFactRecord, JsonObject } from "@/repository/index.ts";
import { RepositoryError } from "@/repository/index.ts";
import { CommittedMeetingEventSchema, seqKey } from "@/repository/storage-domain/format/index.ts";
import { MeetingPersistenceState } from "./meeting-persistence-state.ts";

export class MeetingHistory<TState = JsonObject> {
    constructor(private readonly state: MeetingPersistenceState<TState>) {}
    async readCommittedFacts(): Promise<readonly CommittedFactRecord<TState>[]> {
        this.state.ensureOpen();
        return Object.values(this.state.projection?.facts ?? {})
            .sort(
                (left, right) =>
                    left.meetingVersion - right.meetingVersion ||
                    left.factId.localeCompare(right.factId)
            )
            .map((fact) => ({
                ...structuredClone(fact),
                resultingState: this.state.decodeState(fact.resultingState)
            }));
    }
    async readCommittedEvents(): Promise<{
        kind: "complete";
        events: readonly PersistedMeetingEvent[];
    }> {
        this.state.ensureOpen();
        const projection = this.state.projection;
        const unavailable = () =>
            new RepositoryError(
                "RECOVERY_UNAVAILABLE",
                false,
                this.state.meetingId,
                "Complete event log is invalid"
            );
        if (
            !projection ||
            !Number.isSafeInteger(projection.nextEventSeq) ||
            projection.nextEventSeq < 2 ||
            Object.keys(projection.events).length !== projection.nextEventSeq - 1
        ) {
            throw unavailable();
        }
        const events: PersistedMeetingEvent[] = [];
        for (let seq = 1; seq < projection.nextEventSeq; seq += 1) {
            const parsed = CommittedMeetingEventSchema.safeParse(projection.events[seqKey(seq)]);
            if (!parsed.success || parsed.data.eventSeq !== seq) {
                throw unavailable();
            }
            const { type, payload } = parsed.data;
            if (
                seq === 1 &&
                (type !== "meeting.created" ||
                    payload.actor.kind !== "captain" ||
                    payload.actor.actorId !== captainActorIdFor(this.state.meetingId) ||
                    payload.subject.kind !== "meeting" ||
                    payload.subject.id !== this.state.meetingId ||
                    payload.relatedObjects.length !== 0)
            ) {
                throw unavailable();
            }
            const {
                formatVersion: _format,
                turnId: _turn,
                attemptId: _attempt,
                ...event
            } = parsed.data;
            events.push(structuredClone(event));
        }
        return { kind: "complete", events };
    }
}
