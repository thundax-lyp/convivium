import { describe, expect, it } from "vitest";
import { validateScenarioResult } from "../../../scripts/smoke-profile/index.mjs";
import type { ArchivedMeetingStatusResultV1 } from "../../../src/protocol/types.js";
import { MeetingStatusResultSchema } from "../../../src/protocol/status.js";

type ConvergenceScenario =
    | "convergence-stalled"
    | "convergence-no-consensus"
    | "convergence-reset"
    | "convergence-turn-budget-completion"
    | "convergence-message-budget-completion";
interface ConvergenceFixture {
    ok: true;
    scenario: ConvergenceScenario;
    assertions: string[];
    meetingId: string;
    observed: {
        submissions: {
            turnId: string;
            turnSeq: number;
            attemptId: string;
            deliveryId: string;
            messageId: string;
            messageSeq: number;
            meetingVersion: number;
            meetingStatus: string;
        }[];
        checkpoints: {
            afterSubmission: number;
            meetingVersion: number;
            status: "running" | "converging";
            stallCount: number;
            maxStalls: 3;
            replanCount: number;
            maxReplans: 1;
            nextTurnId: string | null;
            intent: string | null;
            reason: string | null;
        }[];
        questionId: string | null;
        proposalId: string | null;
        endResult: { status: "completed"; terminationCode: "objective_satisfied" } | null;
        archived: ArchivedMeetingStatusResultV1;
        archivedVersion: number;
        lateSubmit: { kind: "protocol" | "tool"; code: string };
        stableAfterLateSubmit: boolean;
        children: { id: string; mode: "continuable"; activity: "inactive" }[];
        residentSessionIds: string[];
    };
}
const fixtureCases: {
    scenario: ConvergenceScenario;
    count: number;
    checkpointCount: number;
    outcome: string;
    code: string;
    maxTurns: number;
    maxMessages: number;
}[] = [
    {
        scenario: "convergence-stalled",
        count: 4,
        checkpointCount: 3,
        outcome: "partial",
        code: "stalled",
        maxTurns: 10,
        maxMessages: 100
    },
    {
        scenario: "convergence-no-consensus",
        count: 4,
        checkpointCount: 3,
        outcome: "no_consensus",
        code: "no_consensus",
        maxTurns: 10,
        maxMessages: 100
    },
    {
        scenario: "convergence-reset",
        count: 7,
        checkpointCount: 6,
        outcome: "partial",
        code: "stalled",
        maxTurns: 10,
        maxMessages: 100
    },
    {
        scenario: "convergence-turn-budget-completion",
        count: 2,
        checkpointCount: 2,
        outcome: "converging",
        code: "objective_satisfied",
        maxTurns: 2,
        maxMessages: 100
    },
    {
        scenario: "convergence-message-budget-completion",
        count: 2,
        checkpointCount: 2,
        outcome: "converging",
        code: "objective_satisfied",
        maxTurns: 10,
        maxMessages: 2
    }
];
function createConvergenceFixture(scenario: ConvergenceScenario): ConvergenceFixture {
    const c = fixtureCases.find((c) => c.scenario === scenario);
    if (!c) throw new Error("Missing fixture specification");
    const budget = c.count === 2,
        question = scenario === "convergence-no-consensus",
        reset = scenario === "convergence-reset",
        now = 1700000000000;
    const termination = {
        code: c.code,
        reason: c.code,
        decisionIds: [],
        unresolvedQuestionIds: question ? ["question-d0-1"] : []
    };
    const submissions = Array.from({ length: c.count }, (_, i) => ({
        turnId: "t" + i,
        turnSeq: i + 1,
        attemptId: "a" + i,
        deliveryId: "d" + i,
        messageId: "message-d" + i,
        messageSeq: i + 1,
        meetingVersion: 11 + i,
        meetingStatus: i === c.count - 1 ? c.outcome : "running"
    }));
    return {
        ok: true,
        scenario,
        meetingId: "m",
        assertions: [
            ...(budget
                ? [
                      "last-valid-turn-before-budget",
                      "business-completion-before-budget",
                      "captain-completed-after-converging"
                  ]
                : [
                      "first-progress-baseline",
                      "refocus-observed",
                      "replan-observed",
                      ...(reset
                          ? [
                                "progress-resets-both-counters",
                                "refocus-after-reset",
                                "replan-after-reset"
                            ]
                          : []),
                      question ? "blocking-question-no-consensus" : "partial-stalled"
                  ]),
            "terminal-submit-rejected",
            "archive-consistent",
            "sessions-drained"
        ],
        observed: {
            submissions,
            checkpoints: Array.from({ length: c.checkpointCount }, (_, i) => ({
                afterSubmission: i + 1,
                meetingVersion: 11 + i,
                status: budget && i === 1 ? "converging" : "running",
                stallCount: budget && i === 1 ? 0 : i % 3,
                maxStalls: 3,
                replanCount: budget && i === 1 ? 0 : i % 3 === 2 ? 1 : 0,
                maxReplans: 1,
                nextTurnId: budget && i === 1 ? null : "t" + (i + 1),
                intent: budget && i === 1 ? null : i % 3 === 0 ? "explore" : "refocus",
                reason: budget && i === 1 ? null : ["explore", "refocus", "replan"][i % 3]
            })),
            questionId: question ? "question-d0-1" : null,
            proposalId: reset ? "d3-proposal-1" : null,
            endResult: budget
                ? { status: "completed", terminationCode: "objective_satisfied" }
                : null,
            archivedVersion: 20 + c.count,
            lateSubmit: { kind: "protocol", code: "ARCHIVED_MEETING" },
            stableAfterLateSubmit: true,
            children: [
                { id: "m-manager-manager", mode: "continuable", activity: "inactive" },
                { id: "m-participant-participant-a", mode: "continuable", activity: "inactive" }
            ],
            residentSessionIds: [],
            archived: {
                meetingId: "m",
                meetingVersion: 20 + c.count,
                topic: "Convergence fixture",
                objective: "Verify convergence",
                continuationMaterials: [],
                limits: {
                    maxTurns: c.maxTurns,
                    maxSpeakersPerTurn: 1,
                    maxTotalMessages: c.maxMessages
                },
                meetingTasks: [],
                status: "archived",
                pendingHandRaises: [],
                pauseControl: { action: "none" },
                termination: structuredClone(termination),
                archive: {
                    archivedAt: now + 102,
                    package: {
                        schemaVersion: 1,
                        meetingId: "m",
                        teamId: "smoke-team",
                        finalSummary: c.code,
                        endedAt: now + 100,
                        materializedAt: now + 101,
                        objectiveContract: {
                            requiredOutputs: [],
                            acceptanceCriteria: [
                                {
                                    id: "criterion-smoke-order",
                                    description: "Smoke criterion",
                                    satisfied: budget
                                }
                            ],
                            hardConstraints: [],
                            requiredReviewers: [],
                            riskAcceptanceAuthority: [],
                            acceptableRiskLevel: "low"
                        },
                        agenda: [
                            {
                                id: "agenda-agenda-1",
                                title: "Smoke agenda",
                                objective: "Verify convergence",
                                inScope: ["convergence"],
                                outOfScope: [],
                                completionCriteria: ["criterion-smoke-order"],
                                requiredParticipants: ["participant-a"],
                                relatedTaskIds: [],
                                status: budget ? "resolved" : "discussing",
                                ...(budget ? { resolution: "Smoke criterion satisfied" } : {})
                            }
                        ],
                        artifactRefs: [],
                        acceptedDecisions: [],
                        decisionHistory: [],
                        issues: [],
                        parkingLot: [],
                        participantProvenance: [
                            { participantId: "participant-a", displayName: "A" }
                        ],
                        termination: structuredClone(termination),
                        formalTranscript: Array.from({ length: c.count }, (_, i) => ({
                            id: "message-d" + i,
                            seq: i + 1,
                            turnId: "t" + i,
                            stepId: "step-" + i,
                            speaker: "participant-a",
                            agendaItemId: "agenda-agenda-1",
                            kind: budget && i === 1 ? "evidence" : "statement",
                            content: scenario + ":a:" + (i + 1),
                            mentions: [],
                            taskIds: [],
                            createdAt: now + i
                        })),
                        unresolvedQuestions: question
                            ? [
                                  {
                                      id: "question-d0-1",
                                      text: "Unresolved smoke criterion",
                                      askedBy: "participant-a",
                                      agendaItemId: "agenda-agenda-1",
                                      blocking: true,
                                      affectedOutputIds: [],
                                      affectedCriterionIds: ["criterion-smoke-order"],
                                      violatedConstraintIds: [],
                                      status: "open"
                                  }
                              ]
                            : [],
                        proposals: reset
                            ? [
                                  {
                                      id: "d3-proposal-1",
                                      agendaItemId: "agenda-agenda-1",
                                      title: "New structured progress",
                                      description: "A new proposal after replan",
                                      revision: 1,
                                      status: "draft",
                                      positions: []
                                  }
                              ]
                            : [],
                        completionFacts: budget
                            ? [
                                  {
                                      id: "fact-criterion",
                                      kind: "criterion_evidence",
                                      subjectId: "criterion-smoke-order",
                                      assertedBy: "participant-a",
                                      result: "supported",
                                      evidenceMessageIds: ["message-d0"],
                                      taskIds: [],
                                      status: "active"
                                  },
                                  {
                                      id: "fact-agenda",
                                      kind: "agenda_resolution",
                                      subjectId: "agenda-agenda-1",
                                      assertedBy: "participant-a",
                                      result: "resolved",
                                      evidenceMessageIds: ["message-d0"],
                                      taskIds: [],
                                      status: "active",
                                      reason: "Smoke criterion satisfied"
                                  }
                              ]
                            : []
                    }
                }
            }
        }
    };
}
function assertFixtureContract(fixture: ConvergenceFixture): void {
    const { observed: o } = fixture,
        a = o.archived,
        p = a.archive.package;
    expect(() => MeetingStatusResultSchema({ ...a })).not.toThrow();
    expect(a).toMatchObject({
        meetingId: "m",
        topic: "Convergence fixture",
        objective: "Verify convergence",
        status: "archived",
        pauseControl: { action: "none" },
        meetingTasks: [],
        pendingHandRaises: [],
        continuationMaterials: []
    });
    expect(p).toMatchObject({
        schemaVersion: 1,
        meetingId: "m",
        teamId: "smoke-team",
        endedAt: 1700000000100,
        materializedAt: 1700000000101,
        artifactRefs: [],
        acceptedDecisions: [],
        decisionHistory: [],
        issues: [],
        parkingLot: [],
        participantProvenance: [{ participantId: "participant-a", displayName: "A" }]
    });
    expect(a.archive.archivedAt).toBe(1700000000102);
    expect(Object.hasOwn(p, "archivedAt")).toBe(false);
    expect(o.archivedVersion).toBe(a.meetingVersion);
    expect(a.termination).toEqual(p.termination);
    expect(a.termination).not.toBe(p.termination);
    for (const [i, message] of p.formalTranscript.entries()) {
        expect(message).toEqual({
            id: "message-d" + i,
            seq: i + 1,
            turnId: "t" + i,
            stepId: "step-" + i,
            speaker: "participant-a",
            agendaItemId: "agenda-agenda-1",
            kind: o.endResult && i === 1 ? "evidence" : "statement",
            content: fixture.scenario + ":a:" + (i + 1),
            mentions: [],
            taskIds: [],
            createdAt: 1700000000000 + i
        });
        expect(o.submissions[i]).toMatchObject({
            messageId: message.id,
            messageSeq: message.seq,
            turnId: message.turnId,
            turnSeq: i + 1,
            attemptId: "a" + i,
            deliveryId: "d" + i,
            meetingVersion: 11 + i
        });
    }
    expect(o.children).toEqual([
        { id: "m-manager-manager", mode: "continuable", activity: "inactive" },
        { id: "m-participant-participant-a", mode: "continuable", activity: "inactive" }
    ]);
    expect(o.residentSessionIds).toEqual([]);
}
function mutateFixture(
    fixture: ConvergenceFixture,
    path: readonly (string | number)[],
    operation: "delete" | "replace",
    replacement?: unknown
): unknown {
    const copy = structuredClone(fixture);
    let parent: unknown = copy;
    for (const key of path.slice(0, -1)) {
        if (typeof parent !== "object" || parent === null) throw new Error("Invalid mutation path");
        parent = Reflect.get(parent, key);
    }
    const key = path.at(-1);
    if (typeof parent !== "object" || parent === null || key === undefined)
        throw new Error("Invalid mutation path");
    if (operation === "delete") Reflect.deleteProperty(parent, key);
    else Reflect.set(parent, key, replacement);
    return copy;
}
describe("convergence fixture contract", () => {
    it.each(fixtureCases)("constructs independent $scenario DTO", (c) => {
        const f = createConvergenceFixture(c.scenario);
        assertFixtureContract(f);
        const o = f.observed,
            p = o.archived.archive.package;
        expect(o.submissions).toHaveLength(c.count);
        expect(o.checkpoints).toHaveLength(c.checkpointCount);
        expect(o.submissions.at(-1)?.meetingStatus).toBe(c.outcome);
        expect(o.archived.termination.code).toBe(c.code);
        expect(o.archived.limits).toEqual({
            maxTurns: c.maxTurns,
            maxSpeakersPerTurn: 1,
            maxTotalMessages: c.maxMessages
        });
        expect(o.archivedVersion).toBe(20 + c.count);
        const q = c.scenario === "convergence-no-consensus",
            r = c.scenario === "convergence-reset",
            b = c.count === 2;
        expect(o.questionId).toBe(q ? "question-d0-1" : null);
        expect(o.proposalId).toBe(r ? "d3-proposal-1" : null);
        expect(p.unresolvedQuestions).toHaveLength(q ? 1 : 0);
        if (q)
            expect(p.unresolvedQuestions[0]).toMatchObject({
                id: "question-d0-1",
                status: "open",
                blocking: true,
                askedBy: "participant-a",
                affectedCriterionIds: ["criterion-smoke-order"]
            });
        expect(p.proposals).toHaveLength(r ? 1 : 0);
        if (r) expect(p.proposals[0]).toMatchObject({ id: "d3-proposal-1", revision: 1 });
        expect(p.objectiveContract.acceptanceCriteria).toEqual([
            { id: "criterion-smoke-order", description: "Smoke criterion", satisfied: b }
        ]);
        expect(p.agenda[0]?.status).toBe(b ? "resolved" : "discussing");
        expect(
            p.completionFacts.map((f) => [f.kind, f.result, f.status, f.evidenceMessageIds])
        ).toEqual(
            b
                ? [
                      ["criterion_evidence", "supported", "active", ["message-d0"]],
                      ["agenda_resolution", "resolved", "active", ["message-d0"]]
                  ]
                : []
        );
        const before = JSON.stringify(f);
        mutateFixture(
            f,
            ["observed", "archived", "archive", "package", "formalTranscript", 0, "id"],
            "replace",
            "changed"
        );
        expect(JSON.stringify(f)).toBe(before);
        expect(createConvergenceFixture(c.scenario)).toEqual(f);
    });
});

