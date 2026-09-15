import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect } from "vitest";
import { createMeetingClient, type MeetingClient } from "@/client/meeting-client.js";
import { createControlledMeetingStream } from "../fixtures/remote-stream.js";
import { createRemoteClient } from "../fixtures/remote-client.js";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";

export type Rpc = (
    method: string,
    options: { input: unknown; signal?: AbortSignal }
) => Promise<RemoteResult<unknown>>;
export let rpc: Rpc;
export let api: MeetingClient;
export let streams: ReturnType<typeof createControlledMeetingStream>[];
export let clientFixture: Awaited<ReturnType<typeof createRemoteClient>>;
export function useRemoteFixture() {
    beforeEach(async () => {
        rpc = async () => {
            throw new Error("Unexpected RPC");
        };
        clientFixture = await createRemoteClient(async (_channel, endpoint, payload, signal) => {
            if (!payload || typeof payload !== "object" || !("args" in payload))
                throw new Error("Missing args");
            const args = payload.args;
            if (!args || typeof args !== "object") throw new Error("Invalid args");
            return rpc(endpoint.slice("conviviumMeetings/".length), {
                input: "input" in args ? args.input : undefined,
                signal
            });
        });
        api = createMeetingClient(clientFixture.ctx.remote);
        streams = [];
        api.openUpdates = (unavailable) => {
            const fixture = createControlledMeetingStream(unavailable);
            streams.push(fixture);
            return fixture.stream;
        };
    });
    afterEach(async () => {
        cleanup();
        await Promise.all(streams.map((fixture) => fixture.stream.dispose()));
        await clientFixture.dispose();
    });
}

export function setRpc(mock: Rpc) {
    rpc = mock;
}
export function isWrite(method: string) {
    return method !== "list" && method !== "getStatus";
}

import { ConviviumMeetingPanel } from "@/client/meeting-panel.js";
import { mapMeetingPanelView } from "@/client/meeting-panel-view.js";
import type { MeetingStatusResultV1 } from "@/protocol/index.js";
import { MeetingStatusResultSchema } from "@/protocol/index.js";
import type { PublicDecisionV1 } from "@/protocol/index.js";
import type { PublicArchiveAgendaCandidateV1 } from "@/protocol/index.js";
import type { PublicArchiveIssueV1 } from "@/protocol/index.js";
import { renderObservabilitySections } from "@/client/meeting-panel-sections.js";
export {
    ConviviumMeetingPanel,
    mapMeetingPanelView,
    renderObservabilitySections,
    MeetingStatusResultSchema
};
export type { MeetingStatusResultV1 };

export const meetingId = "meeting/1";
export const listItem = {
    meetingId,
    teamId: "team-1",
    topic: "Runtime smoke",
    status: "running" as const,
    meetingVersion: 2,
    updatedAt: 10
};

export function listResponse(meetings = [listItem]) {
    return { protocolVersion: 1 as const, ok: true as const, result: { meetings } };
}

export function statusResult(
    status: "running" | "paused" | "converging" = "running",
    meetingVersion = 2,
    withCurrentAttempt = false
): MeetingStatusResultV1 {
    return {
        meetingId,
        meetingVersion,
        topic: "Runtime smoke",
        objective: "Verify local control",
        continuationMaterials: [],
        limits: { maxTurns: 3, maxSpeakersPerTurn: 2, maxTotalMessages: 20 },
        messages: [],
        questions: [],
        proposals: [],
        pendingDecisionCandidates: [],
        acceptedDecisions: [],
        decisionHistory: [],
        risks: [],
        blockingFacts: [],
        parkingLot: [],
        meetingTasks: [],
        attendanceRecommendations: [],
        status,
        stallCount: 0,
        maxStalls: 3,
        replanCount: 0,
        maxReplans: 1,
        pendingHandRaises: [],
        ...(withCurrentAttempt
            ? {
                  currentTurn: {
                      id: "turn-1",
                      seq: 1,
                      agendaItemId: "agenda-1",
                      intent: "Review scope",
                      reason: "Review scope",
                      objective: "Verify local control",
                      expectedOutputs: [],
                      prohibitedTopics: [],
                      steps: [
                          {
                              id: "step-1",
                              participantId: "participant-one",
                              instruction: "Speak",
                              reason: "Current speaker",
                              status: "running" as const
                          }
                      ]
                  },
                  currentSpeakerId: "participant-one",
                  currentAttemptId: "attempt-1"
              }
            : {}),
        pauseControl:
            status === "paused"
                ? {
                      action: "resume" as const,
                      pausedAt: 100,
                      pausedBy: { kind: "local_host" as const, actorId: "loopback-web" },
                      reason: "Inspect output"
                  }
                : status === "converging"
                  ? { action: "none" as const }
                  : { action: "pause" as const }
    };
}

