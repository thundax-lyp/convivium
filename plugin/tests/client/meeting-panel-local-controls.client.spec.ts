import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import {
    type Rpc,
    type MeetingStatusResultV1,
    api,
    useRemoteFixture,
    setRpc,
    isWrite,
    ConviviumMeetingPanel,
    meetingId,
    listResponse,
    statusResult,
    factTerminalStatus,
    factArchiveStatus,
    success,
    remoteResult,
    deferred,
    selectMeeting
} from "./meeting-panel-fixtures.js";

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
describe("local decision risk panel controls", () => {
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
