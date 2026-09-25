import { describe, expect, it, vi } from "vitest";
import { createMeetingCommandApplication } from "@/runtime/application-service/meeting-command.js";

const actions = [
    { kind: "activate_agenda", agendaId: "a", previousDisposition: "completed", reason: "next" },
    { kind: "dispose_agenda_candidate", candidateId: "c", disposition: "parked", reason: "later" },
    {
        kind: "resolve_question",
        questionId: "q",
        status: "deferred",
        rationale: "later",
        evidenceIds: ["v"]
    },
    {
        kind: "dispose_issue",
        issueId: "i",
        status: "resolved",
        rationale: "fixed",
        evidenceIds: ["v"]
    },
    { kind: "abort_round", roundId: "r", reason: "stop" },
    { kind: "decide", candidateId: "c" },
    {
        kind: "change_decision",
        decisionId: "d",
        status: "revoked",
        rationale: "invalid",
        evidenceIds: ["v"]
    },
    {
        kind: "dispose_risk",
        issueId: "i",
        action: "accept",
        scope: "current",
        rationale: "bounded",
        evidenceIds: ["v"]
    },
    {
        kind: "record_completion_fact",
        outputId: "o",
        statement: "done",
        rationale: "verified",
        evidenceIds: ["v"],
        decisionIds: ["d"]
    },
    { kind: "change_completion_fact", factId: "f", status: "revoked", rationale: "invalid" }
];
const user = { channel: "loopback_remote", principalId: "local-controller" } as const;
const envelope = {
    protocolVersion: 1 as const,
    meetingId: "m",
    expectedMeetingVersion: 1,
    requestId: "request-1"
};
const authorizationFixture = (caller, role = "captain", ownerRole = "participant") => {
    const execute = vi.fn(async () => ({
        result: {
            kind: "accepted",
            meetingId: "m",
            committedVersion: 2,
            receiptId: "receipt",
            factIds: ["fact"],
            effects: []
        }
    }));
    const openMeeting = vi.fn(async () => ({ execute }));
    const application = createMeetingCommandApplication({
        registry: { openMeeting },
        creation: { create: vi.fn() },
        ids: { nextId: vi.fn() },
        clock: { now: () => 10 },
        resolveCallerScope: async () => ({
            caller,
            meetingId: "m",
            role,
            ...(caller.channel === "dsh_tool"
                ? {
                      identityId: caller.principalId,
                      ownership: {
                          id: caller.sessionBindingId,
                          identityId: caller.principalId,
                          meetingId: "m",
                          role: ownerRole,
                          lifecycleStatus: "active",
                          capabilityStatus: "active"
                      }
                  }
                : {})
        })
    } as never);
    return { application, openMeeting, execute };
};
describe("Captain trusted user authorization", () => {
    it.each(actions)(
        "allows the user and refuses forged sources for $kind before receipt replay",
        async (action) => {
            const allowed = authorizationFixture(user);
            await expect(
                allowed.application.execute(
                    { ...envelope, action } as never,
                    { caller: user },
                    new AbortController().signal
                )
            ).resolves.toMatchObject({ kind: "accepted" });
            expect(allowed.execute).toHaveBeenCalledOnce();
            for (const caller of [
                { ...user, principalId: "other" },
                { ...user, sessionBindingId: "user-session" },
                {
                    channel: "dsh_tool",
                    principalId: "local-controller",
                    sessionBindingId: "owned-session"
                },
                { channel: "runtime_recovery", principalId: "runtime-recovery" }
            ]) {
                const denied = authorizationFixture(caller);
                await expect(
                    denied.application.execute(
                        { ...envelope, action } as never,
                        { caller } as never,
                        new AbortController().signal
                    )
                ).resolves.toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
                expect(denied.openMeeting).not.toHaveBeenCalled();
            }
        }
    );
    it("does not allow a role claim to promote a Contributor into Manager", async () => {
        const caller = {
            channel: "dsh_tool",
            principalId: "contributor",
            sessionBindingId: "owner"
        };
        const f = authorizationFixture(caller, "manager", "participant");
        await expect(
            f.application.execute(
                { ...envelope, action: { kind: "open_round", agendaId: "a", planId: "p" } },
                { caller } as never,
                new AbortController().signal
            )
        ).resolves.toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(f.openMeeting).not.toHaveBeenCalled();
    });
    it("keeps system archive and identity contributions outside user controls", async () => {
        for (const action of [
            { kind: "start_archive" },
            { kind: "raise_hand", roundId: "r", purpose: "speak" }
        ]) {
            const f = authorizationFixture(user);
            await expect(
                f.application.execute(
                    { ...envelope, action } as never,
                    { caller: user },
                    new AbortController().signal
                )
            ).resolves.toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
            expect(f.openMeeting).not.toHaveBeenCalled();
        }
    });
});

