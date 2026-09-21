import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    completeMeetingBusinessLoopResult,
    validateScenarioResult
} from "../../scripts/smoke-profile/result.mjs";
import {
    assertPortReleased,
    selectScenarios,
    stageScenarioRecord,
    writeScenarioRecord
} from "../../scripts/smoke-profile/index.mjs";

const hotResult = {
    ok: true,
    scenario: "meeting-business-loop",
    meetingId: "meeting-1",
    assertions: [
        "target-create",
        "meeting-started",
        "four-fixture-rounds",
        "four-review-batches",
        "worker-authority",
        "four-published-rounds",
        "archived"
    ],
    observed: {
        status: "archived",
        rounds: ["literature", "source", "implementation", "decision"].map((id) => ({
            id,
            question: `${id} question`,
            sourceScope: `${id}-fixture`,
            roundId: `round-${id}`,
            evidenceVersionIds: [`version-${id}-1`, `version-${id}-2`],
            publicationId: `publication-${id}`,
            reviewIds: [`review-${id}-1`, `review-${id}-2`]
        })),
        startedNoticeCounts: {
            "contributor-a": 1,
            "contributor-b": 1,
            "contributor-c": 1,
            "contributor-d": 1,
            "contributor-e": 1
        },
        workerSessionIds: Array.from({ length: 8 }, (_, index) => `worker-${index + 1}`),
        subtopicOrigin: "manager-round-goal"
    }
};

describe("Meeting business-loop smoke result", () => {
    it("runs only target runtime scenarios by default", () => {
        expect(selectScenarios([], undefined, false)).toEqual([
            "identity-admission",
            "meeting-business-loop"
        ]);
    });

    it("rejects the removed legacy contribution selector", () => {
        expect(() => selectScenarios([], "parallel-contribution", false)).toThrow(
            "Unsupported CONVIVIUM_SMOKE_SCENARIO"
        );
    });

    it("rejects Browser mode until a target-runtime Browser scenario exists", () => {
        expect(() => selectScenarios([], undefined, true)).toThrow(
            "Browser smoke is not implemented for the target runtime"
        );
    });

    it("accepts the result only after the archived Meeting survives a cold reopen", () => {
        const completed = completeMeetingBusinessLoopResult(hotResult, {
            ok: true,
            scenario: "meeting-business-loop-cold-reopen",
            meetingId: "meeting-1",
            status: "archived",
            archiveStatus: "complete"
        });

        expect(completed.assertions.at(-1)).toBe("cold-reopen");
        expect(completed.observed.coldReopen).toBe(true);
        expect(() => validateScenarioResult(completed, "meeting-business-loop")).not.toThrow();
    });

    it("rejects a cold reopen for a different Meeting", () => {
        expect(() =>
            completeMeetingBusinessLoopResult(hotResult, {
                ok: true,
                scenario: "meeting-business-loop-cold-reopen",
                meetingId: "meeting-2",
                status: "archived",
                archiveStatus: "complete"
            })
        ).toThrow("cold reopen");
    });

    it("waits for the stopped host to release its port", async () => {
        const server = createServer();
        await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address();
        if (address === null || typeof address === "string") throw new Error("missing test port");
        setTimeout(() => server.close(), 50);

        await expect(assertPortReleased(address.port)).resolves.toBeUndefined();
    });

    it("publishes the redacted PASS summary only after record staging completes", async () => {
        const root = await mkdtemp(join(tmpdir(), "convivium-smoke-record-test-"));
        try {
            const result = {
                ok: true,
                scenario: "identity-admission",
                probe: { secret: "smoke-secret" },
                bootLogs: {}
            };
            await stageScenarioRecord(root, result, "smoke-secret");
            await expect(readFile(join(root, "summary.json"), "utf8")).rejects.toMatchObject({
                code: "ENOENT"
            });

            await writeScenarioRecord(root, result, "smoke-secret");

            const text = await readFile(join(root, "summary.json"), "utf8");
            expect(JSON.parse(text)).toMatchObject({
                ok: true,
                scenario: "identity-admission",
                probe: { secret: "[REDACTED]" },
                recordScope: { source: "target-runtime-smoke" }
            });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
