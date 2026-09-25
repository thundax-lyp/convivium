import { describe, expect, it } from "vitest";
import { CreationRecordSchema, PersistenceProjectionSchema } from "@/repository/domain/schemas.js";
import { decodeProjection, encodeProjection } from "@/repository/domain/projection.js";

const binding = {
    agentDefinitionId: "convivium.domain_architect",
    definitionVersion: "2.0.0",
    definitionHash: "a".repeat(64)
};
const resources = {
    instructions: {
        roleDefinitionId: "domain_architect",
        version: "2.0.0",
        sha256: "b".repeat(64)
    },
    presetId: "convivium-domain-architect",
    presetSha256: "c".repeat(64),
    skills: [{ name: "repository-analysis", sha256: "d".repeat(64) }],
    compositionHash: "e".repeat(64)
};
const descriptor = {
    descriptorId: "descriptor",
    meetingId: "meeting",
    identityId: "identity",
    sessionId: "session",
    definition: binding,
    resources,
    agentOptions: { provider: "provider", model: "model" },
    descriptorHash: "f".repeat(64),
    expiresAt: 300000
};
const ownership = {
    id: "ownership",
    meetingId: "meeting",
    identityId: "identity",
    sessionId: "session",
    definition: binding,
    resources,
    agentOptions: descriptor.agentOptions,
    descriptorId: "descriptor",
    descriptorHash: descriptor.descriptorHash,
    sessionLabel: "role",
    role: "participant",
    lifecycleStatus: "provisioning",
    capabilityStatus: "active",
    createdAt: 0,
    updatedAt: 0
};
const creator = { kind: "local_user", principalId: "local-controller" };
const projection = {
    formatVersion: 2,
    snapshot: null,
    bootstrap: {
        status: "creating",
        createRequestId: "create",
        requestHash: "hash",
        creator,
        createdAt: 0,
        updatedAt: 0
    },
    preparedDescriptors: [descriptor],
    sessionOwnership: { session: ownership },
    receipts: {},
    facts: {},
    events: {},
    outbox: {},
    privateMail: {},
    nextEventSeq: 1
};
const creation = {
    formatVersion: 2,
    meetingId: "meeting",
    status: "creating",
    requestId: "create",
    requestHash: "hash",
    authorization: { callerBinding: "local-controller", capabilityId: "local" },
    creator,
    initialState: {},
    createResult: null,
    initialOutbox: [],
    preparedDescriptors: [descriptor],
    sessionOwnership: { session: ownership },
    createdAt: 0,
    updatedAt: 0,
    failureCode: null
};

describe("peer ownership persistence format", () => {
    it("round trips explicit resource/model bindings and optional audit source", () => {
        expect(CreationRecordSchema.parse(creation)).toEqual(creation);
        const parsed = PersistenceProjectionSchema.parse(projection);
        expect(decodeProjection(encodeProjection(parsed))).toEqual(projection);
        expect(
            CreationRecordSchema.parse({
                ...creation,
                creator: { ...creator, sourceSessionId: "input" }
            }).creator.sourceSessionId
        ).toBe("input");
    });
    it.each([
        "parentSessionId",
        "childSessionId",
        "provider",
        "initialMessageId",
        "participantId",
        "supersededBySessionId"
    ])("rejects legacy ownership field %s", (field) => {
        expect(
            PersistenceProjectionSchema.safeParse({
                ...projection,
                sessionOwnership: { session: { ...ownership, [field]: "legacy" } }
            }).success
        ).toBe(false);
    });
    it("rejects missing and malformed private bindings", () => {
        for (const patch of [
            { definition: undefined },
            { resources: undefined },
            { agentOptions: { model: "only" } },
            { id: "" },
            { createdAt: -1 },
            { descriptorHash: "invalid" }
        ]) {
            expect(
                PersistenceProjectionSchema.safeParse({
                    ...projection,
                    sessionOwnership: { session: { ...ownership, ...patch } }
                }).success
            ).toBe(false);
        }
        expect(CreationRecordSchema.safeParse({ ...creation, creator: null }).success).toBe(false);
        expect(
            CreationRecordSchema.safeParse({ ...creation, preparedDescriptors: undefined }).success
        ).toBe(false);
    });
    it("distinguishes obsolete format from malformed v2", () => {
        expect(() =>
            decodeProjection(
                new TextEncoder().encode(JSON.stringify({ ...projection, formatVersion: 1 }))
            )
        ).toThrow("Unsupported MeetingState format: 1");
        expect(() =>
            decodeProjection(
                new TextEncoder().encode(
                    JSON.stringify({ ...projection, preparedDescriptors: null })
                )
            )
        ).not.toThrow("Unsupported MeetingState format");
        expect(CreationRecordSchema.safeParse({ ...creation, formatVersion: 1 }).success).toBe(
            false
        );
    });
});