import { DomainMeetingRepository } from "@/repository/domain/domain-meeting-repository.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.js";
import { peerBindings } from "../fixtures/peer-ownership.js";
import { decodeMeetingState, encodeMeetingState } from "@/repository/domain/meeting-state-codec.js";
import { completionReadyState, completionInput } from "../unit/domain/outcome-fixtures.js";
import {
    captainActorIdFor,
    recordCompletionFact,
    endMeeting,
    validateMeetingState
} from "@/domain/index.js";

const businessFixture = async (action, terminal = false) => {
    let state = completionReadyState();
    state.objective.requiredOutputs.push({ id: "pending", text: "remaining", status: "pending" });
    if (action.kind === "decide") state.decisions = [];
    if (action.kind === "change_decision" && action.status === "superseded")
        state.decisionCandidates.push({
            ...state.decisionCandidates[0]!,
            id: "replacement-candidate",
            rationale: "new evidence"
        });
    if (action.kind === "change_completion_fact") {
        const fact = recordCompletionFact(state, completionInput());
        if (fact.kind !== "accepted") throw new Error("completion fixture rejected");
        state = fact.state;
    }
    state.version = 1;
    state.agenda.push({
        id: "next",
        title: "next",
        question: "next",
        requiredOutputIds: ["o"],
        status: "pending"
    });
    state.agendaCandidates = [
        { id: "candidate", title: "next", reason: "next", status: "pending" }
    ];
    state.questions = [
        {
            id: "q",
            actorId: "contributor",
            agendaId: "a",
            text: "question",
            affectedOutputIds: [],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            blocking: false,
            status: "open"
        }
    ];
    state.issues = [
        {
            id: "i",
            actorId: "contributor",
            agendaId: "a",
            description: "risk",
            riskLevel: "medium",
            classification: "blocking",
            affectedOutputIds: ["pending"],
            affectedCriterionIds: [],
            affectedConstraintIds: [],
            requiresEvidenceReview: true,
            blocking: true,
            status: "open",
            rationale: "risk"
        }
    ];
    if (action.kind === "abort_round" && !terminal) {
        state.rounds.push({
            id: "open-round",
            agendaId: "a",
            planId: "open-plan",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "answer" },
            publicBaselinePublicationIds: ["pub"],
            openedAt: 2,
            status: "open",
            contributionIds: []
        });
        state.managerPlans.push({
            id: "open-plan",
            agendaId: "a",
            managerId: "manager",
            kind: "open_round",
            roundGoal: { question: "q", evidenceGap: "gap", expectedOutput: "answer" },
            rationale: "next",
            createdAt: 1,
            status: "completed"
        });
    }
    for (let i = 0; i < 3; i++)
        state.identities.push({ ...state.identities[1]!, id: `extra-${i}` });
    const validation = validateMeetingState(state);
    if (validation.kind !== "valid") throw new Error(JSON.stringify(validation));
    if (terminal) {
        const result = endMeeting(state, {
            terminationId: "termination",
            outcome: "partial",
            reason: "stop",
            actorId: captainActorIdFor(state.id),
            now: 5,
            decisionIds: state.decisions.filter((d) => d.status === "accepted").map((d) => d.id),
            completionFactIds: state.completionFacts
                .filter((f) => f.status === "active")
                .map((f) => f.id),
            unresolvedQuestionIds: ["q"],
            unresolvedIssueIds: ["i"]
        });
        if (result.kind !== "accepted")
            throw new Error(`terminal fixture rejected ${JSON.stringify(result.error)}`);
        state = result.state;
        state.version = 1;
    }
    const catalogDomain = createFakeCatalogDomain();
    const meetingDomain = createFakeMeetingDomain();
    const options = {
        catalogDomain,
        meetingDomain,
        meetingId: "m",
        authorizationValidator: { validateCreate: () => {}, validateCommand: () => {} },
        codec: { encode: encodeMeetingState, decode: decodeMeetingState },
        now: () => 10
    };
    let repository = await DomainMeetingRepository.open(options);
    const create = {
        requestId: "create",
        requestHash: "create",
        authorization: {
            callerBinding: "loopback_remote:local-controller",
            capabilityId: "local-controller"
        },
        initialState: state,
        ...peerBindings("m", state.identities),
        createResult: { meetingId: "m", meetingVersion: 1 },
        createdAt: 1
    };
    await repository.create(create);
    for (const ownership of create.initialOwnership)
        await repository.recordSessionOwnership({ ...ownership, lifecycleStatus: "active" }, 2);
    await repository.completeCreate(create);
    let next = 0;
    const ids = { nextId: vi.fn((kind: string) => `${kind}-${++next}`) };
    const application = createMeetingCommandApplication({
        registry: { openMeeting: async () => repository },
        creation: { create: vi.fn() },
        ids,
        clock: { now: () => 10 },
        resolveCallerScope: async ({ caller }) => ({ caller, meetingId: "m", role: "captain" })
    } as never);
    const mapped = {
        ...action,
        ...(action.kind === "activate_agenda" ? { agendaId: "next" } : {}),
        ...(action.kind === "dispose_agenda_candidate" ? { candidateId: "candidate" } : {}),
        ...(action.kind === "decide" ? { candidateId: "cand" } : {}),
        ...(action.kind === "abort_round" ? { roundId: "open-round" } : {}),
        ...(action.kind === "change_decision" ? { decisionId: "dec" } : {}),
        ...(action.kind === "record_completion_fact" ? { decisionIds: ["dec"] } : {}),
        ...(action.kind === "change_completion_fact" ? { factId: "fact" } : {})
    };
    const command = { ...envelope, action: mapped };
    return {
        command,
        ids,
        meetingDomain,
        getRepository: () => repository,
        run: (input = command) =>
            application.execute(input, { caller: user }, new AbortController().signal),
        reopen: async () => {
            await repository.close();
            repository = await DomainMeetingRepository.open(options);
        },
        close: () => repository.close()
    };
};