export function contributionStatus(phase: "published" | "returned" = "published") {
    return {
        ...statusResult(),
        contributions: {
            reviewerId: "participant-reviewer",
            tasks: [
                {
                    id: "contribution-1",
                    participantId: "participant-one",
                    agendaItemId: "agenda-1",
                    phase,
                    generation: 1,
                    currentDraftRevision: 1,
                    requiredForCompletion: true,
                    requiresEvidenceReview: true,
                    reviewStatus:
                        phase === "published" ? ("complete" as const) : ("pending" as const),
                    deadlineAt: 100
                }
            ]
        }
    } as MeetingStatusResultV1;
}

export function contributionReadResult() {
    return {
        task: contributionStatus().contributions!.tasks[0]!,
        drafts: [
            {
                revision: 1,
                basedOnSeq: 0,
                submittedAt: 1,
                message: {
                    id: "message-1",
                    kind: "statement" as const,
                    content: "Public finding",
                    mentions: [],
                    taskIds: [],
                    agendaRelation: "on_topic" as const,
                    createdAt: 1
                },
                claims: {
                    questions: [],
                    issues: [],
                    proposals: [],
                    positions: [],
                    agendaCandidates: [],
                    decisionCandidates: []
                },
                citations: [
                    {
                        evidenceKey: "evidence-1:1",
                        claim: "Guard exists",
                        locator: "src/index.ts",
                        inference: "Inspection"
                    }
                ]
            }
        ],
        boundaryReviews: [],
        evidenceReviews: [
            {
                draftRevision: 1,
                evidenceKey: "evidence-1:1",
                claim: "Guard exists",
                verdict: "supports" as const,
                method: "Inspection",
                result: "Guard found",
                limitations: "Static only",
                actor: "reviewer",
                reviewedAt: 3
            }
        ],
        evidence: {
            title: "Repository snapshot",
            kind: "code" as const,
            source: "https://example.test/repository",
            sourceDate: "2026-09-14",
            collectedAt: "2026-09-14T00:00:00Z",
            locator: "src/index.ts#main",
            observation: "Guard present",
            methodAndConditions: "Reviewed commit abc123.",
            limitations: "No runtime execution.",
            dependencies: "Checkout abc123.",
            material: { kind: "text" as const, text: "diff content" },
            code: {
                repository: "https://example.test/repository",
                revision: "abc123",
                pathsAndSymbols: "src/index.ts#main",
                patchEvidenceKeys: [],
                validation: "static_only" as const,
                reproduction: "git show abc123",
                expected: "Guard present",
                observed: "Guard present",
                notCovered: "Runtime execution"
            },
            evidenceId: "evidence-1",
            revision: 1,
            key: "evidence-1:1",
            submittedBy: "participant-one",
            submittedAt: 1
        }
    };
}

export function terminalStatusResult() {
    return {
        ...statusResult("running", 5),
        status: "completed" as const,
        pendingHandRaises: [] as const,
        pauseControl: { action: "none" as const },
        termination: {
            code: "completed",
            reason: "Done",
            decisionIds: [],
            unresolvedQuestionIds: [],
            dissentingPositionIds: [],
            blockingAgendaItemIds: [],
            finalMessage: "Complete",
            endedAt: 200
        },
        completionFactIds: []
    };
}

export function factStatus(status: "created" | "running" | "waiting" | "paused" | "converging") {
    const decisions = factDecisions();
    const base = statusResult(status === "created" ? "running" : status, 2, status !== "waiting");
    return {
        ...base,
        status,
        acceptedDecisions: [decisions[2]],
        decisionHistory: decisions,
        parkingLot: factParkingLot(),
        risks: factRisks(),
        ...(status === "waiting"
            ? {
                  currentTurn: undefined,
                  currentSpeakerId: undefined,
                  currentAttemptId: undefined,
                  waitState: {
                      reason: "blocking_task",
                      waitingSince: 100,
                      taskIds: [],
                      participantIds: ["participant-one"]
                  }
              }
            : {})
    } as MeetingStatusResultV1;
}

