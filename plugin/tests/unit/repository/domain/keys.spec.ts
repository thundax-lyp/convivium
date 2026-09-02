import { describe, expect, it } from "vitest";
import {
    catalogKey,
    generation,
    meetingDomainName,
    meetingIdFor,
    receiptKey,
    seqKey
} from "../../../../src/repository/domain/keys.js";
describe("domain keys", () => {
    it("derives every key and identity formula exactly", () => {
        expect(meetingIdFor("team", "request")).toMatch(/^meeting-[0-9a-f]{32}$/);
        expect(meetingDomainName("team", "meeting")).toMatch(/^convivium_m_[0-9a-f]{32}$/);
        expect(catalogKey("team", "meeting")).toHaveLength(64);
        expect(receiptKey("r", "c", "caller")).toBe(receiptKey("r", "c", "caller"));
        expect(seqKey(1)).toBe("00000000000000000001");
        expect(generation(1, "0123456789abcdef0123")).toBe("00000000000000000001_0123456789abcdef");
    });
    it("rejects invalid sequence keys", () => {
        expect(() => seqKey(0)).toThrow();
        expect(() => seqKey(-1)).toThrow();
        expect(() => seqKey(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    });
});
