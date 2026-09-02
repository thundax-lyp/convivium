import { createHash } from "node:crypto";
import type { JsonObject } from "../types.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const dangerous = new Set(["__proto__", "prototype", "constructor"]);

function normalize(value: unknown, seen = new Set<object>()): JsonValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) {
        if (seen.has(value)) throw new TypeError("cyclic value");
        seen.add(value);
        const result: JsonValue[] = [];
        for (let index = 0; index < value.length; index += 1) {
            if (!Object.prototype.hasOwnProperty.call(value, index))
                throw new TypeError("sparse array");
            result.push(normalize(value[index], seen));
        }
        seen.delete(value);
        return result;
    }
    if (typeof value === "object" && value !== undefined) {
        if (
            Object.getPrototypeOf(value) !== Object.prototype &&
            Object.getPrototypeOf(value) !== null
        )
            throw new TypeError("non-plain object");
        if (seen.has(value)) throw new TypeError("cyclic value");
        seen.add(value);
        const result: JsonObject = Object.create(null);
        for (const [key, item] of Object.entries(value).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0
        )) {
            if (dangerous.has(key)) throw new TypeError("dangerous key");
            result[key] = normalize(item, seen);
        }
        seen.delete(value);
        return result;
    }
    throw new TypeError("value is not JSON");
}

export function encodeCanonicalJson(value: unknown): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(normalize(value)));
}

export function decodeCanonicalJson(bytes: Uint8Array): JsonValue {
    return normalize(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

export function sha256Hex(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}
