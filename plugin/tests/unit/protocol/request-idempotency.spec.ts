import { describe, expect, it } from "vitest";
import { serializeValidatedRequestV1 } from "../../../src/protocol/request-idempotency.js";

describe("serializeValidatedRequestV1", () => {
    it("preserves object and array order while omitting undefined properties", () => {
        expect(
            serializeValidatedRequestV1({
                attemptId: "attempt-1",
                reasonCode: "timeout",
                observedMeetingVersion: 4,
                omitted: undefined,
                ids: ["first", "second"]
            })
        ).toBe(
            '{"attemptId":"attempt-1","reasonCode":"timeout","observedMeetingVersion":4,"ids":["first","second"]}'
        );
    });

    it("does not trim strings or reorder arrays", () => {
        expect(serializeValidatedRequestV1({ value: "  retained  ", ids: ["b", "a"] })).toBe(
            '{"value":"  retained  ","ids":["b","a"]}'
        );
    });
});
