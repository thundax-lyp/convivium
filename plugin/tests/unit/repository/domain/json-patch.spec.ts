import { describe, expect, it } from "vitest";
import { applyPatch, diff } from "../../../../src/repository/domain/json-patch.js";
describe("domain JSON patch", () => {
    it("orders remove, recursive and set operations deterministically", () => {
        const before = { a: [1, 2], remove: true };
        const after = { a: [1, 3, 4], add: "x" };
        expect(diff(before, after).map((operation) => operation.op)).toEqual([
            "remove",
            "splice",
            "set"
        ]);
        expect(applyPatch(before, diff(before, after))).toEqual(after);
    });
    it("applies root and nested splice without mutating input", () => {
        const input = { a: [1, 2] };
        expect(
            applyPatch(input, [{ op: "splice", path: ["a"], start: 1, deleteCount: 1, items: [3] }])
        ).toEqual({ a: [1, 3] });
        expect(input).toEqual({ a: [1, 2] });
        expect(
            applyPatch([1, 2], [{ op: "splice", path: [], start: 1, deleteCount: 1, items: [3] }])
        ).toEqual([1, 3]);
    });
    it("applies primitive and root replacement", () => {
        expect(applyPatch({ a: 1 }, [{ op: "set", path: [], value: 2 }])).toBe(2);
        expect(applyPatch({ a: 1 }, [{ op: "set", path: ["a"], value: 2 }])).toEqual({ a: 2 });
    });
    it("rejects illegal container, index and dangerous paths", () => {
        expect(() => applyPatch({}, [{ op: "set", path: ["__proto__"], value: 1 }])).toThrow();
        expect(() => applyPatch({ a: 1 }, [{ op: "remove", path: ["b"] }])).toThrow();
    });
});
