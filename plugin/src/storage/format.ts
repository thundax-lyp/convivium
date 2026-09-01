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
