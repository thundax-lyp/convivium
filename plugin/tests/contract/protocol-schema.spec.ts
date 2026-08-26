import { describe, expect, it } from "vitest";
import {
    validateProtocolError,
    validateProtocolSuccessEnvelope
} from "../../src/protocol/index.js";

describe("protocol envelope schemas", () => {
    it("accepts a versioned success envelope", () => {
        expect(
            validateProtocolSuccessEnvelope({
                protocolVersion: 1,
                ok: true,
                meetingId: "meeting-1",
                meetingVersion: 3,
                result: { status: "running" }
            })
        ).toEqual({
            protocolVersion: 1,
            ok: true,
            meetingId: "meeting-1",
            meetingVersion: 3,
            result: { status: "running" }
        });
    });

    it("rejects an unsupported protocol version", () => {
        expect(() =>
            validateProtocolSuccessEnvelope({
                protocolVersion: 2,
                ok: true,
                meetingId: "meeting-1",
                meetingVersion: 3,
                result: {}
            })
        ).toThrow();
    });

    it("requires retryability on protocol errors", () => {
        expect(() =>
            validateProtocolError({
                protocolVersion: 1,
                ok: false,
                code: "INVALID_ARGUMENT",
                message: "invalid request"
            })
        ).toThrow();
    });
});