describe("Captain business transactions", () => {
    it.each(actions)("commits, replays and recovers $kind atomically", async (action) => {
        const f = await businessFixture(action);
        try {
            await expect(f.run({ ...f.command, expectedMeetingVersion: 0 })).resolves.toMatchObject(
                { kind: "rejected", error: { code: "VERSION_CONFLICT" } }
            );
            f.meetingDomain.failPutsInTable("commits");
            await expect(f.run()).resolves.toMatchObject({
                kind: "rejected",
                error: { code: "STORAGE_UNAVAILABLE" }
            });
            f.meetingDomain.allowPutsInTable("commits");
            await f.reopen();
            expect((await f.getRepository().read()).version).toBe(1);
            expect(await f.getRepository().readCommittedFacts()).toEqual([]);
            const result = await f.run();
            expect(result).toMatchObject({ kind: "accepted", committedVersion: 2 });
            const count = f.ids.nextId.mock.calls.length;
            await expect(f.run()).resolves.toEqual(result);
            expect(f.ids.nextId).toHaveBeenCalledTimes(count);
            await expect(
                f.run({
                    ...f.command,
                    action: {
                        ...f.command.action,
                        ...(action.kind === "decide"
                            ? { candidateId: "other" }
                            : action.kind === "activate_agenda"
                              ? { reason: "other" }
                              : action.kind === "abort_round"
                                ? { reason: "other" }
                                : action.kind === "dispose_agenda_candidate"
                                  ? { reason: "other" }
                                  : { rationale: "other" })
                    }
                })
            ).resolves.toMatchObject({ kind: "rejected", error: { code: "IDEMPOTENCY_CONFLICT" } });
            await f.reopen();
            const facts = await f.getRepository().readCommittedFacts();
            expect(facts).toHaveLength(1);
            expect(facts[0]).toMatchObject({
                kind: action.kind,
                actorId: captainActorIdFor("m"),
                meetingVersion: 2
            });
            expect(facts[0]!.payload.kind).toBe(
                action.kind === "resolve_question"
                    ? "question_disposition"
                    : action.kind === "dispose_issue"
                      ? "issue_disposition"
                      : "references"
            );
            expect((await f.getRepository().recover()).pendingOutbox).toBe(0);
        } finally {
            await f.close();
        }
    });
    it.each(actions)("refuses $kind after termination without a new fact", async (action) => {
        const f = await businessFixture(action, true);
        try {
            await expect(f.run()).resolves.toMatchObject({
                kind: "rejected",
                error: { code: "MEETING_TERMINAL" }
            });
            expect(await f.getRepository().readCommittedFacts()).toEqual([]);
        } finally {
            await f.close();
        }
    });
});

it.each([
    {
        kind: "change_decision",
        decisionId: "dec",
        status: "superseded",
        rationale: "replace",
        evidenceIds: ["v"],
        replacementCandidateId: "replacement-candidate"
    },
    {
        kind: "change_completion_fact",
        factId: "fact",
        status: "superseded",
        rationale: "replace",
        replacement: {
            outputId: "o",
            statement: "reverified",
            rationale: "new evidence",
            evidenceIds: ["v"],
            decisionIds: ["dec"]
        }
    }
])(
    "preserves the old object and separates replacement IDs from committed fact IDs for $kind",
    async (action) => {
        const f = await businessFixture(action);
        try {
            const before = (await f.getRepository().read()).state;
            const result = await f.run();
            expect(result.kind).toBe("accepted");
            await f.reopen();
            const after = (await f.getRepository().read()).state;
            const key = action.kind === "change_decision" ? "decisions" : "completionFacts";
            expect(after[key][0]).toEqual({ ...before[key][0], status: "superseded" });
            expect(after[key]).toHaveLength(2);
            expect(after[key][1].id).toMatch(
                action.kind === "change_decision" ? /^decision-/ : /^completion_fact-/
            );
            const facts = await f.getRepository().readCommittedFacts();
            expect(facts).toHaveLength(1);
            expect(after[key][1].id).not.toBe(facts[0]!.factId);
            const count = f.ids.nextId.mock.calls.length;
            await expect(f.run()).resolves.toEqual(result);
            expect(f.ids.nextId).toHaveBeenCalledTimes(count);
        } finally {
            await f.close();
        }
    }
);