const supportedCases = fixtureCases.filter((c) =>
    [
        "convergence-stalled",
        "convergence-no-consensus",
        "convergence-reset",
        "convergence-turn-budget-completion",
        "convergence-message-budget-completion"
    ].includes(c.scenario)
);
describe.each(supportedCases)("runtime result $scenario", (c) => {
    const fixture = createConvergenceFixture(c.scenario),
        o = fixture.observed;
    const O = ["observed"],
        A = [...O, "archived"],
        P = [...A, "archive", "package"];
    type Mutation = {
        name: string;
        path: (string | number)[];
        operation: "replace" | "delete";
        replacement?: unknown;
    };
    const mutations: Mutation[] = [];
    const change = (path: (string | number)[], replacement: unknown) =>
        mutations.push({
            name: path.join(".") + "=" + String(replacement),
            path,
            operation: "replace",
            replacement
        });
    const remove = (path: (string | number)[]) =>
        mutations.push({ name: "missing " + path.join("."), path, operation: "delete" });
    const records: { path: (string | number)[]; record: object }[] = [
        { path: [], record: fixture },
        { path: O, record: o },
        { path: [...O, "lateSubmit"], record: o.lateSubmit },
        ...o.submissions.map((record, i) => ({ path: [...O, "submissions", i], record })),
        ...o.checkpoints.map((record, i) => ({ path: [...O, "checkpoints", i], record })),
        ...o.children.map((record, i) => ({ path: [...O, "children", i], record }))
    ];
    for (const { path, record } of records) {
        if (path.length) {
            change(path, null);
            change(path, []);
        }
        change([...path, "extra"], true);
        for (const [key, value] of Object.entries(record)) {
            remove([...path, key]);
            if (typeof value === "number")
                for (const bad of ["1", -1, 1.5, NaN, Infinity]) change([...path, key], bad);
            if (typeof value === "string") {
                change([...path, key], "");
                change([...path, key], 1);
            }
            if (Array.isArray(value)) change([...path, key], {});
        }
    }
    change(["ok"], false);
    change(["scenario"], "wrong");
    for (const labels of [
        [],
        fixture.assertions.slice(0, -1),
        [...fixture.assertions, "extra"],
        fixture.assertions.map(() => fixture.assertions[0]),
        [fixture.assertions[1], fixture.assertions[0], ...fixture.assertions.slice(2)]
    ])
        change(["assertions"], labels);
    for (const key of ["submissions", "checkpoints", "children"] as const) {
        change([...O, key], o[key].slice(0, -1));
        change([...O, key], [...o[key], o[key][0]]);
    }
    for (const [i, s] of o.submissions.entries()) {
        for (const key of ["messageSeq", "turnSeq"]) {
            change([...O, "submissions", i, key], 0);
            change([...O, "submissions", i, key], 99);
        }
        change([...O, "submissions", i, "messageId"], "bad");
        change(
            [...O, "submissions", i, "meetingStatus"],
            i === c.count - 1 ? "running" : "partial"
        );
        if (i > 0)
            for (const key of ["turnId", "attemptId", "deliveryId", "messageId"] as const)
                change([...O, "submissions", i, key], o.submissions[0][key]);
        if (i > 0)
            change([...O, "submissions", i, "meetingVersion"], o.submissions[i - 1].meetingVersion);
        expect(s.messageSeq).toBe(i + 1);
    }
    for (const [i, cp] of o.checkpoints.entries()) {
        for (const key of [
            "afterSubmission",
            "meetingVersion",
            "stallCount",
            "maxStalls",
            "replanCount",
            "maxReplans"
        ] as const)
            change([...O, "checkpoints", i, key], cp[key] + 1);
        for (const key of ["status", "nextTurnId", "intent", "reason"])
            change([...O, "checkpoints", i, key], "wrong");
    }
    for (const path of [A, [...A, "archive"], P, [...A, "termination"], [...P, "termination"]]) {
        remove(path);
        change(path, null);
        change(path, {});
    }
    change([...A, "status"], "running");
    change([...A, "meetingId"], "other");
    change([...P, "meetingId"], "other");
    remove([...P, "meetingId"]);
    change([...O, "archivedVersion"], o.submissions.at(-1)?.meetingVersion);
    change([...O, "archivedVersion"], o.archivedVersion + 1);
    for (const path of [
        [...P, "endedAt"],
        [...A, "archive", "archivedAt"]
    ]) {
        remove(path);
        for (const bad of ["bad", NaN, Infinity]) change(path, bad);
    }
    for (const key of [
        "currentTurn",
        "currentSpeakerId",
        "currentAttemptId",
        "stallCount",
        "replanCount"
    ])
        change([...A, key], "x");
    for (const key of ["pendingHandRaises", "meetingTasks"]) {
        remove([...A, key]);
        change([...A, key], [{}]);
    }
    for (const path of [
        [...A, "termination"],
        [...P, "termination"]
    ]) {
        for (const key of ["code", "reason", "decisionIds", "unresolvedQuestionIds"]) {
            remove([...path, key]);
            change([...path, key], 1);
        }
        change([...path, "code"], "failed");
        change([...path, "reason"], "other");
        change([...path, "decisionIds"], ["x"]);
        change([...path, "unresolvedQuestionIds"], ["x"]);
    }
    remove([...P, "formalTranscript"]);
    change([...P, "formalTranscript"], {});
    change([...P, "formalTranscript"], o.archived.archive.package.formalTranscript.slice(1));
    change(
        [...P, "formalTranscript"],
        [
            ...o.archived.archive.package.formalTranscript,
            o.archived.archive.package.formalTranscript[0]
        ]
    );
    for (let i = 0; i < c.count; i++)
        for (const key of ["id", "seq", "turnId", "speaker", "content"]) {
            remove([...P, "formalTranscript", i, key]);
            change([...P, "formalTranscript", i, key], key === "seq" ? 99 : "wrong");
        }
    for (let i = 0; i < 2; i++) {
        change([...O, "children", i, "id"], "other");
        change([...O, "children", i, "id"], o.children[1 - i].id);
        change([...O, "children", i, "mode"], "one-shot");
        change([...O, "children", i, "activity"], "active");
    }
    change([...O, "residentSessionIds"], ["x"]);
    change([...O, "stableAfterLateSubmit"], false);
    for (const bad of ["STALE_ATTEMPT", "IDEMPOTENCY_CONFLICT", "unknown", "CAPABILITY_REVOKED"])
        change([...O, "lateSubmit", "code"], bad);
    change([...O, "lateSubmit", "kind"], "unknown");
    change([...O, "lateSubmit", "kind"], "tool");
    change([...O, "lateSubmit", "ok"], true);
    for (const key of ["questionId", "proposalId", "endResult"]) change([...O, key], "unexpected");
    if (c.scenario === "convergence-no-consensus") {
        change([...O, "questionId"], null);
        change([...O, "questionId"], "question-d3-1");
        remove([...P, "unresolvedQuestions"]);
        change([...P, "unresolvedQuestions"], []);
        for (const key of ["id", "status", "blocking", "askedBy"]) {
            remove([...P, "unresolvedQuestions", 0, key]);
            change([...P, "unresolvedQuestions", 0, key], key === "blocking" ? false : "wrong");
        }
        for (const path of [
            [...A, "termination"],
            [...P, "termination"]
        ])
            change([...path, "unresolvedQuestionIds"], []);
    }
    if (c.scenario === "convergence-reset") {
        change([...O, "proposalId"], null);
        change([...O, "proposalId"], "wrong");
        remove([...P, "proposals"]);
        change([...P, "proposals"], []);
        for (const key of ["id", "revision"]) {
            remove([...P, "proposals", 0, key]);
            change([...P, "proposals", 0, key], key === "revision" ? 2 : "wrong");
        }
        change([...O, "checkpoints", 3, "replanCount"], 1);
    }
    if (c.count === 2) {
        change([...O, "endResult"], null);
        for (const key of ["status", "terminationCode"]) {
            remove([...O, "endResult", key]);
            change([...O, "endResult", key], "wrong");
        }
        change([...O, "endResult", "extra"], true);
        change([...O, "submissions", 1, "meetingStatus"], "completed");
        for (const key of ["nextTurnId", "intent", "reason"])
            change([...O, "checkpoints", 1, key], "x");
        change([...P, "objectiveContract", "acceptanceCriteria", 0, "satisfied"], false);
        change([...P, "agenda", 0, "status"], "discussing");
        for (const path of [
            [...P, "objectiveContract"],
            [...P, "objectiveContract", "acceptanceCriteria"],
            [...P, "agenda"],
            [...P, "completionFacts"],
            [...A, "limits"]
        ]) {
            remove(path);
            change(path, {});
        }
        change([...P, "completionFacts"], []);
        for (let i = 0; i < 2; i++)
            for (const key of ["kind", "status", "subjectId", "evidenceMessageIds"]) {
                remove([...P, "completionFacts", i, key]);
                change(
                    [...P, "completionFacts", i, key],
                    key === "evidenceMessageIds" ? ["message-d1"] : "wrong"
                );
            }
        for (const key of ["maxTurns", "maxSpeakersPerTurn", "maxTotalMessages"] as const) {
            remove([...A, "limits", key]);
            change([...A, "limits", key], o.archived.limits[key] + 1);
        }
        for (const path of [
            [...A, "termination"],
            [...P, "termination"]
        ])
            for (const code of ["max_turns", "message_limit"]) change([...path, "code"], code);
    }
    it("accepts independently checked complete evidence", () => {
        assertFixtureContract(fixture);
        expect(validateScenarioResult(fixture, c.scenario)).toBe(fixture);
    });
    it.each(mutations)("rejects $name", (mutation) => {
        const before = JSON.stringify(fixture);
        const malformed = mutateFixture(
            fixture,
            mutation.path,
            mutation.operation,
            mutation.replacement
        );
        expect(() => validateScenarioResult(malformed, c.scenario)).toThrow(
            new Error("Convergence runtime result is invalid.")
        );
        expect(JSON.stringify(fixture)).toBe(before);
    });
    it.each([
        { kind: "protocol", code: "IMMUTABLE_MEETING" },
        { kind: "protocol", code: "ARCHIVED_MEETING" },
        { kind: "protocol", code: "UNAUTHORIZED_CALLER" },
        { kind: "tool", code: "CAPABILITY_REVOKED" },
        { kind: "tool", code: "AGENT_NOT_LIVE" }
    ])("accepts known late failure $kind/$code", (late) => {
        const f = mutateFixture(fixture, [...O, "lateSubmit"], "replace", late);
        expect(validateScenarioResult(f, c.scenario)).toBe(f);
    });
    it("allows archive DTO extras without equating private termination fields", () => {
        const f = mutateFixture(
            fixture,
            [...P, "termination", "endedAt"],
            "replace",
            1700000000100
        );
        expect(validateScenarioResult(f, c.scenario)).toBe(f);
    });
});

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
});