export function factTerminalStatus(
    status: "completed" | "partial" | "no_consensus" | "cancelled" | "failed"
) {
    const decisions = factDecisions();
    return {
        ...terminalStatusResult(),
        status,
        acceptedDecisions: [decisions[2]],
        decisionHistory: decisions,
        parkingLot: factParkingLot(),
        risks: factRisks(),
        termination: {
            ...terminalStatusResult().termination,
            code: status,
            decisionIds: ["d-current"]
        }
    } as MeetingStatusResultV1;
}

export function factArchiveStatus(status: "archiving" | "archived") {
    const decisions = factDecisions();
    const message = {
        id: "archive-message-1",
        seq: 1,
        turnId: "turn-1",
        stepId: "step-1",
        speaker: "participant-one",
        agendaItemId: "agenda-1",
        kind: "statement" as const,
        content: "Archived statement",
        mentions: [],
        taskIds: [],
        createdAt: 1
    };
    const archive = {
        archivedAt: status === "archived" ? 300 : undefined,
        package: {
            schemaVersion: 1 as const,
            meetingId,
            teamId: "team-1",
            objectiveContract: {
                requiredOutputs: [],
                acceptanceCriteria: [],
                hardConstraints: [],
                requiredReviewers: [],
                riskAcceptanceAuthority: [],
                acceptableRiskLevel: "medium" as const
            },
            finalSummary: "Done",
            artifactRefs: [],
            acceptedDecisions: [decisions[2]],
            decisionHistory: decisions,
            parkingLot: factParkingLot(),
            proposals: [],
            completionFacts: [],
            agenda: [],
            issues: [
                ...factRisks().map(
                    ({
                        sourceMessageId: _sourceMessageId,
                        affectedOutputIds: _affectedOutputIds,
                        affectedCriterionIds: _affectedCriterionIds,
                        violatedConstraintIds: _violatedConstraintIds,
                        blockingObjectionIds: _blockingObjectionIds,
                        blocking: _blocking,
                        safeDefaultAvailable: _safeDefaultAvailable,
                        impact: _impact,
                        urgency: _urgency,
                        reversibility: _reversibility,
                        ...issue
                    }) => issue
                ),
                {
                    id: "issue-waiting",
                    title: "Waiting issue",
                    description: "Awaiting owner",
                    disposition: "follow_up",
                    status: "waiting",
                    relatedTaskIds: []
                }
            ],
            unresolvedQuestions: [],
            formalTranscript: [message],
            participantProvenance: [],
            termination: {
                code: "completed",
                reason: "Done",
                decisionIds: ["d-current"],
                unresolvedQuestionIds: []
            },
            endedAt: 200,
            materializedAt: 250
        }
    };
    return {
        meetingId,
        meetingVersion: 6,
        topic: "Runtime smoke",
        objective: "Verify local control",
        continuationMaterials: [],
        limits: statusResult().limits,
        meetingTasks: [],
        status,
        pendingHandRaises: [],
        pauseControl: { action: "none" as const },
        termination: {
            code: "completed",
            reason: "Done",
            decisionIds: ["d-current"],
            unresolvedQuestionIds: []
        },
        archive
    } as MeetingStatusResultV1;
}

