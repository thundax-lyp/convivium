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
    it("correlates a revoked speaker with its own step after the current step advances", () => {
        const before = projection();
        before.snapshot!.state.currentTurn = {
            id: "turn-1",
            createdAt: now - 100,
            currentStepIndex: 1,
            steps: [
                {
                    id: "step-1",
                    attempt: {
                        attemptId: "attempt-1",
                        deliveryId: "delivery-1",
                        startedAt: now - 70
                    }
                },
                {
                    id: "step-2",
                    attempt: {
                        attemptId: "attempt-2",
                        deliveryId: "delivery-2",
                        startedAt: now - 10
                    }
                }
            ]
        };
        const after = structuredClone(before);
        after.events["event-1"] = {
            formatVersion: 1,
            eventSeq: 1,
            meetingVersion: 4,
            type: "speaker_attempt.revoked",
            payload: { attemptId: "attempt-1" },
            turnId: null,
            attemptId: null,
            createdAt: now
        };
        const records: MeetingDiagnostic[] = [];
        observeCommit((record) => records.push(record), "meeting-1", before, after, now);
        expect(records.at(-1)).toMatchObject({
            eventType: "speaker_attempt.revoked",
            turnId: "turn-1",
            stepId: "step-1",
            attemptId: "attempt-1",
            deliveryId: "delivery-1",
            metrics: { attemptDurationMs: 70 }
        });
    });
    it("restores active and waiting gauges on cold open without recounting historical events", async () => {
        const records: MeetingDiagnostic[] = [];
        const options = {
            teamId: "team-1",
            meetingId: "meeting-1",
            catalogDomain: createFakeCatalogDomain(),
            meetingDomain: createFakeMeetingDomain(),
            authorizationValidator: { validateCreate() {}, validateCommand() {} },
            now: () => now,
            onDiagnostic: (record: MeetingDiagnostic) => records.push(record)
        };
        const repository = await DomainMeetingRepository.open(options);
        const input = {
            requestId: "create",
            requestHash: "hash",
            authorization: { callerBinding: "captain:c", capabilityId: "captain:c" },
            initialState: projection().snapshot!.state
        };
        await repository.create(input);
        await repository.completeCreate(input);
        await repository.close();
        records.length = 0;
        const reopened = await DomainMeetingRepository.open(options);
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            eventType: "meeting.observed",
            metrics: { activeMeeting: 1, waitingMeeting: 1, outboxBacklog: 0 }
        });
        await reopened.close();
    });
    it("correlates dispatch retries and completion with the original attempt without copying private payloads", () => {
        const before = projection();
        before.outbox["outbox-1"] = {
            formatVersion: 1,
            id: "outbox-1",
            deliveryId: "delivery-1",
            kind: "dispatch",
            priority: 1,
            payload: {
                turnId: "turn-1",
                stepId: "step-1",
                attemptId: "attempt-1",
                prompt: "PRIVATE_PROMPT"
            },
            status: "leased",
            attempts: 1,
            availableAt: now - 20,
            leaseOwner: "worker",
            leaseToken: "SECRET_TOKEN",
            leaseDeadline: now + 10,
            deliveredAt: null,
            failedAt: null,
            lastError: null,
            createdAt: now - 20
        };
        const records: MeetingDiagnostic[] = [];
        for (const status of ["pending", "delivered"] as const) {
            const after = structuredClone(before);
            after.outbox["outbox-1"]!.status = status;
            observeCommit((record) => records.push(record), "meeting-1", before, after, now);
        }
        for (const eventType of ["delivery.retry", "delivery.completed"]) {
            expect(records).toContainEqual(
                expect.objectContaining({
                    eventType,
                    deliveryId: "delivery-1",
                    outboxKind: "dispatch",
                    turnId: "turn-1",
                    stepId: "step-1",
                    attemptId: "attempt-1"
                })
            );
        }
        expect(records.at(-1)?.metrics.dispatchDurationMs).toBe(20);
        expect(JSON.stringify(records)).not.toMatch(/PRIVATE_PROMPT|SECRET_TOKEN/);
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
            commandKind: "submit",
            metrics: { staleSubmits: 1 }
        });
        expect(JSON.stringify(records)).not.toContain("private reason");
        await repository.close();
    });
});
