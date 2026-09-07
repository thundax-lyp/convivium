import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apply, inject, name } from "../../src/client/index.js";
import { ConviviumMeetingPanel } from "../../src/client/meeting-panel.js";
import { mapMeetingPanelView } from "../../src/client/meeting-panel-view.js";
import type { MeetingStatusResultV1 } from "../../src/protocol/index.js";
import { MeetingStatusResultSchema } from "../../src/protocol/index.js";
import type { PublicDecisionV1 } from "../../src/protocol/index.js";
import type { PublicArchiveAgendaCandidateV1 } from "../../src/protocol/index.js";
import type { PublicArchiveIssueV1 } from "../../src/protocol/index.js";
import { renderObservabilitySections } from "../../src/client/meeting-panel-sections.js";

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
    const view = mapMeetingPanelView(detail);
    const groups = [
        { label: "Decision history", attr: "data-decision-id", items: view.decisionHistory },
        { label: "Accepted decisions", attr: "data-decision-id", items: view.acceptedDecisions },
        { label: "Parking Lot", attr: "data-candidate-id", items: view.parkingLot },
        { label: "Risks", attr: "data-risk-id", items: view.risks }
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

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" }
    });
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

describe("client entry framework", () => {
    beforeEach(() => {
        vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-1") });
    });

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
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) =>
                String(input) === "/api/convivium/meetings"
                    ? jsonResponse(listResponse())
                    : jsonResponse(success(detail, detail.meetingVersion))
            )
        );
        render(createElement(ConviviumMeetingPanel));
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

    it("fact visibility: panel DOM renders decision history from validated detail", async () => {
        const detail = factStatus("running");
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) =>
                String(input) === "/api/convivium/meetings"
                    ? jsonResponse(listResponse())
                    : jsonResponse(success(detail, detail.meetingVersion))
            )
        );
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();
        await waitFor(() => {
            expect(screen.getByLabelText("Decision history").textContent).toContain("d-revoked");
        });
        expect(screen.getByLabelText("Accepted decisions").textContent).toContain("d-current");
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
        vi.stubGlobal(
            "fetch",
            vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(jsonResponse(listResponse()))
                .mockResolvedValueOnce(jsonResponse(success(detail)))
        );
        render(createElement(ConviviumMeetingPanel));
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

    it("registers the meeting panel only through the conversation view injection", () => {
        let contribution: unknown;
        const register = vi.fn((_options, component) => {
            contribution = component;
            return vi.fn();
        });
        const slotInject = vi.fn((_key, callback: () => unknown) => callback());

        expect(name).toBe("convivium-client");
        expect(inject).toEqual(["slots"]);
        apply({ slots: { inject: slotInject, register } } as never);

        expect(slotInject).toHaveBeenCalledTimes(1);
        expect(slotInject).toHaveBeenCalledWith("conversation.view", expect.any(Function));
        expect(register).toHaveBeenCalledWith(
            {
                name: "conversation.view",
                id: "convivium-meetings",
                label: "Meetings",
                order: 100
            },
            ConviviumMeetingPanel
        );
        expect(contribution).toBe(ConviviumMeetingPanel);
    });

    it("loads only the list initially, then renders a validated full paused projection", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("paused", 3), 3)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));

        const item = await screen.findByRole("button", { name: /Runtime smoke/ });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(item.getAttribute("data-meeting-id")).toBe(meetingId);
        expect(screen.getByTestId("convivium-meeting-panel").getAttribute("aria-label")).toBe(
            "Convivium meetings"
        );
        expect(screen.getByLabelText("Meetings")).toBeTruthy();

        fireEvent.click(item);
        await screen.findByLabelText("Meeting summary");
        expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/convivium/meetings/meeting%2F1");
        expect(screen.getByLabelText("Resume meeting")).toBeTruthy();
        expect(screen.queryByLabelText("Pause meeting")).toBeNull();
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("paused");
        expect(screen.getByLabelText("Pause details").textContent).toContain("Inspect output");
        expect(screen.getByLabelText("Pause details").textContent).toContain("loopback-web");
        expect(screen.getByLabelText("Meeting limits").textContent).toContain("Maximum turns3");
    });

    it("refreshes both the selected detail and list summary when the window regains focus", async () => {
        const pausedListItem = { ...listItem, status: "paused" as const, meetingVersion: 3 };
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockResolvedValueOnce(jsonResponse(listResponse([pausedListItem])))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("paused", 3), 3)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        window.dispatchEvent(new Event("focus"));

        await screen.findByText("paused");
        expect(screen.getByRole("button", { name: /Runtime smoke \(paused\)/ })).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it.each(["focus", "poll"] as const)(
        "fact visibility: %s replaces complete facts and reopen retains archive",
        async (trigger) => {
            if (trigger === "poll") vi.useFakeTimers({ shouldAdvanceTime: true });
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
            vi.stubGlobal(
                "fetch",
                vi.fn(async (input: RequestInfo | URL) =>
                    String(input) === "/api/convivium/meetings"
                        ? jsonResponse(listResponse())
                        : jsonResponse(success(selected, selected.meetingVersion))
                )
            );
            const rendered = render(createElement(ConviviumMeetingPanel));
            await selectMeeting();
            assertRefreshFacts(active);
            fireEvent.change(screen.getByLabelText("Pause reason"), {
                target: { value: "Inspect facts" }
            });
            expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(false);
            for (const next of [terminal, archived]) {
                selected = next;
                if (trigger === "poll") await act(async () => vi.advanceTimersByTime(5_000));
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
            render(createElement(ConviviumMeetingPanel));
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
            const fetchMock = vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(jsonResponse(listResponse([listItem])))
                .mockResolvedValueOnce(jsonResponse(success(initial, 2)))
                .mockResolvedValueOnce(jsonResponse(listResponse()))
                .mockResolvedValueOnce(
                    jsonResponse(success(malformed, malformedSource.meetingVersion))
                );
            vi.stubGlobal("fetch", fetchMock);
            render(createElement(ConviviumMeetingPanel));
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
            fetchMock.mockResolvedValueOnce(jsonResponse(listResponse()));
            fetchMock.mockResolvedValueOnce(
                jsonResponse(success(refreshFactStatus("archived"), 6))
            );
            window.dispatchEvent(new Event("focus"));
            await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
            await waitFor(() => assertRefreshFacts(refreshFactStatus("archived")));
            expect(screen.getByLabelText("Decision history").textContent).toContain("d-current");
        }
    );

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

    it("keeps writes exclusive and refetches status after a successful write", async () => {
        const post = deferred<Response>();
        const pausedListItem = { ...listItem, status: "paused" as const, meetingVersion: 3 };
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockImplementationOnce(() => post.promise)
            .mockResolvedValueOnce(jsonResponse(listResponse([pausedListItem])))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("paused", 3), 3)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), {
            target: { value: "Inspect output" }
        });
        fireEvent.click(screen.getByLabelText("Pause meeting"));
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(3);

        window.dispatchEvent(new Event("focus"));
        await act(async () => Promise.resolve());
        expect(fetchMock).toHaveBeenCalledTimes(3);

        await act(async () => {
            post.resolve(jsonResponse(success({ status: "paused", changed: true }, 3)));
            await post.promise;
        });
        await screen.findByText("paused");
        expect(fetchMock).toHaveBeenCalledTimes(5);
        expect(screen.getByRole("button", { name: /Runtime smoke \(paused\)/ })).toBeTruthy();
        expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
        expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            requestId: "request-1",
            reason: "Inspect output"
        });
    });

    it("shows Skip only for a visible current attempt and posts the fixed skip payload", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("running", 2, true))))
            .mockResolvedValueOnce(
                jsonResponse(success({ revokedAttemptId: "attempt-1", action: "skip" }, 3))
            )
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("running", 3))));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        expect(screen.getByLabelText("Skip current speaker")).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Skip reason"), {
            target: { value: "Move on" }
        });
        fireEvent.click(screen.getByLabelText("Skip current speaker"));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
        expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/convivium/meetings/meeting%2F1/reassign");
        expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: 2,
            currentAttemptId: "attempt-1",
            action: "skip",
            reason: "Move on",
            requestId: "request-1"
        });
        expect(
            JSON.stringify(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)))
        ).not.toContain("replacementParticipantId");
    });

    it("limits End outcomes and posts the fixed empty completion fields", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("converging", 2))))
            .mockResolvedValueOnce(
                jsonResponse(
                    success({ status: "no_consensus", terminationCode: "no_consensus" }, 3)
                )
            )
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(terminalStatusResult()));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        expect(screen.queryByRole("option", { name: "Completed" })).toBeNull();
        fireEvent.change(screen.getByLabelText("End outcome"), {
            target: { value: "no_consensus" }
        });
        fireEvent.change(screen.getByLabelText("End reason"), {
            target: { value: "No consensus reached" }
        });
        fireEvent.click(screen.getByLabelText("End meeting"));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
        expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/convivium/meetings/meeting%2F1/end");
        expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
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

    it("refetches after a validated protocol error without retrying the POST", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockResolvedValueOnce(jsonResponse(protocolError("Safe conflict"), 409))
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("running", 3), 3)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Reason" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
        expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("3")
        );
        expect(screen.queryByText("Safe conflict")).toBeNull();
    });

    it("does not retry a transport-failed write and keeps the projection read-only", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network write"));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        fireEvent.change(screen.getByLabelText("Pause reason"), { target: { value: "Reason" } });
        fireEvent.click(screen.getByLabelText("Pause meeting"));

        await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
        expect(screen.getByLabelText("Meeting summary").textContent).toContain("2");
    });

    it("does not expose controls for a terminal projection", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(terminalStatusResult(), 5)));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        expect(screen.getByLabelText("Meeting summary").textContent).toContain("completed");
        expect(screen.queryByLabelText("Pause meeting")).toBeNull();
        expect(screen.queryByLabelText("Resume meeting")).toBeNull();
        expect(screen.queryByLabelText("Skip current speaker")).toBeNull();
        expect(screen.queryByLabelText("End meeting")).toBeNull();
    });

    it("disables meeting writes when the list projection becomes cached", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network list"));
        vi.stubGlobal("fetch", fetchMock);
        render(createElement(ConviviumMeetingPanel));
        await selectMeeting();

        fireEvent.click(screen.getByLabelText("Reload meetings"));

        await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
        expect(screen.getByLabelText("Pause meeting").hasAttribute("disabled")).toBe(true);
    });

    it("preserves cached data on failures, polls the selection, and aborts on unmount", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult())))
            .mockRejectedValueOnce(new TypeError("network list"))
            .mockRejectedValueOnce(new TypeError("network detail"))
            .mockRejectedValueOnce(new TypeError("network list"))
            .mockResolvedValueOnce(jsonResponse(listResponse()))
            .mockResolvedValueOnce(jsonResponse(success(statusResult("running", 4), 4)));
        vi.stubGlobal("fetch", fetchMock);
        const rendered = render(createElement(ConviviumMeetingPanel));
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

        await act(async () => vi.advanceTimersByTime(5_000));
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("4")
        );
        const lastSignal = fetchMock.mock.calls.at(-1)?.[1]?.signal;
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
