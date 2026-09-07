import { describe, expect, it } from "vitest";
import { observeCommit, type MeetingDiagnostic } from "../../../src/repository/diagnostics.js";
import { createProjection } from "../../../src/repository/domain/projection.js";
import { meeting, now } from "../domain/transitions/fixtures.js";
import { DomainMeetingRepository } from "../../../src/repository/domain/domain-meeting-repository.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../../fixtures/domain-storage.js";
import { DomainError } from "../../../src/domain/errors.js";

function projection() {
    const state = meeting("waiting");
    state.waitState = {
        reason: "blocking_task",
        waitingSince: now - 50,
        taskIds: [],
        participantIds: []
    };
    return createProjection({
        snapshot: {
            teamId: state.teamId,
            meetingId: state.id,
            state: JSON.parse(JSON.stringify(state)),
            version: state.version,
            createdAt: state.createdAt,
            updatedAt: now
        },
        bootstrap: {
            status: "ready",
            createRequestId: "create",
            requestHash: "hash",
            createdAt: now,
            updatedAt: now
        },
        sessionOwnership: {}
    });
}

describe("meeting commit diagnostics", () => {
    it("reports durable event identity and waiting duration without payloads or duplicate events", () => {
        const before = projection();
        const after = structuredClone(before);
        after.snapshot!.state.status = "running";
        after.events["event-1"] = {
            formatVersion: 1,
            eventSeq: 1,
            meetingVersion: 4,
            type: "meeting.resumed",
            payload: { privateBody: "PRIVATE_SENTINEL", sessionId: "SESSION_SECRET" },
            turnId: null,
            attemptId: null,
            createdAt: now
        };
        const records: MeetingDiagnostic[] = [];
        observeCommit((record) => records.push(record), "meeting-1", before, after, now);
        expect(records[0]?.metrics.waitingDurationMs).toBe(50);
        expect(records[1]).toMatchObject({
            eventType: "meeting.resumed",
            eventSeq: 1,
            meetingVersion: 4,
            timestamp: now
        });
        expect(JSON.stringify(records)).not.toMatch(
            /PRIVATE_SENTINEL|SESSION_SECRET|privateBody|sessionId/
        );
        records.length = 0;
        observeCommit((record) => records.push(record), "meeting-1", after, after, now);
        expect(records.map((record) => record.eventType)).toEqual(["meeting.observed"]);
    });
    it("keeps logger failure outside durability and reports rejected stale commands without a domain event", async () => {
        const records: MeetingDiagnostic[] = [];
        const repository = await DomainMeetingRepository.open({
            teamId: "team-1",
            meetingId: "meeting-1",
            catalogDomain: createFakeCatalogDomain(),
            meetingDomain: createFakeMeetingDomain(),
            authorizationValidator: { validateCreate() {}, validateCommand() {} },
            now: () => now,
            onDiagnostic: (record) => {
                records.push(record);
                throw new Error("logger unavailable");
            }
        });
        const input = {
            requestId: "create",
            requestHash: "hash",
            authorization: { callerBinding: "captain:c", capabilityId: "captain:c" },
            initialState: { count: 0 }
        };
        await repository.create(input);
        await repository.completeCreate(input);
        const before = await repository.read();
        const eventCount = records.filter(
            (record) => record.eventType === "meeting.created"
        ).length;
        await repository.completeCreate(input);
        expect(records.filter((record) => record.eventType === "meeting.created")).toHaveLength(
            eventCount
        );
        await expect(
            repository.execute({
                requestId: "stale",
                commandKind: "submit",
                requestHash: "stale",
                authorization: input.authorization,
                expectedMeetingVersion: before.version,
                transition() {
                    throw new DomainError("STALE_ATTEMPT", "private reason");
                }
            })
        ).rejects.toMatchObject({ code: "STALE_ATTEMPT" });
        expect(await repository.read()).toEqual(before);
        expect(records.at(-1)).toMatchObject({
            eventType: "repository.failed",
            errorCode: "STALE_ATTEMPT",
            metrics: { staleSubmits: 1 }
        });
        expect(JSON.stringify(records)).not.toContain("private reason");
        await repository.close();
    });
});
