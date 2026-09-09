import type { RemoteStreamOptions } from "@deepseek-ai/dsh-api-gateway/client";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apply, inject, name } from "@/client/index.js";
import { createMeetingClient, type MeetingClient } from "@/client/meeting-client.js";
import { createControlledMeetingStream } from "../fixtures/remote-stream.js";
import { createRemoteClient } from "../fixtures/remote-client.js";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";

type Rpc = (
    method: string,
    options: { input: unknown; signal?: AbortSignal }
) => Promise<RemoteResult<unknown>>;
let rpc: Rpc;
let api: MeetingClient;
let streams: ReturnType<typeof createControlledMeetingStream>[];
let clientFixture: Awaited<ReturnType<typeof createRemoteClient>>;
function useRemoteFixture() {
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
afterEach(cleanup);

function setRpc(mock: Rpc) {
    rpc = mock;
}
function isWrite(method: string) {
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

const meetingId = "meeting/1";
const listItem = {
    meetingId,
    teamId: "team-1",
    topic: "Runtime smoke",
    status: "running" as const,
    meetingVersion: 2,
    updatedAt: 10
};

function listResponse(meetings = [listItem]) {
    return { protocolVersion: 1 as const, ok: true as const, result: { meetings } };
}

function statusResult(
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

function terminalStatusResult() {
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

function factStatus(status: "created" | "running" | "waiting" | "paused" | "converging") {
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

function factTerminalStatus(
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

function factArchiveStatus(status: "archiving" | "archived") {
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

function refreshFactStatus(stage: "active" | "terminal" | "archived"): MeetingStatusResultV1 {
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

function assertRefreshFacts(detail: MeetingStatusResultV1) {
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

function success<T>(result: T, meetingVersion = 2) {
    return { protocolVersion: 1 as const, ok: true as const, meetingId, meetingVersion, result };
}

function remoteResult(value: unknown): RemoteResult<unknown> {
    return { ok: true, value: JSON.parse(JSON.stringify(value)) };
}

function protocolError(message = "Version changed") {
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

function factDecisions(): PublicDecisionV1[] {
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

function factParkingLot(): PublicArchiveAgendaCandidateV1[] {
    return (["pending", "promoted", "parked", "rejected"] as const).map((status) => ({
        id: `candidate-${status}`,
        title: `Topic ${status}`,
        reason: `Reason ${status}`,
        status
    }));
}

function factRisks(): PublicArchiveIssueV1[] {
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

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

async function selectMeeting(): Promise<void> {
    const item = await screen.findByRole("button", { name: /Runtime smoke/ });
    fireEvent.click(item);
    await screen.findByLabelText("Meeting summary");
}

function expectSelectedEndOutcome(name: string): HTMLButtonElement {
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

describe("meeting fact projection and rendering", () => {
    it("fact visibility: decisions across lifecycle", () => {
        const decisions = factDecisions();
        const detail = {
            ...statusResult("running", 2, true),
            acceptedDecisions: [decisions[2]],
            decisionHistory: decisions
        } as MeetingStatusResultV1;
        expect(() => MeetingStatusResultSchema(JSON.parse(JSON.stringify(detail)))).not.toThrow();
        const view = mapMeetingPanelView(detail);
        expect(view.acceptedDecisions.map((decision) => decision.id)).toEqual(["d-current"]);
        expect(view.decisionHistory.map((decision) => decision.id)).toEqual([
            "d-old",
            "d-revoked",
            "d-current"
        ]);
        render(renderObservabilitySections(detail));
        expect(screen.getByLabelText("Accepted decisions").textContent).toContain("d-current");
        const history = screen.getByLabelText("Decision history");
        expect(history.textContent).toContain("d-old");
        expect(history.textContent).toContain("superseded");
        expect(history.textContent).toContain("d-current");
        expect(history.textContent).toContain("Superseded by");
    });
    it("fact visibility: decision history keeps identity when optional fields are absent", () => {
        const decisions = factDecisions().map(
            ({
                statement: _statement,
                rationale: _rationale,
                acceptedBy: _acceptedBy,
                agendaItemId: _agendaItemId,
                dissentingPositionIds: _dissentingPositionIds,
                supersededByDecisionId: _supersededByDecisionId,
                ...decision
            }) => decision
        );
        const detail = {
            ...factStatus("running"),
            acceptedDecisions: [decisions[2]],
            decisionHistory: decisions
        } as MeetingStatusResultV1;
        expect(() => MeetingStatusResultSchema(JSON.parse(JSON.stringify(detail)))).not.toThrow();
        render(renderObservabilitySections(detail));
        const history = screen.getByLabelText("Decision history");
        expect(history.textContent).toContain("d-old");
        expect(history.textContent).toContain("Proposal ID");
        expect(history.textContent).not.toContain("Old rationale");
    });
    it("fact visibility: empty decision arrays use the explicit empty state", () => {
        const detail = factStatus("running");
        render(
            renderObservabilitySections({ ...detail, acceptedDecisions: [], decisionHistory: [] })
        );
        expect(screen.getByLabelText("Accepted decisions").textContent).toContain(
            "No accepted decisions."
        );
        expect(screen.getByLabelText("Decision history").textContent).toContain(
            "No decision history."
        );
    });
    it("fact visibility: parking lot keeps all dispositions and empty state", () => {
        const detail = factStatus("running");
        render(renderObservabilitySections(detail));
        const section = screen.getByLabelText("Parking Lot");
        expect(
            [...section.querySelectorAll("[data-candidate-id]")].map((item) =>
                item.getAttribute("data-candidate-id")
            )
        ).toEqual([
            "candidate-pending",
            "candidate-promoted",
            "candidate-parked",
            "candidate-rejected"
        ]);
        expect(section.textContent).toContain("Reason rejected");
        cleanup();
        render(renderObservabilitySections({ ...detail, parkingLot: [] }));
        expect(screen.getByLabelText("Parking Lot").textContent).toContain("No parking lot items.");
    });
    it("fact visibility: risks and archived issues preserve status, reason, owner and tasks", () => {
        const detail = factStatus("running");
        render(renderObservabilitySections(detail));
        const section = screen.getByLabelText("Risks");
        expect(section.textContent).toContain("risk-accepted");
        expect(section.textContent).toContain("Rationale risk-follow-up");
        expect(section.textContent).toContain("participant-one");
        expect(section.textContent).toContain("task-follow-up");
        cleanup();
        const archived = factArchiveStatus("archived");
        render(renderObservabilitySections(archived));
        expect(screen.getByLabelText("Risks").textContent).toContain("Waiting issue");
        expect(screen.getByLabelText("Risks").textContent).toContain("waiting");
    });
    it("fact visibility: activity reasons clear when no current turn exists", () => {
        const active = factStatus("running");
        render(renderObservabilitySections(active));
        expect(screen.getByLabelText("Current activity").textContent).toContain("Review scope");
        cleanup();
        const terminal = factTerminalStatus("completed");
        render(renderObservabilitySections(terminal));
        const activity = screen.getByLabelText("Current activity").textContent ?? "";
        expect(activity).toContain("Turn intentNone");
        expect(activity).toContain("Turn reasonNone");
        expect(activity).toContain("Turn objectiveNone");
    });
    it("fact visibility: complete facts replace across active, terminal and archive projections", () => {
        const active = mapMeetingPanelView(factStatus("running"));
        const terminal = mapMeetingPanelView(factTerminalStatus("completed"));
        const archived = mapMeetingPanelView(factArchiveStatus("archived"));
        expect(active.decisionHistory.map((item) => item.id)).toEqual([
            "d-old",
            "d-revoked",
            "d-current"
        ]);
        expect(terminal.decisionHistory.map((item) => item.id)).toEqual([
            "d-old",
            "d-revoked",
            "d-current"
        ]);
        expect(archived.decisionHistory.map((item) => item.id)).toEqual([
            "d-old",
            "d-revoked",
            "d-current"
        ]);
        expect(active.parkingLot.map((item) => item.status)).toEqual([
            "pending",
            "promoted",
            "parked",
            "rejected"
        ]);
        expect(archived.risks.map((item) => item.id)).toContain("issue-waiting");
        expect(terminal.turnReason).toBe("None");
        expect(archived.turnReason).toBe("None");
    });
    it("maps active and terminal projections without mutating transcript order", () => {
        const active = statusResult("running", 2, true);
        const activeView = mapMeetingPanelView(active);
        expect(activeView.plannedSpeakerOrder).toBe("participant-one");
        expect(activeView.currentSpeaker).toBe("participant-one");
        expect(activeView.termination).toBeUndefined();

        const terminal = terminalStatusResult();
        const terminalView = mapMeetingPanelView(terminal);
        expect(terminalView.termination?.code).toBe("completed");
        expect(terminalView.currentSpeaker).toBe("None");

        const message = {
            id: "m1",
            seq: 1,
            turnId: "turn-1",
            stepId: "step-1",
            speaker: "participant-one",
            agendaItemId: "agenda-1",
            kind: "statement" as const,
            content: "hello",
            mentions: [],
            taskIds: [],
            createdAt: 1
        };
        const messages = [{ ...message, id: "m2", seq: 2 }, message];
        const ordered = mapMeetingPanelView({ ...active, messages });
        expect(ordered.messages.map((message) => message.seq)).toEqual([1, 2]);
        expect(messages.map((message) => message.seq)).toEqual([2, 1]);
        expect(ordered.blockingFacts).toEqual([]);
        expect(ordered.acceptedDecisions).toEqual([]);
    });
    it("maps waiting state without a current turn and archive package facts", () => {
        const waiting = {
            ...statusResult("running"),
            status: "waiting" as const,
            waitState: {
                reason: "Waiting for evidence",
                taskIds: [],
                participantIds: ["participant-one"]
            }
        };
        expect(mapMeetingPanelView(waiting)).toMatchObject({
            waitingReason: "Waiting for evidence",
            waitingParticipants: "participant-one"
        });

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
        const decision = { id: "decision-1", statement: "Ship it", status: "accepted" as const };
        const archived = {
            meetingId,
            meetingVersion: 6,
            topic: "Runtime smoke",
            objective: "Verify local control",
            continuationMaterials: [],
            limits: statusResult().limits,
            meetingTasks: [],
            status: "archived" as const,
            pendingHandRaises: [] as const,
            pauseControl: { action: "none" as const },
            termination: {
                code: "completed",
                reason: "Done",
                decisionIds: [decision.id],
                unresolvedQuestionIds: []
            },
            archive: {
                archivedAt: 300,
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
                    acceptedDecisions: [decision],
                    decisionHistory: [decision],
                    proposals: [],
                    completionFacts: [],
                    agenda: [],
                    issues: [],
                    unresolvedQuestions: [],
                    parkingLot: [],
                    formalTranscript: [message],
                    participantProvenance: [],
                    termination: {
                        code: "completed",
                        reason: "Done",
                        decisionIds: [decision.id],
                        unresolvedQuestionIds: []
                    },
                    endedAt: 200,
                    materializedAt: 250
                }
            }
        } satisfies MeetingStatusResultV1;
        expect(mapMeetingPanelView(archived)).toMatchObject({
            messages: [message],
            acceptedDecisions: [decision]
        });
    });
    it("fact visibility: new fact sections remain read only and escape text", () => {
        const detail = {
            ...factStatus("running"),
            decisionHistory: [
                { ...factDecisions()[0], statement: '<img src=x onerror="alert(1)">' }
            ]
        } as MeetingStatusResultV1;
        render(renderObservabilitySections(detail));
        expect(screen.getByLabelText("Decision history").querySelector("img")).toBeNull();
        expect(screen.getByLabelText("Decision history").textContent).toContain("<img src=x");
        for (const label of ["Decision history", "Parking Lot", "Risks"]) {
            expect(screen.getByLabelText(label).querySelector("button,input,select")).toBeNull();
        }
    });
});

describe("meeting panel and client plugin lifecycle", () => {
    useRemoteFixture();
    beforeEach(() => {
        vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-1") });
    });

    it.each([
        "created",
        "running",
        "waiting",
        "paused",
        "converging",
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed",
        "archiving",
        "archived"
    ] as const)("fact visibility: decision history schema and mapper for %s", async (status) => {
        const detail = ["created", "running", "waiting", "paused", "converging"].includes(status)
            ? factStatus(status as "created" | "running" | "waiting" | "paused" | "converging")
            : ["completed", "partial", "no_consensus", "cancelled", "failed"].includes(status)
              ? factTerminalStatus(
                    status as "completed" | "partial" | "no_consensus" | "cancelled" | "failed"
                )
              : factArchiveStatus(status as "archiving" | "archived");
        expect(() => MeetingStatusResultSchema(JSON.parse(JSON.stringify(detail)))).not.toThrow();
        expect(mapMeetingPanelView(detail).decisionHistory.map((decision) => decision.id)).toEqual([
            "d-old",
            "d-revoked",
            "d-current"
        ]);
        setRpc(
            vi.fn(async (input: string) =>
                String(input) === "list"
                    ? remoteResult(listResponse())
                    : remoteResult(success(detail, detail.meetingVersion))
            )
        );
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        await waitFor(() => {
            const accepted = screen.getByLabelText("Accepted decisions").textContent ?? "";
            const historySection = screen.getByLabelText("Decision history");
            const history = historySection.textContent ?? "";
            const historyIds = [...historySection.querySelectorAll("[data-decision-id]")].map(
                (item) => item.getAttribute("data-decision-id")
            );
            expect(accepted).toContain("d-current");
            expect(historyIds).toEqual(["d-old", "d-revoked", "d-current"]);
            for (const value of [
                "superseded",
                "revoked",
                "accepted",
                "p-old",
                "p-revoked",
                "p-current",
                "Old decision",
                "Revoked decision",
                "Current decision",
                "Old rationale",
                "Revoked rationale",
                "Current rationale",
                "participant-one",
                "agenda-1",
                "position-dissent"
            ])
                expect(history).toContain(value);
            const parking = screen.getByLabelText("Parking Lot");
            expect(
                [...parking.querySelectorAll("[data-candidate-id]")].map((item) =>
                    item.getAttribute("data-candidate-id")
                )
            ).toEqual([
                "candidate-pending",
                "candidate-promoted",
                "candidate-parked",
                "candidate-rejected"
            ]);
        });
    });

    it("renders transcript in seq order and blocking facts with empty-state sections", async () => {
        const message = {
            id: "m1",
            seq: 1,
            turnId: "turn-1",
            stepId: "step-1",
            speaker: "participant-one",
            agendaItemId: "agenda-1",
            kind: "statement" as const,
            content: "hello",
            mentions: [],
            taskIds: [],
            createdAt: 1
        };
        const detail = {
            ...statusResult(),
            messages: [{ ...message, id: "m2", seq: 2 }, message],
            blockingFacts: [{ id: "b1", kind: "risk" as const, subjectId: "s1", summary: "risk" }]
        };
        setRpc(
            vi
                .fn<Rpc>()
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(remoteResult(success(detail)))
        );
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        const transcript = screen.getByLabelText("Transcript");
        expect(
            [...transcript.querySelectorAll("li")].map((item) =>
                item.getAttribute("data-message-seq")
            )
        ).toEqual(["1", "2"]);
        expect(screen.getByLabelText("Blocking items").textContent).toContain("risk");
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("mounts the namespace before registering the meeting panel", async () => {
        const register = vi.fn(() => () => {});
        const slotInject = vi.fn((_key, callback: () => unknown) => callback());
        const ctx = clientFixture.ctx;
        await clientFixture.unmount();
        ctx.provide("slots", { inject: slotInject, register });
        expect(name).toBe("convivium-client");
        expect(inject).toEqual(["remote"]);
        await ctx.plugin({ name, inject, apply });
        await waitFor(() => expect(register).toHaveBeenCalledOnce());
        expect(slotInject).toHaveBeenCalledWith("conversation.view", expect.any(Function));
        expect(register).toHaveBeenCalledWith(
            { name: "conversation.view", id: "convivium-meetings", label: "Meetings", order: 100 },
            expect.any(Function)
        );
    });

    it("loads only the list initially, then renders a validated full paused projection", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("paused", 3), 3)));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));

        const item = await screen.findByRole("button", { name: /Runtime smoke/ });
        expect(rpcMock).toHaveBeenCalledTimes(1);
        expect(item.getAttribute("data-meeting-id")).toBe(meetingId);
        expect(screen.getByTestId("convivium-meeting-panel").getAttribute("aria-label")).toBe(
            "Convivium meetings"
        );
        expect(screen.getByLabelText("Meetings")).toBeTruthy();

        fireEvent.click(item);
        await screen.findByLabelText("Meeting summary");
        expect(rpcMock.mock.calls[2]?.[0]).toBe("getStatus");
        expect(screen.getByLabelText("Resume meeting")).toBeTruthy();
        expect(screen.queryByLabelText("Pause meeting")).toBeNull();
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("paused");
        expect(screen.getByLabelText("Pause details").textContent).toContain("Inspect output");
        expect(screen.getByLabelText("Pause details").textContent).toContain("loopback-web");
        expect(screen.getByLabelText("Meeting limits").textContent).toContain("Maximum turns3");
    });

    it("refreshes both the selected detail and list summary when the window regains focus", async () => {
        const pausedListItem = { ...listItem, status: "paused" as const, meetingVersion: 3 };
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockResolvedValueOnce(remoteResult(listResponse([pausedListItem])))
            .mockResolvedValueOnce(remoteResult(success(statusResult("paused", 3), 3)));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        window.dispatchEvent(new Event("focus"));

        await screen.findByText("paused");
        expect(screen.getByRole("button", { name: /Runtime smoke \(paused\)/ })).toBeTruthy();
        expect(rpcMock).toHaveBeenCalledTimes(5);
    });

    it.each(["focus", "notice"] as const)(
        "fact visibility: %s replaces complete facts and reopen retains archive",
        async (trigger) => {
            const active = refreshFactStatus("active");
            const terminal = refreshFactStatus("terminal");
            const archived = refreshFactStatus("archived");
            const originals = [active, terminal, archived].map((value) => JSON.stringify(value));
            for (const value of [active, terminal, archived]) {
                expect(() =>
                    MeetingStatusResultSchema(JSON.parse(JSON.stringify(value)))
                ).not.toThrow();
            }
            let selected = active;
            setRpc(
                vi.fn(async (input: string) =>
                    String(input) === "list"
                        ? remoteResult(listResponse())
                        : remoteResult(success(selected, selected.meetingVersion))
                )
            );
            const rendered = render(createElement(ConviviumMeetingPanel, { api }));
            await selectMeeting();
            assertRefreshFacts(active);
            fireEvent.change(screen.getByLabelText("Pause reason"), {
                target: { value: "Inspect facts" }
            });
            expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false);
            for (const next of [terminal, archived]) {
                selected = next;
                if (trigger === "notice") await act(async () => streams.at(-1)!.push());
                else fireEvent(window, new Event("focus"));
                await waitFor(() => assertRefreshFacts(next));
                const dds = [
                    ...screen.getByLabelText("Decision history").querySelectorAll("dd")
                ].map((dd) => dd.textContent);
                expect(dds).not.toContain(factDecisions()[2].statement);
                if (next === archived) expect(dds).not.toContain("Current decision v5");
                expect(screen.getByLabelText("Current activity").textContent).toContain(
                    "Turn reasonNone"
                );
            }
            rendered.unmount();
            render(createElement(ConviviumMeetingPanel, { api }));
            await selectMeeting();
            assertRefreshFacts(archived);
            expect([active, terminal, archived].map((value) => JSON.stringify(value))).toEqual(
                originals
            );
        }
    );

    it.each(["decisionHistory", "parkingLot", "archiveIssues"] as const)(
        "fact visibility: malformed %s keeps cached facts until valid recovery",
        async (kind) => {
            const active = refreshFactStatus("active");
            const initial = active;
            const malformedSource =
                kind === "archiveIssues" ? factArchiveStatus("archived") : active;
            const malformed = JSON.parse(JSON.stringify(malformedSource)) as Record<
                string,
                unknown
            >;
            if (kind === "decisionHistory") delete malformed.decisionHistory;
            if (kind === "parkingLot") delete malformed.parkingLot;
            if (kind === "archiveIssues") {
                delete (
                    (malformed.archive as Record<string, unknown>).package as Record<
                        string,
                        unknown
                    >
                ).issues;
            }
            expect(() => MeetingStatusResultSchema(malformedSource)).not.toThrow();
            expect(() => MeetingStatusResultSchema(malformed)).toThrow();
            const rpcMock = vi
                .fn<Rpc>()
                .mockResolvedValueOnce(remoteResult(listResponse([listItem])))
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(remoteResult(success(initial, 2)))
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(
                    remoteResult(success(malformed, malformedSource.meetingVersion))
                );
            setRpc(rpcMock);
            render(createElement(ConviviumMeetingPanel, { api }));
            await selectMeeting();
            fireEvent.change(screen.getByLabelText("Pause reason"), {
                target: { value: "Inspect facts" }
            });
            expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false);
            window.dispatchEvent(new Event("focus"));
            await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
            assertRefreshFacts(active);
            expect(screen.getByLabelText("Parking Lot").textContent).toContain("candidate-pending");
            expect(screen.getByLabelText("Risks").textContent).toContain("risk-accepted");
            expect(
                screen.getByRole("button", { name: "Pause meeting" }).hasAttribute("disabled")
            ).toBe(true);
            rpcMock.mockResolvedValueOnce(remoteResult(listResponse()));
            rpcMock.mockResolvedValueOnce(remoteResult(success(refreshFactStatus("archived"), 6)));
            window.dispatchEvent(new Event("focus"));
            await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
            await waitFor(() => assertRefreshFacts(refreshFactStatus("archived")));
            expect(screen.getByLabelText("Decision history").textContent).toContain("d-current");
        }
    );

    it("keeps selected meeting controls disabled until the list and detail both refresh", async () => {
        const listRead = deferred<RemoteResult<unknown>>();
        let holdList = false;
        const mock = vi.fn<Rpc>(async (method) =>
            method === "list"
                ? holdList
                    ? listRead.promise
                    : remoteResult(listResponse())
                : remoteResult(success(statusResult("paused")))
        );
        setRpc(mock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await screen.findByRole("button", { name: /Runtime smoke/ });
        holdList = true;
        await selectMeeting();
        const resume = screen.getByLabelText("Resume meeting");
        expect(resume.hasAttribute("disabled")).toBe(true);
        fireEvent.click(resume);
        expect(mock.mock.calls.some(([method]) => isWrite(method))).toBe(false);
        await act(async () => listRead.resolve(remoteResult(listResponse())));
        await waitFor(() => expect(resume.hasAttribute("disabled")).toBe(false));
    });

    it("disables cached controls on carrier loss until both reconnect reads succeed", async () => {
        const remote = clientFixture.ctx.remote;
        const carrierFailure = vi.fn();
        api.openUpdates = (unavailable) => {
            const fixture = createControlledMeetingStream(
                unavailable,
                true,
                (connection, options, RemoteStream) => {
                    return createMeetingClient({
                        ...remote,
                        conviviumMeetings: {
                            ...remote.conviviumMeetings,
                            watchUpdates: (signal) => options.open(signal!)
                        },
                        $stream: <T>(configuration: RemoteStreamOptions<T>) =>
                            new RemoteStream(connection, configuration)
                    }).openUpdates(() => {
                        carrierFailure();
                        unavailable();
                    });
                }
            );
            streams.push(fixture);
            return fixture.stream;
        };
        let hold = false;
        const detailRead = deferred<RemoteResult<unknown>>();
        setRpc(async (method) =>
            method === "list"
                ? remoteResult(listResponse())
                : hold
                  ? detailRead.promise
                  : remoteResult(success(statusResult()))
        );
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Review" } });
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false);
        await act(async () => streams[0]!.disconnect());
        expect(carrierFailure).toHaveBeenCalledOnce();
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("Meeting version2");
        hold = true;
        await act(async () => streams[0]!.reconnect());
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        await act(async () =>
            detailRead.resolve(remoteResult(success(statusResult("running", 4), 4)))
        );
        await waitFor(() =>
            expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false)
        );
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("Meeting version4");
    });

    it("coalesces focus while disposing and creates only one replacement stream", async () => {
        setRpc(async (method) =>
            remoteResult(method === "list" ? listResponse() : success(statusResult()))
        );
        const open = vi.spyOn(api, "openUpdates");
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        const stream = streams[0]!.stream;
        const dispose = stream.dispose.bind(stream);
        const released = deferred<void>();
        const spy = vi.spyOn(stream, "dispose").mockImplementation(async () => {
            await released.promise;
            await dispose();
        });
        for (let i = 0; i < 3; i++) fireEvent.focus(window);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledTimes(1);
        await act(async () => released.resolve());
        await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it("does not perform periodic reads and closes its stream on unmount", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const mock = vi.fn<Rpc>(async (method) =>
            remoteResult(method === "list" ? listResponse() : success(statusResult()))
        );
        setRpc(mock);
        const panel = render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        const count = mock.mock.calls.length;
        await act(async () => vi.advanceTimersByTime(15_000));
        expect(mock).toHaveBeenCalledTimes(count);
        panel.unmount();
        expect(streams[0]!.stream.signal.aborted).toBe(true);
        await act(async () => streams[0]!.push());
        expect(mock).toHaveBeenCalledTimes(count);
    });

    it("invalidates pre-frame reads and waits for both fresh projections", async () => {
        api.openUpdates = (unavailable) => {
            const fixture = createControlledMeetingStream(unavailable, false);
            streams.push(fixture);
            return fixture.stream;
        };
        const oldDetail = deferred<RemoteResult<unknown>>();
        const newList = deferred<RemoteResult<unknown>>();
        const newDetail = deferred<RemoteResult<unknown>>();
        let firstFrame = false;
        const mock = vi.fn<Rpc>(async (method) => {
            if (method === "list")
                return firstFrame ? newList.promise : remoteResult(listResponse());
            return firstFrame ? newDetail.promise : oldDetail.promise;
        });
        setRpc(mock);
        render(createElement(ConviviumMeetingPanel, { api }));
        fireEvent.click(screen.getByLabelText("Reload meetings"));
        fireEvent.click(await screen.findByRole("button", { name: /Runtime smoke/ }));
        await waitFor(() =>
            expect(mock.mock.calls.some(([method]) => method === "getStatus")).toBe(true)
        );
        firstFrame = true;
        await act(async () => streams[0]!.push());
        await act(async () =>
            oldDetail.resolve(remoteResult(success(statusResult("running", 3), 3)))
        );
        expect(screen.queryByLabelText("Meeting summary")).toBeNull();
        await act(async () => newList.resolve(remoteResult(listResponse())));
        expect(screen.queryByLabelText("Meeting summary")).toBeNull();
        await act(async () =>
            newDetail.resolve(remoteResult(success(statusResult("running", 4), 4)))
        );
        fireEvent.change(await screen.findByLabelText("Pause reason"), {
            target: { value: "Review" }
        });
        await waitFor(() =>
            expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false)
        );
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("Meeting version4");
    });

    it("coalesces refresh requests during an active read into one following cycle", async () => {
        const pending = deferred<RemoteResult<unknown>>();
        const mock = vi.fn<Rpc>(async (method) =>
            remoteResult(method === "list" ? listResponse() : success(statusResult()))
        );
        setRpc(mock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        mock.mockClear();
        mock.mockImplementationOnce(() => pending.promise);
        fireEvent.click(screen.getByLabelText("Reload meetings"));
        for (let i = 0; i < 3; i++) fireEvent.click(screen.getByLabelText("Reload meetings"));
        expect(mock).toHaveBeenCalledTimes(2);
        await act(async () => pending.resolve(remoteResult(listResponse())));
        await waitFor(() => expect(mock).toHaveBeenCalledTimes(4));
        expect(mock.mock.calls.filter(([method]) => method === "getStatus")).toHaveLength(2);
    });

    it("ignores a read invalidated by a write and shows the post-write version", async () => {
        const pending = deferred<RemoteResult<unknown>>();
        let hold = false;
        let version = 2;
        const mock = vi.fn<Rpc>(async (method) => {
            if (method === "list") return remoteResult(listResponse());
            if (method === "getStatus")
                return hold
                    ? pending.promise
                    : remoteResult(success(statusResult("running", version), version));
            version = 4;
            hold = false;
            return remoteResult(success({ status: "paused", changed: true }, version));
        });
        setRpc(mock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        hold = true;
        fireEvent.click(screen.getByLabelText("Reload meetings"));
        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Review" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));
        await act(async () =>
            pending.resolve(remoteResult(success(statusResult("running", 3), 3)))
        );
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain(
                "Meeting version4"
            )
        );
        expect(mock.mock.calls.filter(([method]) => method === "pause")).toHaveLength(1);
    });

    it("keeps the new selection when a previous detail resolves late", async () => {
        const pending = deferred<RemoteResult<unknown>>();
        const other = { ...listItem, meetingId: "meeting/2", topic: "Second meeting" };
        setRpc(async (method, options) => {
            if (method === "list") return remoteResult(listResponse([listItem, other]));
            const input = options.input;
            if (
                input &&
                typeof input === "object" &&
                "meetingId" in input &&
                input.meetingId === meetingId
            )
                return pending.promise;
            return remoteResult({
                ...success({ ...statusResult(), meetingId: other.meetingId, topic: other.topic }),
                meetingId: other.meetingId
            });
        });
        render(createElement(ConviviumMeetingPanel, { api }));
        fireEvent.click(await screen.findByRole("button", { name: /Runtime smoke/ }));
        fireEvent.click(screen.getByRole("button", { name: /Second meeting/ }));
        await act(async () => pending.resolve(remoteResult(success(statusResult()))));
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("Second meeting")
        );
        expect(screen.getByLabelText("Meeting summary").textContent).not.toContain("Runtime smoke");
    });

    it("keeps writes exclusive and refetches status after a successful write", async () => {
        const post = deferred<RemoteResult<unknown>>();
        const pausedListItem = { ...listItem, status: "paused" as const, meetingVersion: 3 };
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockImplementationOnce(() => post.promise)
            .mockResolvedValueOnce(remoteResult(listResponse([pausedListItem])))
            .mockResolvedValueOnce(remoteResult(success(statusResult("paused", 3), 3)));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), {
            target: { value: "Inspect output" }
        });
        fireEvent.click(screen.getByLabelText("Pause meeting"));
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        expect(rpcMock).toHaveBeenCalledTimes(4);

        window.dispatchEvent(new Event("focus"));
        await act(async () => Promise.resolve());
        expect(rpcMock).toHaveBeenCalledTimes(4);

        await act(async () => {
            post.resolve(remoteResult(success({ status: "paused", changed: true }, 3)));
            await post.promise;
        });
        await screen.findByText("paused");
        expect(rpcMock).toHaveBeenCalledTimes(6);
        expect(screen.getByRole("button", { name: /Runtime smoke \(paused\)/ })).toBeTruthy();
        expect(rpcMock.mock.calls.filter((call) => isWrite(call[0]))).toHaveLength(1);
        expect(rpcMock.mock.calls[3]?.[1]?.input).toEqual({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            requestId: "request-1",
            reason: "Inspect output"
        });
    });

    it("shows Skip only for a visible current attempt and posts the fixed skip payload", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("running", 2, true))))
            .mockResolvedValueOnce(
                remoteResult(success({ revokedAttemptId: "attempt-1", action: "skip" }, 3))
            )
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("running", 3))));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        expect(screen.getByLabelText("Skip current speaker")).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Skip reason"), {
            target: { value: "Move on" }
        });
        fireEvent.click(screen.getByLabelText("Skip current speaker"));
        await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(6));
        expect(rpcMock.mock.calls[3]?.[0]).toBe("reassign");
        expect(rpcMock.mock.calls[3]?.[1]?.input).toEqual({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            currentAttemptId: "attempt-1",
            action: "skip",
            reason: "Move on",
            requestId: "request-1"
        });
        expect(JSON.stringify(rpcMock.mock.calls[3]?.[1]?.input)).not.toContain(
            "replacementParticipantId"
        );
    });

    it("limits End outcomes and posts the fixed empty completion fields", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("converging", 2))))
            .mockResolvedValueOnce(
                remoteResult(
                    success({ status: "no_consensus", terminationCode: "no_consensus" }, 3)
                )
            )
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(terminalStatusResult()));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        expectSelectedEndOutcome("Partial");
        expect(screen.queryByRole("radio", { name: "Completed" })).toBeNull();
        fireEvent.click(screen.getByRole("radio", { name: "No consensus", exact: true }));
        expectSelectedEndOutcome("No consensus");
        expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(0);
        fireEvent.change(screen.getByLabelText("End reason"), {
            target: { value: "No consensus reached" }
        });
        fireEvent.click(screen.getByLabelText("End meeting"));
        await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(6));
        expect(rpcMock.mock.calls[3]?.[0]).toBe("end");
        expect(rpcMock.mock.calls[3]?.[1]?.input).toEqual({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            outcome: "no_consensus",
            reason: "No consensus reached",
            acceptedDecisionIds: [],
            deferredAgendaItemIds: [],
            waivers: [],
            requestId: "request-1"
        });
    });

    it("keeps one End outcome selected through keyboard navigation", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        let selected = expectSelectedEndOutcome("Partial");
        selected.focus();
        for (const [key, name] of [
            ["ArrowRight", "No consensus"],
            ["ArrowDown", "Cancelled"],
            ["ArrowRight", "Partial"],
            ["ArrowLeft", "Cancelled"],
            ["ArrowUp", "No consensus"],
            ["Home", "Partial"],
            ["End", "Cancelled"],
            ["Home", "Partial"]
        ] as const) {
            expect(fireEvent.keyDown(selected, { key })).toBe(false);
            selected = expectSelectedEndOutcome(name);
            expect(document.activeElement).toBe(selected);
        }
        expect(fireEvent.keyDown(selected, { key: "Tab" })).toBe(true);
        fireEvent.click(selected);
        expectSelectedEndOutcome("Partial");
        expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(0);
    });

    it("resets End outcome when selecting another meeting", async () => {
        const secondId = "meeting/2";
        const secondDetail = {
            ...statusResult(),
            meetingId: secondId,
            topic: "Second meeting"
        };
        const rpcMock = vi.fn<Rpc>(async (method, options) => {
            if (method === "list")
                return remoteResult(
                    listResponse([
                        listItem,
                        { ...listItem, meetingId: secondId, topic: "Second meeting" }
                    ])
                );
            const input = options.input;
            return remoteResult(
                input &&
                    typeof input === "object" &&
                    "meetingId" in input &&
                    input.meetingId === secondId
                    ? { ...success(secondDetail), meetingId: secondId }
                    : success(statusResult())
            );
        });
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        fireEvent.click(screen.getByRole("radio", { name: "Cancelled", exact: true }));
        expectSelectedEndOutcome("Cancelled");
        fireEvent.click(
            screen.getByRole("button", { name: "Second meeting (running)", exact: true })
        );
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("Second meeting")
        );
        expectSelectedEndOutcome("Partial");
        expect(rpcMock.mock.calls.at(-1)?.[1]?.input).toEqual({
            protocolVersion: 1,
            meetingId: secondId
        });
        expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(0);
    });

    it.each(["list", "detail"] as const)(
        "locks End outcome for cached %s and unlocks after a valid refresh",
        async (source) => {
            const rpcMock = vi
                .fn<Rpc>()
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(remoteResult(listResponse()))
                .mockResolvedValueOnce(remoteResult(success(statusResult())));
            setRpc(rpcMock);
            render(createElement(ConviviumMeetingPanel, { api }));
            await selectMeeting();
            fireEvent.click(screen.getByRole("radio", { name: "No consensus", exact: true }));
            if (source === "detail") rpcMock.mockResolvedValueOnce(remoteResult(listResponse()));
            rpcMock.mockRejectedValueOnce(new TypeError("cached " + source));
            if (source === "list") fireEvent.click(screen.getByLabelText("Reload meetings"));
            else fireEvent.focus(window);
            await waitFor(() =>
                expect(screen.getByRole(source === "list" ? "status" : "alert")).toBeTruthy()
            );
            const selected = expectSelectedEndOutcome("No consensus");
            for (const radio of screen.getAllByRole("radio") as HTMLButtonElement[]) {
                expect(radio.disabled).toBe(true);
            }
            fireEvent.click(screen.getByRole("radio", { name: "Cancelled", exact: true }));
            fireEvent.keyDown(selected, { key: "ArrowRight" });
            expectSelectedEndOutcome("No consensus");
            rpcMock.mockResolvedValueOnce(remoteResult(listResponse()));
            rpcMock.mockResolvedValueOnce(remoteResult(success(statusResult("running", 3), 3)));
            if (source === "detail") fireEvent.focus(window);
            else fireEvent.click(screen.getByLabelText("Reload meetings"));
            await waitFor(() => {
                for (const radio of screen.getAllByRole("radio") as HTMLButtonElement[]) {
                    expect(radio.disabled).toBe(false);
                }
            });
            expectSelectedEndOutcome("No consensus");
            expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(0);
        }
    );

    it("locks End outcome during a pending write and does not duplicate the POST", async () => {
        const reply = deferred<RemoteResult<unknown>>();
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockReturnValueOnce(reply.promise)
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("running", 3), 3)));
        setRpc(rpcMock);
        const rendered = render(createElement(ConviviumMeetingPanel, { api }));
        try {
            await selectMeeting();
            fireEvent.change(screen.getByLabelText("End reason"), {
                target: { value: "Reviewed" }
            });
            const end = screen.getByLabelText("End meeting");
            act(() => {
                fireEvent.click(end);
                fireEvent.click(end);
            });
            const selected = expectSelectedEndOutcome("Partial");
            for (const radio of screen.getAllByRole("radio") as HTMLButtonElement[]) {
                expect(radio.disabled).toBe(true);
            }
            fireEvent.click(screen.getByRole("radio", { name: "Cancelled", exact: true }));
            fireEvent.keyDown(selected, { key: "End" });
            expectSelectedEndOutcome("Partial");
            expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(1);
            await act(async () => {
                reply.resolve(remoteResult(protocolError("Safe conflict")));
            });
            await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(6));
            await waitFor(() => expect(expectSelectedEndOutcome("Partial").disabled).toBe(false));
            expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(1);
        } finally {
            reply.resolve(remoteResult(protocolError("Safe conflict")));
            rendered.unmount();
        }
    });

    it("refetches after a validated protocol error without retrying the write", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockResolvedValueOnce(remoteResult(protocolError("Safe conflict")))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("running", 3), 3)));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Reason" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));

        await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(6));
        expect(rpcMock.mock.calls.filter((call) => isWrite(call[0]))).toHaveLength(1);
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("3")
        );
        expect(screen.queryByText("Safe conflict")).toBeNull();
    });

    it("does not retry a transport-failed write and keeps the projection read-only", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network write"));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Reason" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));

        await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
        expect(rpcMock).toHaveBeenCalledTimes(4);
        expect(rpcMock.mock.calls.filter((call) => isWrite(call[0]))).toHaveLength(1);
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("2");
    });

    it("does not expose controls for a terminal projection", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(terminalStatusResult(), 5)));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        expect(screen.getByLabelText("Meeting summary").textContent).toContain("completed");
        expect(screen.queryByLabelText("Pause meeting")).toBeNull();
        expect(screen.queryByLabelText("Resume meeting")).toBeNull();
        expect(screen.queryByLabelText("Skip current speaker")).toBeNull();
        expect(screen.queryByLabelText("End meeting")).toBeNull();
    });

    it("disables meeting writes when the list projection becomes cached", async () => {
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network list"));
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        fireEvent.click(screen.getByLabelText("Reload meetings"));

        await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
    });

    it("preserves cached data on failures, refreshes on notice, and aborts on unmount", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const rpcMock = vi
            .fn<Rpc>()
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network list"))
            .mockRejectedValueOnce(new TypeError("network detail"))
            .mockRejectedValueOnce(new TypeError("network list"))
            .mockRejectedValueOnce(new TypeError("network detail"))
            .mockResolvedValueOnce(remoteResult(listResponse()))
            .mockResolvedValueOnce(remoteResult(success(statusResult("running", 4), 4)));
        setRpc(rpcMock);
        const rendered = render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        window.dispatchEvent(new Event("focus"));
        await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("2");
        expect(screen.getByRole("alert").parentElement?.getAttribute("data-cached")).toBe("true");
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);

        fireEvent.click(screen.getByLabelText("Reload meetings"));
        await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
        expect(screen.getByLabelText("Meetings").parentElement?.getAttribute("data-cached")).toBe(
            "true"
        );
        expect(screen.getByRole("alert").parentElement?.getAttribute("data-cached")).toBe("true");

        await act(async () => streams.at(-1)!.push());
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("4")
        );
        const lastSignal = rpcMock.mock.calls.at(-1)?.[1]?.signal;
        rendered.unmount();
        expect(lastSignal?.aborted).toBe(true);
    });
});

