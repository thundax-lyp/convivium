import { describe, expect, it } from "vitest";
import {
    decodeCanonicalJson,
    encodeCanonicalJson,
    sha256Hex
} from "../../../../src/repository/domain/canonical-json.js";
describe("domain canonical JSON", () => {
    it("sorts keys and produces a deterministic digest", () => {
        const bytes = encodeCanonicalJson({ b: 1, a: { d: true, c: null } });
        expect(new TextDecoder().decode(bytes)).toBe('{"a":{"c":null,"d":true},"b":1}');
        expect(sha256Hex(bytes)).toHaveLength(64);
    });
    it("round trips null-prototype JSON values", () => {
        const value = Object.assign(Object.create(null), { a: [null, true] });
        expect(decodeCanonicalJson(encodeCanonicalJson(value))).toEqual({ a: [null, true] });
    });
    it("rejects unsupported, cyclic, sparse and dangerous values", () => {
        expect(() => encodeCanonicalJson(undefined)).toThrow();
        const cyclic: { self?: unknown } = {};
        cyclic.self = cyclic;
        expect(() => encodeCanonicalJson(cyclic)).toThrow();
        const sparse = [];
        sparse.length = 2;
        expect(() => encodeCanonicalJson(sparse)).toThrow();
        const dangerous = JSON.parse('{"__proto__":1}');
        expect(() => encodeCanonicalJson(dangerous)).toThrow();
    });
});
