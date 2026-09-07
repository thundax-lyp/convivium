import { isDeepStrictEqual } from "node:util";

export function validateScenarioResult(value, expectedScenario, validateMeetingStatus) {
    if (["convergence-stalled", "convergence-turn-budget-completion"].includes(expectedScenario)) {
        validateConvergenceRuntimeResult(value, expectedScenario, validateMeetingStatus);
        return value;
    }
    if (value === null || typeof value !== "object" || value.ok !== true) {
        throw new Error("Smoke result is not successful.");
    }
    if (value.scenario !== expectedScenario || !Array.isArray(value.assertions)) {
        throw new Error("Smoke result scenario contract mismatch.");
    }
    if (expectedScenario === "scribe-minutes") {
        validateScribeMinutesResult(value, validateMeetingStatus);
        return value;
    }
    if (
        expectedScenario === "baseline" &&
        !value.assertions.includes("attendance-reject-tool-zero-effects")
    ) {
        throw new Error("Baseline attendance rejection assertion is missing.");
    }
    if (expectedScenario === "reassign" && value.browserReady === true) {
        const validKeys = [
            "ok",
            "scenario",
            "browserReady",
            "assertions",
            "meetingId",
            "captainSessionId",
            "observed"
        ];
        const observedKeys = [
            "oldAttemptId",
            "currentSpeakerId",
            "currentAttemptId",
            "meetingVersion"
        ];
        const observed = value.observed;
        if (
            Object.keys(value).length !== validKeys.length ||
            validKeys.some((key) => !Object.hasOwn(value, key)) ||
            value.assertions.length !== 1 ||
            value.assertions[0] !== "browser-reassign-ready" ||
            typeof value.meetingId !== "string" ||
            value.meetingId.length === 0 ||
            value.captainSessionId !== "convivium-smoke-captain" ||
            observed === null ||
            typeof observed !== "object" ||
            Object.keys(observed).length !== observedKeys.length ||
            observedKeys.some((key) => !Object.hasOwn(observed, key)) ||
            typeof observed.oldAttemptId !== "string" ||
            observed.oldAttemptId.length === 0 ||
            observed.currentSpeakerId !== "participant-a" ||
            typeof observed.currentAttemptId !== "string" ||
            observed.currentAttemptId.length === 0 ||
            observed.currentAttemptId !== observed.oldAttemptId ||
            !Number.isInteger(observed.meetingVersion) ||
            observed.meetingVersion < 0
        ) {
            throw new Error("Reassign browser-ready result is invalid.");
        }
        return value;
    }
    if (expectedScenario === "decision-risk-closure" && value.browserReady === true) {
        const keys = [
            "ok",
            "scenario",
            "browserReady",
            "assertions",
            "meetingId",
            "captainSessionId",
            "observed"
        ];
        const observedKeys = [
            "meetingVersion",
            "status",
            "candidateId",
            "replacementCandidateId",
            "riskId",
            "evidenceMessageId"
        ];
        const observed = value.observed;
        if (
            Object.keys(value).length !== keys.length ||
            keys.some((key) => !Object.hasOwn(value, key)) ||
            value.assertions.length !== 1 ||
            value.assertions[0] !== "browser-local-decision-risk-ready" ||
            typeof value.meetingId !== "string" ||
            value.meetingId.trim().length === 0 ||
            value.captainSessionId !== "convivium-smoke-captain" ||
            observed === null ||
            typeof observed !== "object" ||
            Object.keys(observed).length !== observedKeys.length ||
            observedKeys.some((key) => !Object.hasOwn(observed, key)) ||
            !Number.isInteger(observed.meetingVersion) ||
            observed.meetingVersion < 0 ||
            observed.status !== "paused" ||
            ["candidateId", "replacementCandidateId", "riskId", "evidenceMessageId"].some(
                (key) => typeof observed[key] !== "string" || observed[key].trim().length === 0
            ) ||
            observed.candidateId === observed.replacementCandidateId
        ) {
            throw new Error("Local decision risk browser-ready result is invalid.");
        }
        return value;
    }
    if (expectedScenario === "decision-risk-closure") {
        const requiredAssertions = [
            "candidate-visible-to-captain",
            "candidate-accepted",
            "accepted-candidate-not-pending",
            "decision-history-current-state",
            "decision-pending-by-current-revision",
            "risk-disposition-status",
            "risk-blocking-facts",
            "risk-replay-version-stable",
            "event-order-not-observable-by-command-status"
        ];
        if (requiredAssertions.some((label) => !value.assertions.includes(label))) {
            throw new Error("Decision risk smoke assertions are incomplete.");
        }
    }
    if (expectedScenario === "convergence") {
        const requiredAssertions = [
            "deterministic-fallback",
            "fallback-replay-idempotent",
            "fallback-status-projected"
        ];
        if (
            value.assertions.length !== requiredAssertions.length ||
            requiredAssertions.some((label) => !value.assertions.includes(label))
        ) {
            throw new Error("Convergence smoke assertions are incomplete.");
        }
    }
    return value;
}

