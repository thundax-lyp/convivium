import { describe, expect, it } from "vitest";
import { captainActorIdFor, type MeetingEventInput, type MeetingState } from "@/domain/index.ts";
import { StorageDomainMeetingRepository } from "@/repository/storage-domain/storage-domain-meeting-repository.ts";
import {
    decodeMeetingState,
    encodeMeetingState
} from "@/repository/storage-domain/meeting-state-codec.ts";
import { seqKey } from "@/repository/storage-domain/keys.ts";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.ts";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state.ts";
import { peerBindings } from "../fixtures/peer-ownership.ts";

const allow = { validateCreate: () => undefined, validateCommand: () => undefined };
const authorization = { callerBinding: "captain", capabilityId: "captain" };
const fixture = async () => {
    const state = makeRunningMeetingStateV1();
    const meeting = createFakeMeetingDomain();
    const catalog = createFakeCatalogDomain();
    const options = {
        catalogDomain: catalog,
        meetingDomain: meeting,
        meetingId: state.id,
        authorizationValidator: allow,
        codec: { encode: encodeMeetingState, decode: decodeMeetingState },
        now: () => 999
    };
    const repository = await StorageDomainMeetingRepository.open<MeetingState>(options);
    const create = {
        requestId: "create-events",
        requestHash: "create-events-hash",
        authorization,
        initialState: state,
        ...peerBindings(state.id, state.identities),
        createResult: { meetingId: state.id, meetingVersion: 1 },
        createdAt: 10
    };
    await repository.create(create);
    for (const ownership of create.initialOwnership) {
        await repository.recordSessionOwnership({ ...ownership, lifecycleStatus: "active" }, 10);
    }
    const receipt = await repository.completeCreate(create);
    return { repository, options, receipt };
};
const roundEvent: MeetingEventInput = {
    type: "round.opened",
    occurredAt: 20,
    payload: {
        logVersion: 1,
        actor: { kind: "system" },
        subject: { kind: "round", id: "round" },
        relatedObjects: [],
        data: { deadlineAt: 30 }
    }
};
const command = (
    requestId: string,
    expectedMeetingVersion: number,
    events: MeetingEventInput[]
) => ({
    requestId,
    requestHash: requestId,
    commandKind: "open_round",
    authorization,
    expectedMeetingVersion,
    transition: (snapshot: { state: MeetingState }) => ({
        state: { ...snapshot.state, version: expectedMeetingVersion + 1, updatedAt: 20 },
        result: { accepted: true },
        events,
        outbox: []
    })
});

describe("Meeting committed event log", () => {
    it("creates a complete log, sequences each occurrence and preserves time/version on cold reopen", async () => {
        const { repository, options, receipt } = await fixture();
        expect(receipt.eventSeqs).toEqual([1]);
        const created = {
            eventSeq: 1,
            meetingVersion: 1,
            type: "meeting.created",
            createdAt: 10,
            payload: {
                logVersion: 1,
                actor: { kind: "captain", actorId: captainActorIdFor(options.meetingId) },
                subject: { kind: "meeting", id: options.meetingId },
                relatedObjects: [],
                data: {}
            }
        };
        expect(await repository.readCommittedEvents()).toEqual({
            kind: "complete",
            events: [created]
        });
        const first = await repository.execute(
            command("first", 1, [
                roundEvent,
                {
                    type: "evidence.submitted",
                    occurredAt: 20,
                    payload: {
                        logVersion: 1,
                        actor: { kind: "identity", actorId: "author" },
                        subject: { kind: "evidence_version", id: "version" },
                        relatedObjects: [{ kind: "round", id: "round" }],
                        data: { summary: "original" }
                    }
                }
            ])
        );
        expect(first).toMatchObject({ meetingVersion: 2, eventSeqs: [2, 3] });
        await repository.execute(command("second", 2, [{ ...roundEvent, occurredAt: 40 }]));
        const log = await repository.readCommittedEvents();
        expect(log.kind).toBe("complete");
        if (log.kind !== "complete") {
            throw new Error("complete log required");
        }
        expect(
            log.events.map(({ eventSeq, meetingVersion, createdAt }) => [
                eventSeq,
                meetingVersion,
                createdAt
            ])
        ).toEqual([
            [1, 1, 10],
            [2, 2, 20],
            [3, 2, 20],
            [4, 3, 40]
        ]);
        await repository.close();
        const reopened = await StorageDomainMeetingRepository.open<MeetingState>(options);
        expect(await reopened.readCommittedEvents()).toEqual(log);
        log.events[0]!.payload.subject.id = "mutated-reader-copy";
        expect(await reopened.readCommittedEvents()).not.toEqual(log);
        await reopened.close();
    });

    it("does not append on replay, conflict, rejection or failed storage commit", async () => {
        const { repository, options } = await fixture();
        const input = command("replay", 1, [roundEvent]);
        const receipt = await repository.execute(input);
        const committed = await repository.readCommittedEvents();
        expect(await repository.execute(input)).toEqual(receipt);
        await expect(
            repository.execute(command("conflict", 1, [roundEvent]))
        ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
        await expect(
            repository.execute({
                ...command("reject", 2, [roundEvent]),
                transition: () => {
                    throw new Error("domain rejection");
                }
            })
        ).rejects.toThrow("domain rejection");
        options.meetingDomain.failPutsInTable("commits");
        await expect(
            repository.execute(command("failed-write", 2, [roundEvent]))
        ).rejects.toThrow();
        options.meetingDomain.allowPutsInTable("commits");
        expect(await repository.readCommittedEvents()).toEqual(committed);
        await repository.close();
    });

    it.each([
        "gap",
        "unknown-kind",
        "invalid-data",
        "wrong-subject",
        "wrong-seq",
        "wrong-create"
    ] as const)(
        "fails closed without retrying or returning a partial complete log for %s",
        async (corruption) => {
            const { repository } = await fixture();
            await repository.execute(command("corrupt", 1, [roundEvent]));
            const projection = Reflect.get(repository, "projection");
            const event = projection.events[seqKey(2)];
            if (corruption === "gap") {
                delete projection.events[seqKey(2)];
            }
            if (corruption === "unknown-kind") {
                event.type = "unknown";
            }
            if (corruption === "invalid-data") {
                event.payload.data = { deadlineAt: 30, milestone: "bad" };
            }
            if (corruption === "wrong-subject") {
                event.payload.subject.kind = "meeting";
            }
            if (corruption === "wrong-seq") {
                event.eventSeq = 3;
            }
            if (corruption === "wrong-create") {
                projection.events[seqKey(1)].type = "round.opened";
            }
            await expect(repository.readCommittedEvents()).rejects.toMatchObject({
                code: "RECOVERY_UNAVAILABLE",
                retryable: false,
                meetingId: repository.meetingId
            });
            await repository.close();
        }
    );
});
