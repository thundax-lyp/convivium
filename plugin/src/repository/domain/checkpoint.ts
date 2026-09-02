import { type MeetingDomain } from "./specs.js";
import {
    type CheckpointPageV1,
    type CheckpointPointerV1,
    type PersistenceProjectionV1,
    CheckpointPageV1Schema,
    CheckpointPointerV1Schema,
    CheckpointRootV1Schema
} from "./schemas.js";
import {
    CHECKPOINT_PAGE_RAW_BYTES,
    MAX_APPLICATION_CHECKPOINT_BYTES,
    encodeProjection,
    projectionDigest
} from "./projection.js";
import { generation } from "./keys.js";
import { encodeCanonicalJson, sha256Hex } from "./canonical-json.js";

const pageKey = (gen: string, index: number): string =>
    `${gen}_${index.toString().padStart(10, "0")}`;
function sameBytes(a: unknown, b: unknown): boolean {
    const left = encodeCanonicalJson(a);
    const right = encodeCanonicalJson(b);
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
function checkedPage(page: CheckpointPageV1): void {
    const raw = Uint8Array.from(Buffer.from(page.payloadBase64, "base64"));
    if (
        Buffer.from(raw).toString("base64") !== page.payloadBase64 ||
        sha256Hex(raw) !== page.payloadDigest ||
        raw.byteLength > CHECKPOINT_PAGE_RAW_BYTES
    )
        throw new Error("invalid checkpoint page");
}
export async function writeCheckpoint(input: {
    readonly domain: MeetingDomain;
    readonly projection: PersistenceProjectionV1;
    readonly baseSeq: number;
    readonly createdAt: number;
}): Promise<CheckpointPointerV1> {
    const bytes = encodeProjection(input.projection);
    if (bytes.byteLength > MAX_APPLICATION_CHECKPOINT_BYTES)
        throw new RangeError("checkpoint too large");
    const digest = projectionDigest(input.projection);
    const gen = generation(input.baseSeq, digest);
    const pageCount = Math.ceil(bytes.byteLength / CHECKPOINT_PAGE_RAW_BYTES);
    const pages = input.domain.table("checkpoint_pages");
    for (let index = 0; index < pageCount; index += 1) {
        const raw = bytes.slice(
            index * CHECKPOINT_PAGE_RAW_BYTES,
            (index + 1) * CHECKPOINT_PAGE_RAW_BYTES
        );
        const page = CheckpointPageV1Schema.parse({
            formatVersion: 1,
            generation: gen,
            baseSeq: input.baseSeq,
            pageIndex: index,
            pageCount,
            payloadBase64: Buffer.from(raw).toString("base64"),
            payloadDigest: sha256Hex(raw)
        });
        checkedPage(page);
        const key = pageKey(gen, index);
        const existing = pages.get(key);
        if (existing) {
            if (!sameBytes(existing, page)) throw new Error("checkpoint page corruption");
        } else await pages.put(key, page);
    }
    const root = CheckpointRootV1Schema.parse({
        formatVersion: 1,
        generation: gen,
        baseSeq: input.baseSeq,
        pageCount,
        totalBytes: bytes.byteLength,
        projectionDigest: digest,
        createdAt: input.createdAt
    });
    const roots = input.domain.table("checkpoint_roots");
    const existingRoot = roots.get(gen);
    if (existingRoot) {
        if (!sameBytes(existingRoot, root)) throw new Error("checkpoint root corruption");
    } else await roots.put(gen, root);
    const rereadRoot = roots.get(gen);
    if (!rereadRoot || !sameBytes(rereadRoot, root)) throw new Error("checkpoint root corruption");
    const pointer = CheckpointPointerV1Schema.parse({
        formatVersion: 1,
        generation: gen,
        baseSeq: input.baseSeq,
        rootDigest: sha256Hex(encodeCanonicalJson(root)),
        publishedAt: input.createdAt
    });
    const pointerTable = input.domain.table("checkpoint_pointer");
    const current = pointerTable.get("current");
    if (current && current.baseSeq >= pointer.baseSeq) throw new Error("stale checkpoint");
    await pointerTable.put("current", pointer);
    await cleanupPublished(input.domain, pointer);
    return pointer;
}
async function cleanupPublished(
    domain: MeetingDomain,
    pointer: CheckpointPointerV1
): Promise<void> {
    const commits = domain.table("commits");
    for (const [key, commit] of [...commits.entries()])
        if (commit.seq <= pointer.baseSeq) {
            try {
                await commits.delete(key);
            } catch {
                /* best effort */
            }
        }
    const pages = domain.table("checkpoint_pages");
    for (const [key, page] of [...pages.entries()])
        if (page.generation !== pointer.generation) {
            try {
                await pages.delete(key);
            } catch {
                /* best effort */
            }
        }
    const roots = domain.table("checkpoint_roots");
    for (const [key, root] of [...roots.entries()])
        if (root.generation !== pointer.generation) {
            try {
                await roots.delete(key);
            } catch {
                /* best effort */
            }
        }
}
export async function collectApplicationOrphans(input: {
    readonly domain: MeetingDomain;
    readonly keepGeneration: string;
}): Promise<void> {
    const pages = input.domain.table("checkpoint_pages");
    for (const [key, page] of [...pages.entries()])
        if (page.generation !== input.keepGeneration) await pages.delete(key);
    const roots = input.domain.table("checkpoint_roots");
    for (const [key, root] of [...roots.entries()])
        if (root.generation !== input.keepGeneration) await roots.delete(key);
}
