import { describe, expect, it } from "vitest";
import {
    catalogKey,
    generation,
    meetingDomainName,
    meetingIdFor,
    receiptKey,
    seqKey
} from "@/repository/domain/keys.js";
describe("Meeting storage key encoding", () => {
    it("derives every key and identity formula exactly", () => {
        expect(meetingIdFor("request")).toBe("meeting-1f58b9145b24d108d7ac38887338b3ea");
        expect(meetingDomainName("meeting")).toBe("convivium_m_0fd924362117d03662f0e86e580ab01c");
        expect(catalogKey("meeting")).toBe(
            "0c47a6053a40a27495035eeb5f9d86a9a90a2db418a5ccbc6cb19cf0e8117bd5"
        );
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