function validateConvergenceRuntimeResult(value, scenario, validateMeetingStatus) {
    const requireValid = (condition) => {
        if (!condition) throw new Error("Convergence runtime result is invalid.");
    };
    try {
        requireValid(
            value?.ok === true && value.scenario === scenario && Array.isArray(value.assertions)
        );
        const o = value.observed,
            a = o.archived;
        // Validate the real DTO using the product contract. Driver assertions own
        // intermediate state transitions; this boundary checks the persisted result.
        validateMeetingStatus(structuredClone(a));
        const budget = scenario === "convergence-turn-budget-completion";
        const count = budget ? 2 : 4;
        const code = budget ? "objective_satisfied" : "stalled";
        const p = a.archive.package;
        requireValid(
            a.status === "archived" &&
                a.meetingId === value.meetingId &&
                p.meetingId === value.meetingId &&
                a.meetingVersion === o.archivedVersion &&
                a.termination.code === code &&
                p.termination.code === code &&
                a.termination.reason === p.termination.reason
        );
        requireValid(
            [
                "currentTurn",
                "currentSpeakerId",
                "currentAttemptId",
                "stallCount",
                "replanCount",
                "maxStalls",
                "maxReplans"
            ].every((key) => !Object.hasOwn(a, key))
        );
        requireValid(a.meetingTasks.length === 0 && a.pendingHandRaises.length === 0);
        requireValid(
            o.submissions.length === count &&
                p.formalTranscript.length === count &&
                o.submissions.at(-1).meetingStatus === (budget ? "converging" : "partial") &&
                o.archivedVersion > o.submissions.at(-1).meetingVersion
        );
        for (const [i, message] of p.formalTranscript.entries()) {
            const submitted = o.submissions[i];
            requireValid(
                message.id === submitted.messageId &&
                    message.seq === i + 1 &&
                    message.turnId === submitted.turnId &&
                    message.speaker === "participant-a" &&
                    message.content === scenario + ":a:" + (i + 1)
            );
        }
        if (budget) {
            requireValid(
                o.endResult.status === "completed" &&
                    o.endResult.terminationCode === code &&
                    a.limits.maxTurns === 2 &&
                    a.limits.maxTotalMessages === 100 &&
                    p.objectiveContract.acceptanceCriteria[0].satisfied &&
                    p.agenda[0].status === "resolved"
            );
            for (const [kind, subjectId] of [
                ["criterion_evidence", p.objectiveContract.acceptanceCriteria[0].id],
                ["agenda_resolution", p.agenda[0].id]
            ]) {
                requireValid(
                    p.completionFacts.some(
                        (fact) =>
                            fact.kind === kind &&
                            fact.subjectId === subjectId &&
                            fact.status === "active" &&
                            fact.evidenceMessageIds.length === 1 &&
                            fact.evidenceMessageIds[0] === o.submissions[0].messageId
                    )
                );
            }
        }
        requireValid(
            (o.lateSubmit.kind === "protocol" &&
                ["IMMUTABLE_MEETING", "ARCHIVED_MEETING", "UNAUTHORIZED_CALLER"].includes(
                    o.lateSubmit.code
                )) ||
                (o.lateSubmit.kind === "tool" &&
                    ["CAPABILITY_REVOKED", "AGENT_NOT_LIVE"].includes(o.lateSubmit.code))
        );
        const ids = [
            value.meetingId + "-manager-manager",
            value.meetingId + "-participant-participant-a"
        ];
        requireValid(
            o.stableAfterLateSubmit === true &&
                o.residentSessionIds.length === 0 &&
                o.children.length === 2 &&
                ids.every((id) =>
                    o.children.some(
                        (child) =>
                            child.id === id &&
                            child.mode === "continuable" &&
                            child.activity === "inactive"
                    )
                )
        );
    } catch {
        throw new Error("Convergence runtime result is invalid.");
    }
}