describe("referenced minutes Client", () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });
    const source = {
        id: "source-1",
        seq: 1,
        turnId: "turn-1",
        stepId: "step-1",
        speaker: "participant-one",
        agendaItemId: "agenda-1",
        kind: "statement" as const,
        content: "source",
        mentions: [],
        taskIds: [],
        createdAt: 1
    };
    const draft = {
        ...source,
        id: "draft-3",
        seq: 3,
        kind: "summary" as const,
        content: "<script>draft text</script>",
        minutesDraft: {
            status: "draft" as const,
            coverage: { fromSeq: 1, throughSeq: 2 },
            referencedMessageIds: ["source-2", "source-1"]
        }
    };
    const messages = [source, { ...source, id: "source-2", seq: 2 }, draft];
    it("shows active and archived metadata safely and clears it on refresh and meeting switch", () => {
        const active = { ...statusResult(), messages };
        const renderDetail = (detail: unknown) =>
            renderObservabilitySections(MeetingStatusResultSchema(detail));
        const mounted = render(renderDetail(active));
        const assertDraft = () => {
            const transcript = screen.getByLabelText("Transcript");
            expect(transcript.querySelectorAll("script")).toHaveLength(0);
            const row = transcript.querySelector('[data-message-seq="3"]')!;
            for (const text of [
                draft.content,
                "Minutes draft (non-authoritative)",
                "messages 1–2",
                "source-2, source-1"
            ])
                expect(row.textContent).toContain(text);
            expect(transcript.querySelector('[data-message-seq="1"]')!.textContent).not.toContain(
                "Minutes draft"
            );
        };
        assertDraft();
        mounted.rerender(renderDetail(structuredClone(active)));
        assertDraft();
        const archived = factArchiveStatus("archived");
        mounted.rerender(
            renderDetail({
                ...archived,
                archive: {
                    ...archived.archive,
                    package: { ...archived.archive.package, formalTranscript: messages }
                }
            })
        );
        assertDraft();
        mounted.rerender(
            renderDetail({ ...statusResult(), meetingId: "another-meeting", messages: [source] })
        );
        expect(screen.getByLabelText("Transcript").textContent).not.toContain("Minutes draft");
        expect(screen.getByLabelText("Transcript").textContent).not.toContain(
            "Referenced message IDs"
        );
    });
    it("keeps minutes separate from speaker, pending decisions, tasks, waiting and accepted decisions", () => {
        const detail = {
            ...factStatus("running"),
            ...statusResult("running", 2, true),
            messages,
            acceptedDecisions: factStatus("running").acceptedDecisions,
            decisionHistory: factStatus("running").decisionHistory,
            pendingDecisionCandidates: [
                {
                    id: "candidate-1",
                    proposalId: "proposal-1",
                    proposalRevision: 1,
                    statement: "CANDIDATE MARKER",
                    rationale: "SUGGESTION REASON",
                    proposedBy: "participant-one",
                    sourceMessageId: "source-1",
                    agendaItemId: "agenda-1",
                    createdAt: 1
                }
            ],
            meetingTasks: [
                {
                    meetingTaskId: "task-1",
                    participantId: "participant-one",
                    title: "TASK MARKER",
                    blocking: false,
                    status: "running",
                    createdAt: 1
                }
            ]
        };
        const mounted = render(renderObservabilitySections(MeetingStatusResultSchema(detail)));
        const activity = screen.getByLabelText("Current activity");
        expect(
            [...activity.querySelectorAll("dt")].find(
                (node) => node.textContent === "Current speaker"
            )?.nextElementSibling?.textContent
        ).toBe("participant-one");
        expect(screen.getByLabelText("Pending decisions").textContent).toContain(
            "CANDIDATE MARKER"
        );
        expect(screen.getByLabelText("Pending decisions").textContent).toContain(
            "SUGGESTION REASON"
        );
        expect(screen.getByLabelText("Meeting tasks").textContent).toContain("TASK MARKER");
        expect(screen.getByLabelText("Meeting tasks").textContent).toContain("running");
        expect(screen.getByLabelText("Accepted decisions").textContent).toContain(
            "Current decision"
        );
        for (const section of ["Pending decisions", "Meeting tasks", "Accepted decisions"]) {
            expect(screen.getByLabelText(section).textContent).not.toContain(draft.content);
            expect(screen.getByLabelText(section).textContent).not.toContain("Minutes draft");
        }
        const draftRow = screen
            .getByLabelText("Transcript")
            .querySelector('[data-message-seq="3"]')!;
        for (const marker of ["CANDIDATE MARKER", "TASK MARKER", "Current decision"])
            expect(draftRow.textContent).not.toContain(marker);
        const {
            currentTurn: _turn,
            currentSpeakerId: _speaker,
            currentAttemptId: _attempt,
            ...waiting
        } = detail;
        mounted.rerender(
            renderObservabilitySections(
                MeetingStatusResultSchema({
                    ...waiting,
                    status: "waiting",
                    waitState: {
                        reason: "blocking_task",
                        waitingSince: 1,
                        taskIds: ["task-1"],
                        participantIds: ["participant-one"]
                    }
                })
            )
        );
        const updated = screen.getByLabelText("Current activity");
        expect(updated.textContent).toContain("blocking_task");
        expect(updated.textContent).toContain("participant-one");
        expect(
            [...updated.querySelectorAll("dt")].find(
                (node) => node.textContent === "Current speaker"
            )?.nextElementSibling?.textContent
        ).toBe("None");
    });
});

