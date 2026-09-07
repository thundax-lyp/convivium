import { describe, expect, it } from "vitest";
import { validateScenarioResult } from "../../../scripts/smoke-profile/index.mjs";

describe("meeting convergence smoke profile", () => {
    it("requires the complete convergence assertion set", () => {
        expect(() =>
            validateScenarioResult({ ok: true, scenario: "unknown", assertions: [] }, "unknown")
        ).not.toThrow();
        expect(() =>
            validateScenarioResult(
                {
                    ok: true,
                    scenario: "convergence",
                    assertions: [
                        "deterministic-fallback",
                        "fallback-replay-idempotent",
                        "fallback-status-projected"
                    ]
                },
                "convergence"
            )
        ).not.toThrow();
        expect(() =>
            validateScenarioResult(
                { ok: true, scenario: "convergence", assertions: ["deterministic-fallback"] },
                "convergence"
            )
        ).toThrow("Convergence smoke assertions are incomplete.");
    });

    const fixtures = [
        [
            "convergence-stalled",
            ["first-progress-baseline", "refocus-observed", "replan-observed", "partial-stalled"]
        ],
        [
            "convergence-no-consensus",
            [
                "first-progress-baseline",
                "refocus-observed",
                "replan-observed",
                "blocking-question-no-consensus"
            ]
        ],
        [
            "convergence-reset",
            [
                "first-progress-baseline",
                "refocus-observed",
                "replan-observed",
                "progress-resets-both-counters",
                "refocus-after-reset",
                "replan-after-reset",
                "partial-stalled"
            ]
        ],
        [
            "convergence-turn-budget-completion",
            [
                "last-valid-turn-before-budget",
                "business-completion-before-budget",
                "captain-completed-after-converging"
            ]
        ],
        [
            "convergence-message-budget-completion",
            [
                "last-valid-turn-before-budget",
                "business-completion-before-budget",
                "captain-completed-after-converging"
            ]
        ]
    ];

    it.each(fixtures)(
        "accepts complete %s result and rejects incomplete assertions",
        (scenario, assertions) => {
            const result = {
                ok: true,
                scenario,
                meetingId: `meeting-${scenario}`,
                assertions,
                observed: {}
            };
            expect(validateScenarioResult(result, scenario)).toEqual(result);
            expect(() =>
                validateScenarioResult({ ...result, assertions: assertions.slice(0, -1) }, scenario)
            ).toThrow("Convergence runtime result is invalid.");
        }
    );
});
