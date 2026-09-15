import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import {
    type Rpc,
    type MeetingStatusResultV1,
    api,
    useRemoteFixture,
    setRpc,
    ConviviumMeetingPanel,
    mapMeetingPanelView,
    renderObservabilitySections,
    MeetingStatusResultSchema,
    meetingId,
    listItem,
    listResponse,
    statusResult,
    contributionStatus,
    contributionReadResult,
    terminalStatusResult,
    factStatus,
    factTerminalStatus,
    factArchiveStatus,
    success,
    remoteResult,
    factDecisions,
    deferred,
    selectMeeting
} from "./meeting-panel-fixtures.js";

describe("contribution meeting panel", () => {
    useRemoteFixture();

    beforeEach(() => {
        vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "contribution-request") });
    });

    it("renders contribution summaries and exact-version material details", async () => {
        const state = contributionStatus();
        const read = contributionReadResult();
        const rpcMock = vi.fn<Rpc>(async (method) => {
            if (method === "list") return remoteResult(listResponse());
            if (method === "getStatus") return remoteResult(success(state));
            if (method === "readContribution") return remoteResult(success(read));
            throw new Error(`Unexpected method ${method}`);
        });
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();

        const section = screen.getByLabelText("Contributions");
        expect(section.textContent).toContain("participant-one");
        expect(section.textContent).toContain("published");
        expect(section.textContent).toContain("complete");
        fireEvent.click(within(section).getByRole("button", { name: "View contribution" }));
        const material = await screen.findByLabelText("Contribution detail");
        for (const value of [
            "Material",
            "diff content",
            "Source",
            "https://example.test/repository",
            "Claim",
            "Guard exists",
            "Verification",
            "supports: Guard found",
            "Method",
            "Inspection",
            "Limitations",
            "No runtime execution."
        ])
            expect(material.textContent).toContain(value);
        expect((screen.getByLabelText("Draft revision") as HTMLSelectElement).value).toBe("1");
        expect(rpcMock.mock.calls.filter(([method]) => method === "readContribution")).toHaveLength(
            2
        );
        expect(screen.queryByRole("button", { name: "Skip current speaker" })).toBeNull();
    });

    it("lets the user inspect every cited material version", async () => {
        const state = contributionStatus();
        const read = contributionReadResult();
        read.drafts[0]!.citations.push({
            evidenceKey: "evidence-2:3",
            claim: "Second source",
            locator: "section 2",
            inference: "inspection"
        });
        const rpcMock = vi.fn<Rpc>(async (method, options) => {
            if (method === "list") return remoteResult(listResponse());
            if (method === "getStatus") return remoteResult(success(state));
            if (method === "readContribution") {
                const input = options.input as { evidenceKey?: string };
                return remoteResult(
                    success(
                        input.evidenceKey === "evidence-2:3"
                            ? {
                                  ...read,
                                  evidence: {
                                      ...read.evidence,
                                      evidenceId: "evidence-2",
                                      key: "evidence-2:3",
                                      revision: 3,
                                      material: {
                                          kind: "text" as const,
                                          text: "second exact version"
                                      }
                                  }
                              }
                            : read
                    )
                );
            }
            throw new Error(`Unexpected method ${method}`);
        });
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        fireEvent.click(screen.getByRole("button", { name: "View contribution" }));
        await screen.findByLabelText("Contribution detail");
        fireEvent.change(screen.getByLabelText("Evidence version"), {
            target: { value: "evidence-2:3" }
        });
        await waitFor(() =>
            expect(screen.getByLabelText("Contribution detail").textContent).toContain(
                "second exact version"
            )
        );
        expect(
            rpcMock.mock.calls.filter(
                ([method, options]) =>
                    method === "readContribution" &&
                    (options.input as { evidenceKey?: string }).evidenceKey === "evidence-2:3"
            )
        ).toHaveLength(1);
    });

    it("refreshes status before a local contribution retry and requires a reason", async () => {
        const state = contributionStatus("returned");
        const rpcMock = vi.fn<Rpc>(async (method) => {
            if (method === "list") return remoteResult(listResponse());
            if (method === "getStatus") return remoteResult(success(state));
            if (method === "controlContribution")
                return remoteResult(
                    success(
                        {
                            contributionId: "contribution-1",
                            generation: 2,
                            phase: "preparing"
                        },
                        3
                    )
                );
            throw new Error(`Unexpected method ${method}`);
        });
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        fireEvent.click(screen.getByRole("button", { name: "Retry contribution" }));
        const form = screen.getByRole("form", { name: "Contribution control" });
        expect(
            (within(form).getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled
        ).toBe(true);
        fireEvent.change(within(form).getByLabelText("Reason"), { target: { value: "retry" } });
        fireEvent.click(within(form).getByRole("button", { name: "Submit" }));
        await waitFor(() =>
            expect(rpcMock.mock.calls.some(([method]) => method === "controlContribution")).toBe(
                true
            )
        );
        const methods = rpcMock.mock.calls.map(([method]) => method);
        const controlIndex = methods.indexOf("controlContribution");
        expect(methods[controlIndex - 1]).toBe("getStatus");
        const control = rpcMock.mock.calls.find(([method]) => method === "controlContribution")?.[1]
            .input;
        expect(control).toMatchObject({
            expectedMeetingVersion: 2,
            action: "retry",
            contributionId: "contribution-1",
            generation: 1,
            reason: "retry"
        });
    });

    it("aborts and ignores contribution detail from the previously selected meeting", async () => {
        const pending = deferred<RemoteResult<unknown>>();
        const other = { ...listItem, meetingId: "meeting/2", topic: "Second meeting" };
        const rpcMock = vi.fn<Rpc>(async (method, options) => {
            if (method === "list") return remoteResult(listResponse([listItem, other]));
            if (method === "readContribution") return pending.promise;
            const requested = options.input as { meetingId?: string };
            const result =
                requested.meetingId === meetingId
                    ? contributionStatus()
                    : { ...statusResult(), meetingId: other.meetingId, topic: other.topic };
            const envelope = success(result);
            return remoteResult(
                requested.meetingId === meetingId
                    ? envelope
                    : { ...envelope, meetingId: other.meetingId }
            );
        });
        setRpc(rpcMock);
        render(createElement(ConviviumMeetingPanel, { api }));
        await selectMeeting();
        fireEvent.click(screen.getByRole("button", { name: "View contribution" }));
        const firstRead = rpcMock.mock.calls.find(([method]) => method === "readContribution")?.[1]
            .signal;
        if (firstRead === undefined) throw new Error("Contribution read was not called");
        fireEvent.click(screen.getByRole("button", { name: /Second meeting/ }));
        expect(firstRead.aborted).toBe(true);
        await act(async () => pending.resolve(remoteResult(success(contributionReadResult()))));
        await waitFor(() =>
            expect(screen.getByLabelText("Meeting summary").textContent).toContain("Second meeting")
        );
        expect(screen.queryByLabelText("Contribution detail")).toBeNull();
    });
});
afterEach(cleanup);

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
