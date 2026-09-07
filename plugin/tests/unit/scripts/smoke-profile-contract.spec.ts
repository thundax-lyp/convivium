import { describe, expect, it } from "vitest";
import { validateScenarioResult as validateResult } from "../../../scripts/smoke-profile/index.mjs";
import { MeetingStatusResultSchema } from "../../../src/protocol/status.js";
import { createConvergenceFixture } from "./convergence-fixture.js";
const validateScenarioResult = (value: unknown, scenario: string) =>
    validateResult(value, scenario, MeetingStatusResultSchema);

describe("actual archived DTO contract", () => {
    it("fails closed without the formal schema validator", () => {
        expect(() =>
            validateResult(createConvergenceFixture("convergence-stalled"), "convergence-stalled")
        ).toThrow("Convergence runtime result is invalid.");
    });
    it.each([
        "objectiveContract",
        "participantProvenance",
        "schemaVersion",
        "nested",
        "maxStalls",
        "maxReplans"
    ])("rejects invalid %s in the actual result", (fault) => {
        const fixture = createConvergenceFixture("convergence-stalled");
        const archive = fixture.observed.archived;
        const pkg = archive.archive.package;
        if (fault === "schemaVersion") Reflect.set(pkg, "schemaVersion", 999);
        else if (fault === "nested") Reflect.set(pkg.participantProvenance[0]!, "displayName", 123);
        else if (fault === "maxStalls" || fault === "maxReplans") Reflect.set(archive, fault, 3);
        else Reflect.deleteProperty(pkg, fault);
        expect(() => validateScenarioResult(fixture, fixture.scenario)).toThrow(
            "Convergence runtime result is invalid."
        );
    });
});

describe("persisted smoke observations", () => {
    it.each(["convergence-stalled", "convergence-turn-budget-completion"] as const)(
        "accepts %s without mutating its DTO",
        (scenario) => {
            const fixture = createConvergenceFixture(scenario);
            const before = structuredClone(fixture);
            expect(validateScenarioResult(fixture, scenario)).toEqual(fixture);
            expect(fixture).toEqual(before);
        }
    );
    it.each([
        "meeting",
        "transcript",
        "termination",
        "late",
        "changed",
        "resident",
        "child",
        "completion"
    ])("rejects broken %s evidence", (fault) => {
        const fixture = createConvergenceFixture("convergence-turn-budget-completion");
        const o = fixture.observed;
        switch (fault) {
            case "meeting":
                o.archived.meetingId = "other";
                break;
            case "transcript":
                o.archived.archive.package.formalTranscript[0]!.id = "other";
                break;
            case "termination":
                o.archived.termination.code = "stalled";
                break;
            case "late":
                o.lateSubmit.code = "UNKNOWN";
                break;
            case "changed":
                o.stableAfterLateSubmit = false;
                break;
            case "resident":
                o.residentSessionIds.push("m-manager-manager");
                break;
            case "child":
                o.children.pop();
                break;
            case "completion":
                o.archived.archive.package.completionFacts = [];
                break;
        }
        expect(() => validateScenarioResult(fixture, fixture.scenario)).toThrow(
            "Convergence runtime result is invalid."
        );
    });
});

it("requires baseline attendance rejection evidence without changing timeout validation", () => {
    const baseline = {
        ok: true,
        scenario: "baseline",
        assertions: ["baseline-transcript-acb", "baseline-http-pause-resume"]
    };
    expect(() => validateScenarioResult(baseline, "baseline")).toThrow(
        "Baseline attendance rejection assertion is missing."
    );
    const complete = {
        ...baseline,
        assertions: [...baseline.assertions, "attendance-reject-tool-zero-effects"]
    };
    expect(validateScenarioResult(complete, "baseline")).toEqual(complete);
    const timeout = { ok: true, scenario: "timeout", assertions: [] };
    expect(validateScenarioResult(timeout, "timeout")).toEqual(timeout);
});
