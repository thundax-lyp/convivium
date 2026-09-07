import { describe, expect, it } from "vitest";
import {
    createCommitRecord,
    createProjection,
    decodeProjection,
    encodeProjection,
    foldCommitTail,
    projectionDigest,
    UnsupportedMeetingStateFormatError,
    MAX_COMMIT_VALUE_BYTES,
    MAX_APPLICATION_CHECKPOINT_BYTES
} from "../../../../src/repository/domain/projection.js";
import { CommitRecordV1Schema } from "../../../../src/repository/domain/schemas.js";
import { encodeCanonicalJson } from "../../../../src/repository/domain/canonical-json.js";
describe("domain projection", () => {
    const bootstrap = {
        status: "ready" as const,
        createRequestId: "r",
        requestHash: "h",
        createdAt: 1,
        updatedAt: 1
    };
    it("constructs the required seq-one projection defaults", () => {
        const p = createProjection({ snapshot: null, bootstrap, sessionOwnership: {} });
        expect(p.nextEventSeq).toBe(1);
        for (const map of [p.receipts, p.events, p.outbox, p.sessionOwnership, p.privateMail])
            expect(Object.getPrototypeOf(map)).toBeNull();
    });
    it("encodes and decodes a deterministic null-prototype projection", () => {
        const p = createProjection({ snapshot: null, bootstrap, sessionOwnership: {} });
        expect(decodeProjection(encodeProjection(p))).toEqual(p);
    });
    it("keeps legacy and valid V2 state while classifying unsupported and malformed formats", () => {
        const withState = (state: Record<string, unknown>) => {
            const base = createProjection({
                snapshot: {
                    teamId: "team-1",
                    meetingId: "meeting-1",
                    version: 0,
                    state: { count: 0 },
                    createdAt: 1,
                    updatedAt: 1
                },
                bootstrap,
                sessionOwnership: {}
            });
            return { ...base, snapshot: { ...base.snapshot!, state } };
        };
        expect(
            decodeProjection(encodeCanonicalJson(withState({ count: 0 }))).snapshot?.state
        ).toEqual({ count: 0 });
        expect(
            decodeProjection(
                encodeCanonicalJson(
                    withState({ formatVersion: 2, manager: {}, attendanceRecommendations: [] })
                )
            ).snapshot?.state
        ).toMatchObject({ formatVersion: 2 });
        expect(() =>
            decodeProjection(encodeCanonicalJson(withState({ formatVersion: 3 })))
        ).toThrow(UnsupportedMeetingStateFormatError);
        expect(() =>
            decodeProjection(
                encodeCanonicalJson(
                    withState({ formatVersion: 2, manager: {}, attendanceRecommendations: null })
                )
            )
        ).toThrow(/MeetingState format 2 is malformed/);
    });
    it("creates and verifies a bounded deterministic commit", () => {
        const c = createCommitRecord({
            formatVersion: 1,
            seq: 1,
            previousSeq: 0,
            previousDigest: null,
            operation: "create",
            patch: [
                {
                    op: "set",
                    path: [],
                    value: createProjection({ snapshot: null, bootstrap, sessionOwnership: {} })
                }
            ],
            committedAt: 1
        });
        expect(CommitRecordV1Schema.parse(c)).toEqual(c);
        expect(
            encodeProjection(createProjection({ snapshot: null, bootstrap, sessionOwnership: {} }))
                .byteLength
        ).toBeLessThan(MAX_COMMIT_VALUE_BYTES);
    });
    it("rejects oversized commit and checkpoint projection values", () => {
        const huge = createProjection({
            snapshot: null,
            bootstrap: { ...bootstrap, requestHash: "x".repeat(MAX_APPLICATION_CHECKPOINT_BYTES) },
            sessionOwnership: {}
        });
        expect(() => encodeProjection(huge)).toThrow();
    });
    it("folds seq one and a continuous commit tail", () => {
        const p = createProjection({ snapshot: null, bootstrap, sessionOwnership: {} });
        const c = createCommitRecord({
            formatVersion: 1,
            seq: 1,
            previousSeq: 0,
            previousDigest: null,
            operation: "create",
            patch: [{ op: "set", path: [], value: p }],
            committedAt: 1
        });
        expect(
            foldCommitTail({
                baseProjection: null,
                baseSeq: 0,
                commits: [["00000000000000000001", c]]
            })
        ).toEqual(p);
    });
    it("rejects commit key, sequence gap, previous-link and digest conflicts", () => {
        const p = createProjection({ snapshot: null, bootstrap, sessionOwnership: {} });
        const c = createCommitRecord({
            formatVersion: 1,
            seq: 1,
            previousSeq: 0,
            previousDigest: null,
            operation: "create",
            patch: [{ op: "set", path: [], value: p }],
            committedAt: 1
        });
        expect(() =>
            foldCommitTail({ baseProjection: null, baseSeq: 0, commits: [["bad", c]] })
        ).toThrow();
        expect(foldCommitTail({ baseProjection: p, baseSeq: 1, commits: [] })).toEqual(p);
        const badAnchor = createCommitRecord({
            formatVersion: 1,
            seq: 2,
            previousSeq: 1,
            previousDigest: "wrong",
            operation: "update",
            patch: [],
            committedAt: 2
        });
        expect(() =>
            foldCommitTail({
                baseProjection: p,
                baseSeq: 1,
                commits: [["00000000000000000002", badAnchor]]
            })
        ).toThrow();
        const anchored = createCommitRecord({
            formatVersion: 1,
            seq: 2,
            previousSeq: 1,
            previousDigest: projectionDigest(p),
            operation: "update",
            patch: [],
            committedAt: 2
        });
        expect(
            foldCommitTail({
                baseProjection: p,
                baseSeq: 1,
                commits: [["00000000000000000002", anchored]]
            })
        ).toEqual(p);
        const badNext = {
            ...createCommitRecord({
                formatVersion: 1,
                seq: 3,
                previousSeq: 2,
                previousDigest: anchored.digest,
                operation: "update",
                patch: [],
                committedAt: 3
            }),
            previousDigest: "wrong"
        };
        expect(() =>
            foldCommitTail({
                baseProjection: p,
                baseSeq: 1,
                commits: [
                    ["00000000000000000002", anchored],
                    ["00000000000000000003", badNext]
                ]
            })
        ).toThrow();
        const next = createCommitRecord({
            formatVersion: 1,
            seq: 3,
            previousSeq: 2,
            previousDigest: anchored.digest,
            operation: "update",
            patch: [],
            committedAt: 3
        });
        expect(
            foldCommitTail({
                baseProjection: p,
                baseSeq: 1,
                commits: [
                    ["00000000000000000002", anchored],
                    ["00000000000000000003", next]
                ]
            })
        ).toEqual(p);
    });
    it("anchors the first post-checkpoint commit to the checkpoint projection digest", () => {
        const base = createProjection({ snapshot: null, bootstrap, sessionOwnership: {} });
        const firstPostCheckpoint = createCommitRecord({
            formatVersion: 1,
            seq: 2,
            previousSeq: 1,
            previousDigest: projectionDigest(base),
            operation: "update",
            patch: [{ op: "set", path: ["bootstrap", "updatedAt"], value: 2 }],
            committedAt: 2
        });
        expect(
            foldCommitTail({
                baseProjection: base,
                baseSeq: 1,
                commits: [["00000000000000000002", firstPostCheckpoint]]
            }).bootstrap.updatedAt
        ).toBe(2);
    });
    it("rejects a post-checkpoint predecessor that references a reclaimed commit", () => {
        const base = createProjection({ snapshot: null, bootstrap, sessionOwnership: {} });
        const reclaimed = createCommitRecord({
            formatVersion: 1,
            seq: 1,
            previousSeq: 0,
            previousDigest: null,
            operation: "create",
            patch: [],
            committedAt: 1
        });
        const firstPostCheckpoint = createCommitRecord({
            formatVersion: 1,
            seq: 2,
            previousSeq: 1,
            previousDigest: reclaimed.digest,
            operation: "update",
            patch: [],
            committedAt: 2
        });
        expect(() =>
            foldCommitTail({
                baseProjection: base,
                baseSeq: 1,
                commits: [["00000000000000000002", firstPostCheckpoint]]
            })
        ).toThrow();
    });
});