export function refreshFactStatus(
    stage: "active" | "terminal" | "archived"
): MeetingStatusResultV1 {
    if (stage === "active") return factStatus("running");
    const decisions = factDecisions();
    const current = {
        ...decisions[2],
        statement: "Current decision v5",
        rationale: "Current rationale v5"
    };
    if (stage === "terminal")
        return {
            ...factTerminalStatus("partial"),
            decisionHistory: [decisions[0], current],
            acceptedDecisions: [current],
            parkingLot: [
                { ...factParkingLot()[0], title: "Topic pending v5", reason: "Reason pending v5" },
                factParkingLot()[2]
            ],
            risks: [
                {
                    ...factRisks()[0],
                    title: "Risk accepted v5",
                    rationale: "Rationale risk-accepted v5"
                },
                factRisks()[1]
            ]
        } as MeetingStatusResultV1;
    const archived = factArchiveStatus("archived");
    if (archived.status !== "archived") throw new Error("Expected archive fixture");
    const final: PublicDecisionV1 = {
        id: "d-final",
        proposalId: "p-final",
        proposalRevision: 1,
        status: "accepted",
        statement: "Final decision v6",
        rationale: "Final rationale v6",
        agendaItemId: "agenda-1",
        acceptedBy: ["participant-one"],
        dissentingPositionIds: []
    };
    return {
        ...archived,
        termination: { ...archived.termination, decisionIds: ["d-final"] },
        archive: {
            ...archived.archive,
            package: {
                ...archived.archive.package,
                termination: { ...archived.archive.package.termination, decisionIds: ["d-final"] },
                decisionHistory: [
                    {
                        ...current,
                        status: "revoked",
                        statement: "Current decision revoked v6",
                        rationale: "Current rationale v6"
                    },
                    final
                ],
                acceptedDecisions: [final],
                parkingLot: [
                    {
                        id: "candidate-parked",
                        title: "Topic promoted v6",
                        reason: "Reason promoted v6",
                        status: "promoted"
                    },
                    {
                        id: "candidate-final",
                        title: "Final follow-up v6",
                        reason: "Deferred for next meeting",
                        status: "parked"
                    }
                ],
                issues: [
                    {
                        id: "risk-follow-up",
                        title: "Follow-up resolved v6",
                        description: "Follow-up complete",
                        disposition: "follow_up",
                        status: "resolved",
                        rationale: "Resolved after review",
                        ownerId: "participant-one",
                        relatedTaskIds: ["task-follow-up"]
                    },
                    {
                        id: "issue-final",
                        title: "Final issue v6",
                        description: "Remaining follow-up",
                        disposition: "follow_up",
                        status: "open",
                        relatedTaskIds: []
                    }
                ]
            }
        }
    };
}

export function assertRefreshFacts(detail: MeetingStatusResultV1) {
    // Expected facts come directly from the supplied protocol DTO, not the renderer mapper.
    const facts =
        detail.status === "archiving" || detail.status === "archived"
            ? detail.archive.package
            : detail;
    const groups = [
        { label: "Decision history", attr: "data-decision-id", items: facts.decisionHistory },
        { label: "Accepted decisions", attr: "data-decision-id", items: facts.acceptedDecisions },
        { label: "Parking Lot", attr: "data-candidate-id", items: facts.parkingLot },
        {
            label: "Risks",
            attr: "data-risk-id",
            items: "issues" in facts ? facts.issues : facts.risks
        }
    ];
    for (const { label, attr, items } of groups) {
        const rows = [...screen.getByLabelText(label).querySelectorAll(`[${attr}]`)];
        expect(rows.map((row) => row.getAttribute(attr))).toEqual(items.map((item) => item.id));
        items.forEach((item, index) => {
            const values = [...rows[index].querySelectorAll("dd")].map((dd) => dd.textContent);
            for (const [key, value] of Object.entries(item)) {
                if (
                    label === "Accepted decisions" &&
                    ["agendaItemId", "acceptedBy", "supersededByDecisionId"].includes(key)
                )
                    continue;
                if (
                    label === "Risks" &&
                    ![
                        "id",
                        "title",
                        "description",
                        "status",
                        "disposition",
                        "rationale",
                        "ownerId",
                        "relatedTaskIds"
                    ].includes(key)
                )
                    continue;
                if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
                if (Array.isArray(value)) {
                    for (const entry of value) expect(values.join(" ")).toContain(entry);
                } else expect(values).toContain(String(value));
            }
        });
    }
}

export function success<T>(result: T, meetingVersion = 2) {
    return { protocolVersion: 1 as const, ok: true as const, meetingId, meetingVersion, result };
}

export function remoteResult(value: unknown): RemoteResult<unknown> {
    return { ok: true, value: JSON.parse(JSON.stringify(value)) };
}

export function protocolError(message = "Version changed") {
    return {
        protocolVersion: 1 as const,
        ok: false as const,
        code: "VERSION_CONFLICT",
        message,
        meetingId,
        meetingVersion: 3,
        retryable: true
    };
}

