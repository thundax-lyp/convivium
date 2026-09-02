import {
    decodeCanonicalJson,
    encodeCanonicalJson,
    type JsonValue,
    sha256Hex
} from "./canonical-json.js";
import { JsonlStorageError } from "./errors.js";

export const MAX_KEY_BYTES = 4096;
export const MAX_DOMAIN_VALUE_BYTES = 98304;
export const MAX_OPERATION_LINE_BYTES = 131072;
export const SEGMENT_MAX_RECORDS = 256;
export const SEGMENT_MAX_BYTES = 4194304;

export interface OperationRecordV1 {
    formatVersion: 1;
    opSeq: number;
    kind: "put" | "delete" | "set_global";
    table: string | null;
    key: string | null;
    value: JsonValue | null;
    digest: string;
}
export interface UnitDescriptorRecordV1 {
    formatVersion: 1;
    name: string;
    unitVersion: number;
    tables: string[];
    hasGlobal: boolean;
    digest: string;
}

export interface PhysicalCheckpointRecordV1 {
    formatVersion: 1;
    table: string;
    key: string;
    value: JsonValue;
    digest: string;
}

export interface PhysicalCheckpointRootV1 {
    formatVersion: 1;
    generation: string;
    throughOpSeq: number;
    descriptorDigest: string;
    recordCount: number;
    recordsDigest: string;
    global: JsonValue | null;
    globalDigest: string;
}

export interface PhysicalCheckpointPointerV1 {
    formatVersion: 1;
    generation: string;
    throughOpSeq: number;
    rootDigest: string;
}

const sha256HexPattern = /^[0-9a-f]{64}$/;

function objectValue(value: JsonValue, message: string): Record<string, JsonValue> {
    if (value === null || Array.isArray(value) || typeof value !== "object")
        throw new JsonlStorageError("invalid-json-value", message);
    return value;
}

function exactKeys(value: Record<string, JsonValue>, keys: readonly string[]): void {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
        throw new JsonlStorageError("invalid-json-value", "invalid checkpoint fields");
}

function stringField(value: Record<string, JsonValue>, key: string): string {
    const field = value[key];
    if (typeof field !== "string")
        throw new JsonlStorageError("invalid-json-value", `invalid ${key}`);
    return field;
}

function nonNegativeInteger(value: Record<string, JsonValue>, key: string): number {
    const field = value[key];
    if (typeof field !== "number" || !Number.isSafeInteger(field) || field < 0)
        throw new JsonlStorageError("invalid-json-value", `invalid ${key}`);
    return field;
}

function digestField(value: Record<string, JsonValue>, key: string): string {
    const field = stringField(value, key);
    if (!sha256HexPattern.test(field))
        throw new JsonlStorageError("invalid-json-value", `invalid ${key}`);
    return field;
}

function checkpointRecordBody(record: Omit<PhysicalCheckpointRecordV1, "digest">) {
    return { formatVersion: 1 as const, table: record.table, key: record.key, value: record.value };
}

export function encodePhysicalCheckpointRecord(
    record: Omit<PhysicalCheckpointRecordV1, "digest">
): Uint8Array {
    const body = checkpointRecordBody(record);
    return encodeCanonicalJson({ ...body, digest: sha256Hex(encodeCanonicalJson(body)) });
}

export function decodePhysicalCheckpointRecord(bytes: Uint8Array): PhysicalCheckpointRecordV1 {
    const value = objectValue(decodeCanonicalJson(bytes), "invalid checkpoint record");
    exactKeys(value, ["formatVersion", "table", "key", "value", "digest"]);
    if (value.formatVersion !== 1)
        throw new JsonlStorageError("invalid-json-value", "invalid checkpoint version");
    const table = stringField(value, "table");
    const key = stringField(value, "key");
    const digest = digestField(value, "digest");
    const body = { formatVersion: 1 as const, table, key, value: value.value! };
    if (sha256Hex(encodeCanonicalJson(body)) !== digest)
        throw new JsonlStorageError("invalid-json-value", "invalid checkpoint digest");
    return { ...body, digest };
}

export function encodePhysicalCheckpointRoot(root: PhysicalCheckpointRootV1): Uint8Array {
    return encodeCanonicalJson(root);
}

export function decodePhysicalCheckpointRoot(bytes: Uint8Array): PhysicalCheckpointRootV1 {
    const value = objectValue(decodeCanonicalJson(bytes), "invalid checkpoint root");
    exactKeys(value, [
        "formatVersion",
        "generation",
        "throughOpSeq",
        "descriptorDigest",
        "recordCount",
        "recordsDigest",
        "global",
        "globalDigest"
    ]);
    if (value.formatVersion !== 1)
        throw new JsonlStorageError("invalid-json-value", "invalid checkpoint version");
    const recordCount = nonNegativeInteger(value, "recordCount");
    const global = value.global;
    if (global === undefined) throw new JsonlStorageError("invalid-json-value", "invalid global");
    return {
        formatVersion: 1,
        generation: stringField(value, "generation"),
        throughOpSeq: nonNegativeInteger(value, "throughOpSeq"),
        descriptorDigest: digestField(value, "descriptorDigest"),
        recordCount,
        recordsDigest: digestField(value, "recordsDigest"),
        global,
        globalDigest: digestField(value, "globalDigest")
    };
}

export function encodePhysicalCheckpointPointer(pointer: PhysicalCheckpointPointerV1): Uint8Array {
    return encodeCanonicalJson(pointer);
}

export function decodePhysicalCheckpointPointer(bytes: Uint8Array): PhysicalCheckpointPointerV1 {
    const value = objectValue(decodeCanonicalJson(bytes), "invalid checkpoint pointer");
    exactKeys(value, ["formatVersion", "generation", "throughOpSeq", "rootDigest"]);
    if (value.formatVersion !== 1)
        throw new JsonlStorageError("invalid-json-value", "invalid checkpoint version");
    return {
        formatVersion: 1,
        generation: stringField(value, "generation"),
        throughOpSeq: nonNegativeInteger(value, "throughOpSeq"),
        rootDigest: digestField(value, "rootDigest")
    };
}

export function encodeRecord(record: Omit<OperationRecordV1, "digest">): Uint8Array {
    const digest = sha256Hex(encodeCanonicalJson(record));
    return encodeCanonicalJson({ ...record, digest });
}
export function decodeRecord(bytes: Uint8Array): OperationRecordV1 {
    const value = decodeCanonicalJson(bytes) as Record<string, JsonValue>;
    if (
        value.formatVersion !== 1 ||
        typeof value.opSeq !== "number" ||
        !Number.isInteger(value.opSeq) ||
        value.opSeq < 1 ||
        !["put", "delete", "set_global"].includes(String(value.kind)) ||
        typeof value.digest !== "string"
    )
        throw new JsonlStorageError("invalid-json-value", "invalid operation");
    const { digest, ...rest } = value;
    if (sha256Hex(encodeCanonicalJson(rest)) !== digest)
        throw new JsonlStorageError("invalid-json-value", "invalid digest");
    return value as unknown as OperationRecordV1;
}

export const encodeOperationRecord = encodeRecord;
export const decodeOperationRecord = decodeRecord;