describe("attendance rejection persistence projection", () => {
    const recommendation = {
        id: "recommendation-1",
        candidateId: "candidate-1",
        roleDefinitionId: "domain_architect",
        roleDefinitionVersion: "1",
        displayName: "Architect",
        agentDefinitionId: "definition-private",
        agendaItemId: "agenda-1",
        rationale: "Review",
        expectedContribution: "Review",
        evidenceGapIds: [],
        urgency: "current_agenda",
        recommendedByManagerSessionId: "manager-private",
        catalogId: "catalog-1",
        catalogVersion: "1",
        planningAttemptId: "planning-1",
        status: "pending",
        createdAt: 1
    };
    const rejection = {
        requestId: "reject-1",
        actorBinding: "captain:captain-1",
        reason: "Not needed",
        rejectedAt: 100
    };
    function bytes(state: Record<string, unknown>) {
        const base = createProjection({
            snapshot: {
                teamId: "team-1",
                meetingId: "meeting-1",
                version: 1,
                state: {},
                createdAt: 1,
                updatedAt: 1
            },
            bootstrap: {
                status: "ready",
                createRequestId: "create",
                requestHash: "hash",
                createdAt: 1,
                updatedAt: 1
            },
            sessionOwnership: {}
        });
        return encodeCanonicalJson({ ...base, snapshot: { ...base.snapshot!, state } });
    }
    it("reads pending, rejected and legacy values without adding defaults", () => {
        for (const state of [
            { legacy: true },
            { formatVersion: 2, manager: {}, attendanceRecommendations: [recommendation] },
            {
                formatVersion: 2,
                manager: {},
                attendanceRecommendations: [{ ...recommendation, status: "rejected", rejection }]
            }
        ]) {
            expect(decodeProjection(bytes(state)).snapshot?.state).toEqual(state);
        }
    });
    it.each([
        { status: "rejected" },
        { status: "rejected", rejection: null },
        { rejection },
        { status: "rejected", rejection: { ...rejection, extra: true } },
        { status: "rejected", rejection: { ...rejection, actorBinding: "manager:x" } },
        { status: "rejected", rejection: { ...rejection, reason: " " } },
        { status: "rejected", rejection: { ...rejection, reason: " padded " } },
        { status: "rejected", rejection: { ...rejection, rejectedAt: -1 } },
        { status: "rejected", rejection: { reason: "Missing fields" } }
    ])("rejects malformed recommendation %j at the Schema boundary", (change) => {
        expect(() =>
            decodeProjection(
                bytes({
                    formatVersion: 2,
                    manager: {},
                    attendanceRecommendations: [{ ...recommendation, ...change }]
                })
            )
        ).toThrow(/MeetingState format 2 is malformed/);
    });
    it("keeps the unsupported-format exception at this layer", () => {
        expect(() => decodeProjection(bytes({ formatVersion: 3 }))).toThrow(
            UnsupportedMeetingStateFormatError
        );
    });
});
