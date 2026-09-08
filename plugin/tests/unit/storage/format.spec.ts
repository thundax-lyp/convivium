import { describe, expect, it } from "vitest";
import { decodeRecord, encodeRecord } from "@/storage/format.js";

describe("JSONL storage format validation", () => {
    it("round trips operation records", () => {
        const b = encodeRecord({
            formatVersion: 1,
            opSeq: 1,
            kind: "put",
            table: "t",
            key: "k",
            value: 1
        });
        expect(decodeRecord(b).digest).toHaveLength(64);
    });
});
