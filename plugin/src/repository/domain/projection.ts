import type { MeetingBootstrap, MeetingSnapshot, SessionOwnership } from "../types.js";
import { applyPatch } from "./json-patch.js";
import {
    decodeCanonicalJson,
    encodeCanonicalJson,
    sha256Hex,
    type JsonValue
} from "./canonical-json.js";
import { seqKey, type SeqKey } from "./keys.js";
import {
    CommitRecordV1Schema,
    PersistenceProjectionV1Schema,
    type CommitRecordV1,
    type PersistenceProjectionV1
} from "./schemas.js";
import type { MeetingDomain } from "./specs.js";

export const MAX_COMMIT_VALUE_BYTES = 65_536;
export const CHECKPOINT_PAGE_RAW_BYTES = 20_000;
export const APPLICATION_CHECKPOINT_TRIGGER_COMMITS = 128;
export const APPLICATION_CHECKPOINT_TRIGGER_BYTES = 2_097_152;
export const APPLICATION_TAIL_HARD_COMMITS = 256;
export const APPLICATION_TAIL_HARD_BYTES = 4_194_304;
export const MAX_APPLICATION_CHECKPOINT_BYTES = 16_777_216;

export class UnsupportedMeetingStateFormatError extends Error {
    constructor(readonly formatVersion: unknown) {
        super(`Unsupported MeetingState format: ${String(formatVersion)}`);
        this.name = "UnsupportedMeetingStateFormatError";
    }
}

function emptyMaps(): Pick<
    PersistenceProjectionV1,
    "receipts" | "events" | "outbox" | "sessionOwnership" | "privateMail"
> {
    return {
        receipts: Object.create(null),
        events: Object.create(null),
        outbox: Object.create(null),
        sessionOwnership: Object.create(null),
        privateMail: Object.create(null)
    };
}

export function createProjection(input: {
    readonly snapshot: MeetingSnapshot | null;
    readonly bootstrap: MeetingBootstrap;
    readonly sessionOwnership: Readonly<Record<string, SessionOwnership>>;
}): PersistenceProjectionV1 {
    const maps = emptyMaps();
    for (const [key, value] of Object.entries(input.sessionOwnership))
        maps.sessionOwnership[key] = value;
    return PersistenceProjectionV1Schema.parse({
        formatVersion: 1,
        snapshot: input.snapshot,
        bootstrap: structuredClone(input.bootstrap),
        ...maps,
        nextEventSeq: 1
    });
}

export function encodeProjection(projection: PersistenceProjectionV1): Uint8Array {
    const bytes = encodeCanonicalJson(PersistenceProjectionV1Schema.parse(projection));
    if (bytes.byteLength > MAX_APPLICATION_CHECKPOINT_BYTES)
        throw new RangeError("checkpoint projection is too large");
    return bytes;
}

export function decodeProjection(bytes: Uint8Array): PersistenceProjectionV1 {
    const projection = PersistenceProjectionV1Schema.parse(decodeCanonicalJson(bytes));
    const state = projection.snapshot?.state;
    if (state === undefined || !Object.prototype.hasOwnProperty.call(state, "formatVersion")) {
        return projection;
    }
    if (state.formatVersion !== 2) {
        throw new UnsupportedMeetingStateFormatError(state.formatVersion);
    }
    return projection;
}

function verifyCommitRecord(record: CommitRecordV1): void {
    CommitRecordV1Schema.parse(record);
    if (
        !Number.isSafeInteger(record.seq) ||
        record.seq < 1 ||
        !Number.isSafeInteger(record.previousSeq) ||
        record.previousSeq < 0
    )
        throw new Error("invalid commit sequence");
    const { digest, ...withoutDigest } = record;
    if (sha256Hex(encodeCanonicalJson(withoutDigest)) !== digest)
        throw new Error("invalid commit digest");
    if (encodeCanonicalJson(record).byteLength > MAX_COMMIT_VALUE_BYTES)
        throw new RangeError("commit is too large");
}

export function createCommitRecord(input: Omit<CommitRecordV1, "digest">): CommitRecordV1 {
    const withoutDigest = { ...input };
    const record = { ...withoutDigest, digest: sha256Hex(encodeCanonicalJson(withoutDigest)) };
    verifyCommitRecord(record);
    return record;
}

export function foldCommitTail(input: {
    readonly baseProjection: PersistenceProjectionV1 | null;
    readonly baseSeq: number;
    readonly commits: readonly (readonly [SeqKey, CommitRecordV1])[];
}): PersistenceProjectionV1 {
    let projection = input.baseProjection;
    let previous: CommitRecordV1 | undefined;
    for (const [key, commit] of [...input.commits].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0
    )) {
        verifyCommitRecord(commit);
        if (commit.seq <= input.baseSeq) continue;
        if (
            key !== seqKey(commit.seq) ||
            commit.seq !== (previous ? previous.seq + 1 : input.baseSeq + 1) ||
            commit.previousSeq !== commit.seq - 1
        )
            throw new Error("invalid commit chain");
        const expectedDigest =
            previous?.digest ??
            (input.baseProjection ? projectionDigest(input.baseProjection) : null);
        if (commit.previousDigest !== expectedDigest) throw new Error("invalid commit predecessor");
        const source: JsonValue =
            projection === null ? null : decodeCanonicalJson(encodeProjection(projection));
        projection = decodeProjection(encodeCanonicalJson(applyPatch(source, commit.patch)));
        previous = commit;
    }
    if (!projection) throw new Error("missing projection");
    return projection;
}

export function loadProjection(input: { readonly domain: MeetingDomain }): PersistenceProjectionV1 {
    const pointer = input.domain.table("checkpoint_pointer").get("current");
    let baseProjection: PersistenceProjectionV1 | null = null;
    let baseSeq = 0;
    if (pointer) {
        const root = input.domain.table("checkpoint_roots").get(pointer.generation);
        if (
            !root ||
            root.baseSeq !== pointer.baseSeq ||
            sha256Hex(encodeCanonicalJson(root)) !== pointer.rootDigest
        )
            throw new Error("invalid checkpoint root");
        const pages: Uint8Array[] = [];
        for (let index = 0; index < root.pageCount; index++) {
            const page = input.domain
                .table("checkpoint_pages")
                .get(`${root.generation}_${index.toString().padStart(10, "0")}`);
            if (
                !page ||
                page.pageIndex !== index ||
                page.pageCount !== root.pageCount ||
                page.baseSeq !== root.baseSeq ||
                page.generation !== root.generation
            )
                throw new Error("invalid checkpoint page");
            const bytes = Uint8Array.from(Buffer.from(page.payloadBase64, "base64"));
            if (
                sha256Hex(bytes) !== page.payloadDigest ||
                bytes.byteLength > CHECKPOINT_PAGE_RAW_BYTES ||
                (index < root.pageCount - 1 && bytes.byteLength !== CHECKPOINT_PAGE_RAW_BYTES)
            )
                throw new Error("invalid checkpoint page");
            pages.push(bytes);
        }
        const bytes = Uint8Array.from(pages.flatMap((page) => [...page]));
        if (bytes.byteLength !== root.totalBytes || sha256Hex(bytes) !== root.projectionDigest)
            throw new Error("invalid checkpoint projection");
        baseProjection = decodeProjection(bytes);
        baseSeq = root.baseSeq;
    }
    return foldCommitTail({
        baseProjection,
        baseSeq,
        commits: [...input.domain.table("commits").entries()]
    });
}

export function projectionDigest(projection: PersistenceProjectionV1): string {
    return sha256Hex(encodeProjection(projection));
}