describe("local decision risk panel controls", () => {
    useRemoteFixture();
    function localControlStatus(): MeetingStatusResultV1 {
        const decision = {
            id: "decision-old",
            proposalId: "proposal-1",
            proposalRevision: 1,
            status: "accepted" as const
        };
        return {
            ...statusResult("running", 2, true),
            messages: [
                {
                    id: "message-1",
                    seq: 1,
                    turnId: "turn-1",
                    stepId: "step-1",
                    speaker: "participant-1",
                    agendaItemId: "agenda-1",
                    kind: "statement",
                    content: "Local control evidence",
                    mentions: [],
                    taskIds: [],
                    createdAt: 1700000000000
                }
            ],
            pendingDecisionCandidates: ["Scope A", "Scope B"].map((statement, index) => ({
                id: `candidate-${index + 1}`,
                proposalId: "proposal-1",
                proposalRevision: 1,
                proposedBy: "participant-1",
                sourceMessageId: "message-1",
                agendaItemId: "agenda-1",
                createdAt: 1700000000000,
                statement,
                rationale: "Supported scope"
            })),
            acceptedDecisions: [decision],
            decisionHistory: [decision],
            risks: [
                {
                    id: "risk-1",
                    title: "Bounded risk",
                    description: "A reversible risk",
                    sourceMessageId: "message-1",
                    agendaItemId: "agenda-1",
                    affectedOutputIds: [],
                    affectedCriterionIds: [],
                    violatedConstraintIds: [],
                    blockingObjectionIds: [],
                    relatedTaskIds: [],
                    blocking: true,
                    riskLevel: "low",
                    impact: "Low impact",
                    urgency: "before_release",
                    reversibility: "reversible",
                    safeDefaultAvailable: true,
                    disposition: "blocking",
                    status: "open"
                }
            ]
        };
    }
    beforeEach(() => {
        vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-local") });
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });
    function mount(
        state = localControlStatus(),
        post: () => Promise<RemoteResult<unknown>> = async () => remoteResult({})
    ) {
        const rpcMock = vi.fn<Rpc>(async (url) => {
            if (isWrite(url)) return post();
            return remoteResult(
                String(url) === "list" ? listResponse() : success(state, state.meetingVersion)
            );
        });
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        return rpcMock;
    }
    function open(label: string) {
        fireEvent.click(screen.getAllByRole("button", { name: label })[0]!);
    }
    const actions = [
        [
            "Accept decision",
            "acceptDecision",
            { decisionCandidateId: "candidate-1" },
            {
                requestId: "request-local",
                decisionCandidateId: "candidate-1",
                decisionId: "decision-candidate-1",
                proposalId: "proposal-1",
                proposalRevision: 1,
                completionFactId: "fact-1"
            }
        ],
        [
            "Replace decision",
            "disposeDecision",
            {
                decisionId: "decision-old",
                action: "supersede",
                replacementCandidateId: "candidate-2"
            },
            {
                requestId: "request-local",
                decisionId: "decision-old",
                action: "supersede",
                replacementDecisionId: "decision-candidate-2",
                completionFactId: "fact-2"
            }
        ],
        [
            "Revoke decision",
            "disposeDecision",
            { decisionId: "decision-old", action: "revoke" },
            {
                requestId: "request-local",
                decisionId: "decision-old",
                action: "revoke",
                completionFactId: "fact-3"
            }
        ],
        [
            "Accept risk",
            "disposeRisk",
            { issueId: "risk-1", decision: "accept" },
            {
                requestId: "request-local",
                issueId: "risk-1",
                disposition: "accepted",
                completionFactId: "fact-4",
                meetingStatus: "running"
            }
        ],
        [
            "Set as blocking",
            "disposeRisk",
            { issueId: "risk-1", decision: "reject" },
            {
                requestId: "request-local",
                issueId: "risk-1",
                disposition: "rejected",
                completionFactId: "fact-5",
                meetingStatus: "running"
            }
        ]
    ] as const;
    it.each(actions)(
        "submits %s from its row and refreshes verified facts",
        async (label, suffix, fields, result) => {
            const state = localControlStatus();
            if (label === "Set as blocking")
                Object.assign(state.risks[0]!, {
                    status: "accepted_risk",
                    disposition: "accepted_risk",
                    blocking: false
                });
            const rpcMock = mount(state, async () => {
                state.meetingVersion = 3;
                return remoteResult(success(result, 3));
            });
            await selectMeeting();
            open(label);
            expect(screen.getAllByRole("form", { name: "Decision and risk control" })).toHaveLength(
                1
            );
            expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe("");
            expect(
                (screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled
            ).toBe(true);
            if (label === "Replace decision")
                fireEvent.change(screen.getByLabelText("Replacement decision"), {
                    target: { value: "candidate-2" }
                });
            else expect(screen.queryByLabelText("Replacement decision")).toBeNull();
            const evidence = screen.getByRole("checkbox", {
                name: "Local control evidence"
            }) as HTMLInputElement;
            if (label === "Revoke decision") {
                expect(evidence.checked).toBe(false);
                fireEvent.click(evidence);
            } else expect(evidence.checked).toBe(true);
            expect(screen.getByLabelText("Selected evidence").textContent).toContain(
                "Local control evidence"
            );
            fireEvent.change(screen.getByLabelText("Reason"), {
                target: { value: "Reviewed evidence" }
            });
            fireEvent.click(screen.getByRole("button", { name: "Submit" }));
            await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
            await waitFor(() =>
                expect(screen.getByLabelText("Meeting summary").textContent).toContain(
                    "Meeting version3"
                )
            );
            const posts = rpcMock.mock.calls.filter(([method]) => isWrite(method));
            expect(posts).toHaveLength(1);
            expect(posts[0]![0]).toBe(suffix);
            expect(posts[0]![1]!.input).toEqual({
                protocolVersion: 1,
                meetingId,
                expectedMeetingVersion: 2,
                requestId: "request-local",
                reason: "Reviewed evidence",
                evidenceMessageIds: ["message-1"],
                ...fields
            });
        }
    );
    it("keeps one cancellable draft, requires evidence and clears a vanished target", async () => {
        const state = localControlStatus();
        state.pendingDecisionCandidates[0]!.sourceMessageId = "missing";
        mount(state);
        await selectMeeting();
        open("Accept decision");
        expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
        open("Revoke decision");
        expect(screen.getAllByRole("form")).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("form")).toBeNull();
        open("Accept decision");
        fireEvent.change(screen.getByLabelText("Reason"), { target: { value: " " } });
        expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(
            true
        );
        state.pendingDecisionCandidates = [];
        fireEvent.focus(window);
        await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    });
    it("preserves structured refusal after refresh and never retries the write", async () => {
        const error = {
            protocolVersion: 1,
            ok: false,
            code: "VERSION_CONFLICT",
            message: "Version changed",
            retryable: true
        };
        const rpcMock = mount(localControlStatus(), async () => remoteResult(error));
        await selectMeeting();
        open("Accept decision");
        fireEvent.change(screen.getByLabelText("Reason"), {
            target: { value: "Reviewed evidence" }
        });
        fireEvent.click(screen.getByRole("button", { name: "Submit" }));
        await screen.findByRole("alert");
        fireEvent.focus(window);
        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toContain(
                "VERSION_CONFLICT: Version changed Refresh before submitting again"
            )
        );
        expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(1);
    });
    it.each(["transport", "invalid"])("fails closed on %s without retry", async (kind) => {
        const rpcMock = mount(localControlStatus(), async () => {
            if (kind === "transport") throw new Error("offline");
            return remoteResult(success({ invalid: true }));
        });
        await selectMeeting();
        open("Accept risk");
        fireEvent.change(screen.getByLabelText("Reason"), {
            target: { value: "Reviewed evidence" }
        });
        fireEvent.click(screen.getByRole("button", { name: "Submit" }));
        await screen.findByRole("alert");
        expect(
            (screen.getByRole("button", { name: "Accept risk" }) as HTMLButtonElement).disabled
        ).toBe(true);
        expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(1);
        fireEvent.focus(window);
        await waitFor(() =>
            expect(
                (screen.getByRole("button", { name: "Accept risk" }) as HTMLButtonElement).disabled
            ).toBe(false)
        );
    });
    it("shares the existing write lock and ignores a late refusal after reopen", async () => {
        const pending = deferred<RemoteResult<unknown>>();
        const rpcMock = mount(localControlStatus(), () => pending.promise);
        await selectMeeting();
        open("Accept decision");
        fireEvent.change(screen.getByLabelText("Reason"), {
            target: { value: "Reviewed evidence" }
        });
        fireEvent.click(screen.getByRole("button", { name: "Submit" }));
        expect(
            (screen.getByRole("button", { name: "Pause meeting" }) as HTMLButtonElement).disabled
        ).toBe(true);
        fireEvent.submit(screen.getByRole("form"));
        expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(1);
        await selectMeeting();
        await act(async () =>
            pending.resolve(
                remoteResult({
                    protocolVersion: 1,
                    ok: false,
                    code: "VERSION_CONFLICT",
                    message: "late failure",
                    retryable: false
                })
            )
        );
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByRole("form")).toBeNull();
    });
    it.each(["missing-risk-level", "constraint"])(
        "disables %s risk and hides duplicate dispositions",
        async (kind) => {
            const state = localControlStatus();
            if (kind === "missing-risk-level") delete state.risks[0]!.riskLevel;
            else state.risks[0]!.violatedConstraintIds = ["constraint-1"];
            mount(state);
            await selectMeeting();
            expect(
                (screen.getByRole("button", { name: "Accept risk" }) as HTMLButtonElement).disabled
            ).toBe(true);
            expect(screen.queryByRole("button", { name: "Set as blocking" })).toBeNull();
        }
    );
    it.each([
        "completed",
        "partial",
        "no_consensus",
        "cancelled",
        "failed",
        "archiving",
        "archived"
    ] as const)("hides every fact action in %s", async (status) => {
        const state =
            status === "archived" || status === "archiving"
                ? factArchiveStatus(status)
                : factTerminalStatus(status);
        mount(state);
        await selectMeeting();
        for (const [label] of actions)
            expect(screen.queryByRole("button", { name: label })).toBeNull();
    });
    it("invalidates replacement and evidence on refresh while preserving the reason", async () => {
        const state = localControlStatus();
        mount(state);
        await selectMeeting();
        open("Replace decision");
        fireEvent.change(screen.getByLabelText("Replacement decision"), {
            target: { value: "candidate-2" }
        });
        fireEvent.change(screen.getByLabelText("Reason"), {
            target: { value: "Reviewed evidence" }
        });
        state.pendingDecisionCandidates = state.pendingDecisionCandidates.slice(0, 1);
        // A focus refresh rebuilds the subscription and reloads complete facts.
        fireEvent.focus(window);
        await waitFor(() =>
            expect((screen.getByLabelText("Replacement decision") as HTMLSelectElement).value).toBe(
                ""
            )
        );
        expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe(
            "Reviewed evidence"
        );
        expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
        expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(
            true
        );
    });
    it("blocks submission when list facts become cached", async () => {
        const rpcMock = mount();
        await selectMeeting();
        open("Accept decision");
        fireEvent.change(screen.getByLabelText("Reason"), {
            target: { value: "Reviewed evidence" }
        });
        rpcMock.mockRejectedValueOnce(new Error("list unavailable"));
        fireEvent.click(screen.getByRole("button", { name: "Reload meetings" }));
        await waitFor(() =>
            expect(screen.getByRole("status").textContent).toContain("Meeting data is unavailable")
        );
        fireEvent.submit(screen.getByRole("form"));
        expect(rpcMock.mock.calls.filter(([method]) => isWrite(method))).toHaveLength(0);
    });
    it("aborts an unmounted write and ignores its late result", async () => {
        const pending = deferred<RemoteResult<unknown>>();
        const rpcMock = mount(localControlStatus(), () => pending.promise);
        await selectMeeting();
        open("Accept decision");
        fireEvent.change(screen.getByLabelText("Reason"), {
            target: { value: "Reviewed evidence" }
        });
        fireEvent.click(screen.getByRole("button", { name: "Submit" }));
        const post = rpcMock.mock.calls.find(([method]) => isWrite(method))!;
        cleanup();
        expect(post[1]?.signal?.aborted).toBe(true);
        const calls = rpcMock.mock.calls.length;
        await act(async () =>
            pending.resolve(
                remoteResult({
                    protocolVersion: 1,
                    ok: false,
                    code: "VERSION_CONFLICT",
                    message: "late",
                    retryable: false
                })
            )
        );
        expect(rpcMock).toHaveBeenCalledTimes(calls);
    });
});

