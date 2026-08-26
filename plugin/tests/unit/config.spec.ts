import { describe, expect, it } from "vitest";

import { Config } from "../../src/config.js";

const validConfig = {
    provider: "spawn"
};

describe("Convivium runtime config", () => {
    it("requires an explicit provider and supplies bounded runtime defaults", () => {
        expect(Config(validConfig)).toEqual({
            provider: "spawn",
            maxParticipants: 3,
            speakerTimeoutMs: 60_000,
            outboxPollMs: 1_000
        });
        expect(() => Config({})).toThrow(/provider/);
        expect(() => Config({ provider: "   " })).toThrow(/provider/);
    });

    it("accepts only a controlled relative data root", () => {
        expect(Config({ ...validConfig, dataRoot: "convivium-data/meetings" }).dataRoot).toBe(
            "convivium-data/meetings"
        );

        for (const dataRoot of ["/tmp/convivium", "../outside", "data/../outside", "C:\\temp"]) {
            expect(() => Config({ ...validConfig, dataRoot })).toThrow(/dataRoot/);
        }
    });

    it("rejects participant and polling values outside their safe integer bounds", () => {
        for (const invalid of [2, 33, 3.5, Number.POSITIVE_INFINITY]) {
            expect(() => Config({ ...validConfig, maxParticipants: invalid })).toThrow(
                /maxParticipants/
            );
        }

        for (const key of ["speakerTimeoutMs", "outboxPollMs"] as const) {
            expect(() => Config({ ...validConfig, [key]: 0 })).toThrow(new RegExp(key));
            expect(() => Config({ ...validConfig, [key]: 1.5 })).toThrow(new RegExp(key));
            expect(() => Config({ ...validConfig, [key]: Number.POSITIVE_INFINITY })).toThrow(
                new RegExp(key)
            );
        }
    });
});
