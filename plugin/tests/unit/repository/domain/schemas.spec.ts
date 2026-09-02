import { describe, expect, it } from "vitest";
import { DomainEventTypes } from "../../../../src/domain/model.js";
import {
    CatalogMeetingRecordV1Schema,
    CheckpointPageV1Schema,
    CheckpointPointerV1Schema,
    CheckpointRootV1Schema,
    CommitRecordV1Schema,
    CreationRecordV1Schema,
    JsonObjectSchema,
    JsonPatchOperationV1Schema,
    JsonValueSchema,
    PersistedEventV1Schema,
    PersistedOutboxV1Schema,
    PersistedReceiptV1Schema,
    PersistenceProjectionV1Schema
} from "../../../../src/repository/domain/schemas.js";

describe("domain schemas", () => {
    const ownership = {
        s: {
            sessionId: "s",
            parentSessionId: "p",
            sessionLabel: "l",
            provider: "spawn",
            role: "participant",
            lifecycleStatus: "active",
            capabilityStatus: "active",
            createdAt: 1,
            updatedAt: 1
        }
    };
    const catalog = {
        formatVersion: 1,
        teamId: "t",
        meetingId: "m",
        domainName: "d",
        status: "ready",
        createRequestId: "r",
        requestHash: "h",
        createdAt: 1,
        updatedAt: 1,
        failureCode: null
    };
    const creation = {
        formatVersion: 1,
        teamId: "t",
        meetingId: "m",
        status: "creating",
        requestId: "r",
        requestHash: "h",
        authorization: { callerBinding: "c", capabilityId: "cap" },
        initialState: {},
        createResult: null,
        initialOutbox: [],
        sessionOwnership: ownership,
        createdAt: 1,
        updatedAt: 1,
        failureCode: null
    };
    const receipt = {
        formatVersion: 1,
        requestId: "r",
        commandKind: "c",
        callerBinding: "c",
        requestHash: "h",
        meetingVersion: 1,
        result: null,
        eventSeqs: [],
        createdAt: 1
    };
    const event = {
        formatVersion: 1,
        eventSeq: 1,
        meetingVersion: 1,
        type: DomainEventTypes[0],
        payload: {},
        turnId: null,
        attemptId: null,
        createdAt: 1
    };
    const outbox = {
        formatVersion: 1,
        id: "i",
        deliveryId: "d",
        kind: "dispatch",
        priority: 50,
        payload: {},
        status: "pending",
        attempts: 0,
        availableAt: 1,
        leaseOwner: null,
        leaseToken: null,
        leaseDeadline: null,
        deliveredAt: null,
        failedAt: null,
        lastError: null,
        createdAt: 1
    };
    const projection = {
        formatVersion: 1,
        snapshot: null,
        bootstrap: {
            status: "ready",
            createRequestId: "r",
            requestHash: "h",
            createdAt: 1,
            updatedAt: 1
        },
        receipts: {},
        events: {},
        outbox: {},
        sessionOwnership: {},
        privateMail: {},
        nextEventSeq: 1
    };
    const commit = {
        formatVersion: 1,
        seq: 1,
        previousSeq: 0,
        previousDigest: null,
        operation: "create",
        patch: [],
        committedAt: 1,
        digest: "0".repeat(64)
    };
    const page = {
        formatVersion: 1,
        generation: "g",
        baseSeq: 1,
        pageIndex: 0,
        pageCount: 1,
        payloadBase64: "eA==",
        payloadDigest: "0".repeat(64)
    };
    const root = {
        formatVersion: 1,
        generation: "g",
        baseSeq: 1,
        pageCount: 1,
        totalBytes: 1,
        projectionDigest: "0".repeat(64),
        createdAt: 1
    };
    const pointer = {
        formatVersion: 1,
        generation: "g",
        baseSeq: 1,
        rootDigest: "0".repeat(64),
        publishedAt: 1
    };
    const records = [
        [CatalogMeetingRecordV1Schema, catalog],
        [CreationRecordV1Schema, creation],
        [PersistedReceiptV1Schema, receipt],
        [PersistedEventV1Schema, event],
        [PersistedOutboxV1Schema, outbox],
        [PersistenceProjectionV1Schema, projection],
        [CommitRecordV1Schema, commit],
        [CheckpointPageV1Schema, page],
        [CheckpointRootV1Schema, root],
        [CheckpointPointerV1Schema, pointer]
    ] as const;

    it("accepts and strictly rejects every persistent record schema", () => {
        for (const [schema, value] of records) {
            expect(schema.safeParse(value).success).toBe(true);
            expect(schema.safeParse({ ...value, extra: true }).success).toBe(false);
        }
    });
    it("accepts all three strict patch operation schemas", () => {
        for (const value of [
            { op: "remove", path: ["a"] },
            { op: "set", path: ["a"], value: 1 },
            { op: "splice", path: ["a"], start: 0, deleteCount: 0, items: [] }
        ]) {
            expect(JsonPatchOperationV1Schema.safeParse(value).success).toBe(true);
            expect(JsonPatchOperationV1Schema.safeParse({ ...value, extra: true }).success).toBe(
                false
            );
        }
    });
    it("rejects missing required fields, explicit unknown fields and dangerous map keys", () => {
        for (const [schema, value] of records) {
            const copy = { ...value };
            Reflect.deleteProperty(copy, "formatVersion");
            expect(schema.safeParse(copy).success).toBe(false);
        }
        expect(JsonObjectSchema.safeParse({ allowed: 1, extra: undefined }).success).toBe(false);
        const dangerous = JSON.parse('{"__proto__":1}');
        expect(JsonValueSchema.safeParse({ nested: [1, true] }).success).toBe(true);
        expect(JsonValueSchema.safeParse(dangerous).success).toBe(false);
        expect(JsonObjectSchema.safeParse(dangerous).success).toBe(false);
        expect(
            CreationRecordV1Schema.safeParse({
                ...creation,
                sessionOwnership: dangerous
            }).success
        ).toBe(false);
        for (const field of [
            "receipts",
            "events",
            "outbox",
            "sessionOwnership",
            "privateMail"
        ] as const) {
            expect(
                PersistenceProjectionV1Schema.safeParse({
                    ...projection,
                    [field]: dangerous
                }).success
            ).toBe(false);
        }
    });
    it("preserves optional fields as omitted and nullable fields as required", () => {
        expect(CreationRecordV1Schema.safeParse(creation).success).toBe(true);
        expect(PersistenceProjectionV1Schema.safeParse(projection).success).toBe(true);
        for (const key of ["failureCode", "createResult"]) {
            const copy = { ...creation };
            Reflect.deleteProperty(copy, key);
            expect(CreationRecordV1Schema.safeParse(copy).success).toBe(false);
        }
        for (const key of ["failureCode", "createResult"]) {
            const copy = { ...projection, bootstrap: { ...projection.bootstrap } };
            Reflect.deleteProperty(copy.bootstrap, key);
            expect(PersistenceProjectionV1Schema.safeParse(copy).success).toBe(true);
        }
        expect(PersistedEventV1Schema.safeParse({ ...event, turnId: undefined }).success).toBe(
            false
        );
        expect(
            PersistedOutboxV1Schema.safeParse({ ...outbox, leaseOwner: undefined }).success
        ).toBe(false);
    });
});
