import { describe, expect, it } from "vitest";
import { decodeCanonicalJson, encodeCanonicalJson } from "../../../src/storage/canonical-json.js";

describe("canonical JSON", () => {
    it("sorts object keys and preserves arrays", () => {
        expect(new TextDecoder().decode(encodeCanonicalJson({ b: 1, a: [2, 3] }))).toBe(
            '{"a":[2,3],"b":1}'
        );
    });
    it("rejects unsupported values", () => {
        expect(() => encodeCanonicalJson(Number.NaN)).toThrow();
        expect(() => encodeCanonicalJson(undefined)).toThrow();
    });
    it("decodes JSON", () => {
        expect(decodeCanonicalJson(new TextEncoder().encode('{"a":1}'))).toEqual({ a: 1 });
    });
    it("preserves object keys that resemble prototype properties", () => {
        const source = new TextEncoder().encode('{"__proto__":1,"constructor":2,"prototype":3}');
        const decoded = decodeCanonicalJson(source) as Record<string, unknown>;
        expect(Object.keys(decoded).sort()).toEqual(["__proto__", "constructor", "prototype"]);
        expect(new TextDecoder().decode(encodeCanonicalJson(decoded))).toBe(
            '{"__proto__":1,"constructor":2,"prototype":3}'
        );
    });
});