describe("meeting proposal, hand raise and convergence visibility", () => {
    it("renders proposals, revision-scoped positions, raises and convergence and replaces stale facts", () => {
        const detail = statusResult();
        if (detail.status !== "running") throw new Error("active fixture required");
        detail.proposals = [
            {
                id: "proposal-a",
                agendaItemId: "agenda-1",
                title: "Reviewed proposal",
                description: "Public proposal content",
                revision: 2,
                status: "under_review",
                positions: [
                    {
                        id: "position-a",
                        participantId: "participant-a",
                        position: "needs_revision",
                        reason: "Missing evidence",
                        blocking: true,
                        proposalRevision: 2
                    }
                ]
            }
        ];
        detail.pendingHandRaises = [
            {
                id: "raise-a",
                participantId: "participant-b",
                reason: "new_evidence",
                summary: "Evidence ready",
                taskIds: [],
                priority: "blocking"
            }
        ];
        detail.stallCount = 2;
        detail.replanCount = 1;
        const rendered = render(renderObservabilitySections(detail));
        expect(
            screen.getByRole("region", { name: "Proposals and positions" }).textContent
        ).toContain("needs_revision");
        expect(
            screen.getByRole("region", { name: "Proposals and positions" }).textContent
        ).toContain("Missing evidence");
        expect(screen.getByRole("region", { name: "Pending hand raises" }).textContent).toContain(
            "Evidence ready"
        );
        expect(screen.getByRole("region", { name: "Convergence" }).textContent).toContain("2 / 3");
        rendered.rerender(renderObservabilitySections(statusResult()));
        expect(screen.queryByText("Evidence ready")).toBeNull();
        expect(screen.queryByText("Missing evidence")).toBeNull();
    });
});
