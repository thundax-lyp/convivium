import { createHash } from "node:crypto";
import { JsonlStorageError } from "./errors.js";

export type JsonValue =
    null | boolean | string | number | JsonValue[] | { readonly [key: string]: JsonValue };

function validate(value: unknown, seen: Set<object>): asserts value is JsonValue {
    if (value === null || typeof value === "boolean" || typeof value === "string") return;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new JsonlStorageError("invalid-json-value", "non-finite number");
        return;
    }
    if (typeof value !== "object")
        throw new JsonlStorageError("invalid-json-value", "unsupported JSON value");
    if (seen.has(value)) throw new JsonlStorageError("invalid-json-value", "cyclic JSON value");
    seen.add(value);
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
            if (!Object.prototype.hasOwnProperty.call(value, i))
                throw new JsonlStorageError("invalid-json-value", "sparse array");
            validate(value[i], seen);
        }
    } else {
        for (const key of Object.keys(value))
            validate((value as Record<string, unknown>)[key], seen);
    }
    seen.delete(value);
}

function canonical(value: JsonValue): string {
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    return `{${Object.keys(value)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonical(value[k]!)}`)
        .join(",")}}`;
}

export function encodeCanonicalJson(value: unknown): Uint8Array {
    validate(value, new Set());
    return new TextEncoder().encode(canonical(value));
}

export function decodeCanonicalJson(bytes: Uint8Array): JsonValue {
    try {
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        validate(value, new Set());
        return value;
    } catch (error) {
        if (error instanceof JsonlStorageError) throw error;
        throw new JsonlStorageError("invalid-json-value", "invalid JSON", { cause: error });
    }
}

export function sha256Hex(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}