function validateScribeMinutesResult(value, validateMeetingStatus) {
    const requireValid = (condition) => {
        if (!condition) throw new Error("Scribe minutes result is invalid.");
    };
    const exactKeys = (object, keys) =>
        object &&
        typeof object === "object" &&
        !Array.isArray(object) &&
        Object.keys(object).length === keys.length &&
        keys.every((key) => Object.hasOwn(object, key));
    try {
        const browser = value.browserReady;
        requireValid(
            typeof browser === "boolean" &&
                typeof value.meetingId === "string" &&
                value.meetingId.trim().length > 0
        );
        requireValid(
            exactKeys(value, [
                "ok",
                "scenario",
                "browserReady",
                "meetingId",
                "observed",
                "assertions",
                ...(browser ? ["captainSessionId"] : [])
            ])
        );
        if (browser) requireValid(value.captainSessionId === "convivium-smoke-captain");
        requireValid(
            isDeepStrictEqual(value.assertions, [
                "minutes-context-visible",
                "minutes-invalid-atomic",
                "minutes-replay-stable",
                "minutes-http-equal",
                ...(browser ? [] : ["minutes-archive-equal", "minutes-sessions-drained"])
            ])
        );
        const o = value.observed;
        requireValid(
            exactKeys(o, [
                "source",
                "draft",
                "afterSubmit",
                "afterReplay",
                "status",
                ...(browser ? [] : ["archived", "drainedSessionIds"])
            ])
        );
        const envelope = (v) =>
            requireValid(
                v?.protocolVersion === 1 &&
                    v.ok === true &&
                    v.meetingId === value.meetingId &&
                    Number.isSafeInteger(v.meetingVersion) &&
                    v.meetingVersion >= 0
            );
        for (const receipt of [o.afterSubmit, o.afterReplay]) {
            envelope(receipt);
            requireValid(
                receipt.result.messageId === o.draft.id &&
                    receipt.result.messageSeq === o.draft.seq &&
                    receipt.result.turnStatus === "completed" &&
                    receipt.result.meetingStatus === "running"
            );
        }
        requireValid(isDeepStrictEqual(o.afterSubmit, o.afterReplay));
        envelope(o.status);
        validateMeetingStatus(structuredClone(o.status.result));
        requireValid(
            o.status.result.meetingId === value.meetingId &&
                o.status.result.meetingVersion === o.status.meetingVersion &&
                o.status.meetingVersion >= o.afterSubmit.meetingVersion
        );
        const find = (messages, id) => {
            const matches = messages.filter((m) => m.id === id);
            requireValid(matches.length === 1);
            return matches[0];
        };
        for (const message of [o.source, o.draft])
            requireValid(isDeepStrictEqual(find(o.status.result.messages, message.id), message));
        const metadata = o.draft.minutesDraft;
        requireValid(
            o.source.id !== o.draft.id &&
                metadata.status === "draft" &&
                metadata.coverage.fromSeq <= o.source.seq &&
                metadata.coverage.throughSeq >= o.source.seq &&
                isDeepStrictEqual(metadata.referencedMessageIds, [o.source.id])
        );
        if (!browser) {
            envelope(o.archived);
            validateMeetingStatus(structuredClone(o.archived.result));
            requireValid(
                o.archived.result.status === "archived" &&
                    o.archived.result.meetingId === value.meetingId &&
                    o.archived.result.meetingVersion === o.archived.meetingVersion &&
                    o.archived.meetingVersion >= o.status.meetingVersion
            );
            const publicKeys = [
                "id",
                "seq",
                "turnId",
                "stepId",
                "speaker",
                "agendaItemId",
                "kind",
                "content",
                "mentions",
                "replyTo",
                "taskIds",
                "createdAt",
                "minutesDraft"
            ];
            for (const message of [o.source, o.draft]) {
                const archived = find(
                    o.archived.result.archive.package.formalTranscript,
                    message.id
                );
                requireValid(
                    publicKeys.every(
                        (key) =>
                            Object.hasOwn(archived, key) === Object.hasOwn(message, key) &&
                            isDeepStrictEqual(archived[key], message[key])
                    )
                );
            }
            requireValid(
                Array.isArray(o.drainedSessionIds) &&
                    o.drainedSessionIds.length === 3 &&
                    new Set(o.drainedSessionIds).size === 3 &&
                    o.drainedSessionIds.every(
                        (id) => typeof id === "string" && id.trim().length > 0
                    )
            );
        }
    } catch {
        throw new Error("Scribe minutes result is invalid.");
    }
}
