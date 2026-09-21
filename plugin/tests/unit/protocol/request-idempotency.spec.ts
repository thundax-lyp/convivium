import { describe, expect, it } from "vitest";
import { serializeValidatedRequest } from "@/protocol/request-idempotency.js";

describe("request identity canonical serialization", () => {
    it("sorts object keys while preserving array order and omitting undefined properties", () => {
        expect(
            serializeValidatedRequest({
                attemptId: "attempt-1",
                reasonCode: "timeout",
                observedMeetingVersion: 4,
                omitted: undefined,
                ids: ["first", "second"]
            })
        ).toBe(
            '{"attemptId":"attempt-1","ids":["first","second"],"observedMeetingVersion":4,"reasonCode":"timeout"}'
        );
    });

    it("does not trim strings or reorder arrays", () => {
        expect(serializeValidatedRequest({ value: "  retained  ", ids: ["b", "a"] })).toBe(
            '{"ids":["b","a"],"value":"  retained  "}'
        );
    });
});