export function factDecisions(): PublicDecisionV1[] {
    return [
        {
            id: "d-old",
            proposalId: "p-old",
            proposalRevision: 1,
            status: "superseded",
            agendaItemId: "agenda-1",
            statement: "Old decision",
            rationale: "Old rationale",
            acceptedBy: ["participant-one"],
            dissentingPositionIds: ["position-dissent"],
            supersededByDecisionId: "d-current"
        },
        {
            id: "d-revoked",
            proposalId: "p-revoked",
            proposalRevision: 1,
            status: "revoked",
            agendaItemId: "agenda-1",
            statement: "Revoked decision",
            rationale: "Revoked rationale",
            acceptedBy: ["participant-one"],
            dissentingPositionIds: ["position-dissent"]
        },
        {
            id: "d-current",
            proposalId: "p-current",
            proposalRevision: 1,
            status: "accepted",
            agendaItemId: "agenda-1",
            statement: "Current decision",
            rationale: "Current rationale",
            acceptedBy: ["participant-one"],
            dissentingPositionIds: ["position-dissent"]
        }
    ];
}

export function factParkingLot(): PublicArchiveAgendaCandidateV1[] {
    return (["pending", "promoted", "parked", "rejected"] as const).map((status) => ({
        id: `candidate-${status}`,
        title: `Topic ${status}`,
        reason: `Reason ${status}`,
        status
    }));
}

export function factRisks(): PublicArchiveIssueV1[] {
    return [
        {
            id: "risk-accepted",
            title: "Risk accepted",
            description: "Description risk-accepted",
            disposition: "accepted_risk",
            status: "accepted_risk",
            rationale: "Rationale risk-accepted",
            ownerId: "participant-one",
            relatedTaskIds: ["task-follow-up"],
            sourceMessageId: "message-evidence",
            affectedOutputIds: [],
            affectedCriterionIds: [],
            violatedConstraintIds: [],
            blockingObjectionIds: [],
            blocking: false,
            safeDefaultAvailable: true,
            impact: "bounded",
            urgency: "later",
            reversibility: "reversible"
        },
        {
            id: "risk-follow-up",
            title: "Risk follow-up",
            description: "Description risk-follow-up",
            disposition: "follow_up",
            status: "deferred",
            rationale: "Rationale risk-follow-up",
            ownerId: "participant-one",
            relatedTaskIds: ["task-follow-up"],
            sourceMessageId: "message-evidence",
            affectedOutputIds: [],
            affectedCriterionIds: [],
            violatedConstraintIds: [],
            blockingObjectionIds: [],
            blocking: false,
            safeDefaultAvailable: true,
            impact: "bounded",
            urgency: "later",
            reversibility: "reversible"
        },
        {
            id: "risk-out",
            title: "Risk out",
            description: "Description risk-out",
            disposition: "out_of_scope",
            status: "out_of_scope",
            rationale: "Rationale risk-out",
            ownerId: "participant-one",
            relatedTaskIds: ["task-follow-up"],
            sourceMessageId: "message-evidence",
            affectedOutputIds: [],
            affectedCriterionIds: [],
            violatedConstraintIds: [],
            blockingObjectionIds: [],
            blocking: false,
            safeDefaultAvailable: true,
            impact: "bounded",
            urgency: "later",
            reversibility: "reversible"
        }
    ];
}

export function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

export async function selectMeeting(): Promise<void> {
    const item = await screen.findByRole("button", { name: /Runtime smoke/ });
    fireEvent.click(item);
    await screen.findByLabelText("Meeting summary");
}

export function expectSelectedEndOutcome(name: string): HTMLButtonElement {
    const group = within(screen.getByRole("radiogroup", { name: "End outcome" }));
    const radios = group.getAllByRole("radio") as HTMLButtonElement[];
    expect(radios.map((radio) => radio.textContent)).toEqual([
        "Partial",
        "No consensus",
        "Cancelled"
    ]);
    const selected = group.getByRole("radio", { name, exact: true }) as HTMLButtonElement;
    expect(radios.filter((radio) => radio.getAttribute("aria-checked") === "true")).toEqual([
        selected
    ]);
    for (const radio of radios) {
        expect(radio.tabIndex).toBe(radio === selected ? 0 : -1);
        expect(radio.type).toBe("button");
    }
    return selected;
}
