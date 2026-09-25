import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MeetingUserControls } from "@/client/meeting-user-controls.js";
import { meetingProjectionFixture } from "./meeting-panel-fixtures.js";

afterEach(cleanup);
it("submits a structured agenda activation with the current version", async () => {
    const { view } = meetingProjectionFixture();
    view.controls = ["activate_agenda"];
    view.agenda.push({
        id: "next",
        title: "next",
        question: "next",
        requiredOutputIds: [],
        status: "pending"
    });
    const client = {
        control: vi.fn(async () => ({ kind: "accepted", meetingId: view.meetingId })),
        list: vi.fn(async () => ({ meetings: [] })),
        read: vi.fn(async () => view)
    };
    render(
        <MeetingUserControls
            client={client as never}
            view={view}
            disabled={false}
            onCommitted={() => {}}
        />
    );
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "activate_agenda" } });
    fireEvent.change(screen.getByLabelText("Agenda"), { target: { value: "next" } });
    fireEvent.change(screen.getByLabelText("Previous agenda disposition"), {
        target: { value: "completed" }
    });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "next work" } });
    fireEvent.submit(screen.getByTestId("meeting-user-controls"));
    await waitFor(() => expect(client.control).toHaveBeenCalledOnce());
    expect(client.control).toHaveBeenCalledWith(
        expect.objectContaining({
            expectedMeetingVersion: view.version,
            action: {
                kind: "activate_agenda",
                agendaId: "next",
                previousDisposition: "completed",
                reason: "next work"
            }
        })
    );
});

import { MeetingCreateForm } from "@/client/meeting-create-form.js";
const formFixture = (kind: string) => {
    const { view } = meetingProjectionFixture();
    Object.assign(view, {
        controls: [kind],
        agendaCandidates: [{ id: "c", title: "candidate", status: "pending" }],
        questions: [{ id: "q", text: "question", status: "open" }],
        issues: [{ id: "i", description: "risk", status: "open" }],
        rounds: [{ id: "r", status: "open", roundGoal: { question: "round" } }],
        publications: [{ finalVersionIds: ["v"] }],
        objective: {
            ...view.objective,
            requiredOutputs: [{ id: "o", text: "output" }],
            acceptanceCriteria: []
        },
        outcomes: {
            ...view.outcomes,
            pendingDecisionCandidates: [{ id: "c", rationale: "candidate" }],
            decisions: [{ id: "d", status: "accepted", rationale: "decision" }],
            completionFacts: [{ id: "f", status: "active", statement: "done" }]
        }
    });
    const client = {
        control: vi.fn(async () => ({ kind: "accepted", meetingId: view.meetingId })),
        list: vi.fn(async () => ({ meetings: [] })),
        read: vi.fn(async () => view)
    };
    return { view, client };
};
const fill = (
    name: string,
    value: string | string[],
    form = screen.getByTestId("meeting-user-controls")
) => {
    const element = form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;
    if (Array.isArray(value)) {
        for (const option of (element as HTMLSelectElement).options)
            option.selected = value.includes(option.value);
        fireEvent.change(element);
    } else fireEvent.change(element, { target: { value } });
};
const scenarios = [
    { kind: "dispose_agenda_candidate", candidateId: "c", disposition: "parked", reason: "later" },
    {
        kind: "resolve_question",
        questionId: "q",
        status: "answered",
        rationale: "answer",
        evidenceIds: ["v"]
    },
    {
        kind: "dispose_issue",
        issueId: "i",
        status: "resolved",
        rationale: "resolved",
        evidenceIds: ["v"]
    },
    { kind: "abort_round", roundId: "r", reason: "stop" },
    { kind: "decide", candidateId: "c" },
    {
        kind: "change_decision",
        decisionId: "d",
        status: "revoked",
        rationale: "revoke",
        evidenceIds: ["v"]
    },
    {
        kind: "dispose_risk",
        issueId: "i",
        action: "reject",
        scope: "scope",
        rationale: "reject",
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
    { kind: "change_completion_fact", factId: "f", status: "revoked", rationale: "revoke" }
];
it.each(scenarios)("submits the complete $kind payload", async (action) => {
    const { client, view } = formFixture(action.kind);
    render(
        <MeetingUserControls
            client={client as never}
            view={view}
            disabled={false}
            onCommitted={() => {}}
        />
    );
    fill("action", action.kind);
    for (const [key, value] of Object.entries(action))
        if (key !== "kind") fill(key === "action" ? "riskAction" : key, value);
    fireEvent.submit(screen.getByTestId("meeting-user-controls"));
    await waitFor(() => expect(client.control).toHaveBeenCalledOnce());
    expect(client.control.mock.calls[0][0].action).toEqual(action);
});
it("retains uncertain commands for explicit retry and prevents duplicate in-flight submits", async () => {
    const { client, view } = formFixture("abort_round");
    let reject: (error: Error) => void = () => {};
    client.control.mockImplementationOnce(
        () =>
            new Promise((_, fail) => {
                reject = fail;
            })
    );
    let sequence = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => `request-${++sequence}` as never);
    render(
        <MeetingUserControls
            client={client as never}
            view={view}
            disabled={false}
            onCommitted={() => {}}
        />
    );
    fill("action", "abort_round");
    fill("roundId", "r");
    fill("reason", "stop");
    const form = screen.getByTestId("meeting-user-controls");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(client.control).toHaveBeenCalledOnce();
    reject(new Error("network"));
    fireEvent.click(await screen.findByRole("button", { name: "Retry this submission" }));
    await waitFor(() => expect(client.control).toHaveBeenCalledTimes(2));
    expect(client.control.mock.calls[0][0]).toEqual(client.control.mock.calls[1][0]);
    await screen.findByText("Committed.");
    fill("reason", "changed");
    fireEvent.submit(form);
    await waitFor(() => expect(client.control).toHaveBeenCalledTimes(3));
    expect(client.control.mock.calls[2][0].requestId).not.toBe(
        client.control.mock.calls[0][0].requestId
    );
    vi.restoreAllMocks();
});
it("rereads version conflicts without resubmitting and disables disconnected writes", async () => {
    const { client, view } = formFixture("decide");
    client.control.mockResolvedValue({
        kind: "rejected",
        error: { code: "VERSION_CONFLICT" }
    } as never);
    const committed = vi.fn();
    const rendered = render(
        <MeetingUserControls
            client={client as never}
            view={view}
            disabled={false}
            onCommitted={committed}
        />
    );
    fill("action", "decide");
    fill("candidateId", "c");
    fireEvent.submit(screen.getByTestId("meeting-user-controls"));
    await waitFor(() => expect(client.read).toHaveBeenCalledOnce());
    expect(client.control).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Version changed/)).toBeTruthy();
    rendered.rerender(
        <MeetingUserControls
            client={client as never}
            view={view}
            disabled
            onCommitted={committed}
        />
    );
    fireEvent.submit(screen.getByTestId("meeting-user-controls"));
    expect(client.control).toHaveBeenCalledOnce();
});
it("requires conditional promoted and replacement fields", async () => {
    const { client, view } = formFixture("dispose_agenda_candidate");
    render(
        <MeetingUserControls
            client={client as never}
            view={view}
            disabled={false}
            onCommitted={() => {}}
        />
    );
    fill("action", "dispose_agenda_candidate");
    fill("candidateId", "c");
    fill("disposition", "promoted");
    fill("reason", "promote");
    fireEvent.submit(screen.getByTestId("meeting-user-controls"));
    expect(client.control).not.toHaveBeenCalled();
    fill("promoted.id", "new");
    fill("promoted.title", "next");
    fill("promoted.question", "question");
    fireEvent.submit(screen.getByTestId("meeting-user-controls"));
    await waitFor(() => expect(client.control).toHaveBeenCalledOnce());
    expect(client.control.mock.calls[0][0].action.promotedAgenda).toEqual({
        id: "new",
        title: "next",
        question: "question",
        requiredOutputIds: []
    });
});
it("creates seven explicitly named identities and rejects missing fields or duplicate keys", async () => {
    const { client, view } = formFixture("decide");
    const created = vi.fn();
    render(<MeetingCreateForm client={client as never} disabled={false} onCreated={created} />);
    const form = screen.getByTestId("meeting-create-form");
    fireEvent.submit(form);
    expect(client.control).not.toHaveBeenCalled();
    fill("objective", "evidence goal", form);
    fill("acceptableRiskLevel", "low", form);
    for (let i = 0; i < 7; i++) fill(`identity.${i}.displayName`, `Role ${i}`, form);
    fill("agenda.0.id", "a", form);
    fill("agenda.0.title", "agenda", form);
    fill("agenda.0.question", "question", form);
    fill("initialActiveAgendaId", "a", form);
    for (const name of ["maxFormalMessages", "maxDurationMs", "taskDeadlineMs", "reviewDeadlineMs"])
        fill(name, "1000", form);
    fill("identity.1.identityKey", "meeting_manager", form);
    fireEvent.submit(form);
    expect(client.control).not.toHaveBeenCalled();
    fill("identity.1.identityKey", "domain_architect", form);
    fireEvent.submit(form);
    await waitFor(() => expect(client.control).toHaveBeenCalledOnce());
    const command = client.control.mock.calls[0][0];
    expect(command).toMatchObject({
        meetingId: "new",
        expectedMeetingVersion: 0,
        action: {
            kind: "create_meeting",
            managerIdentityKey: "meeting_manager",
            evidenceReviewerIdentityKey: "verification_reviewer",
            initialActiveAgendaId: "a"
        }
    });
    expect(command.action.identities).toHaveLength(7);
    expect(command.action.identities.every((i) => i.definitionVersion === "2.0.0")).toBe(true);
    await waitFor(() => expect(created).toHaveBeenCalledWith(view.meetingId));
});

it.each(["change_decision", "change_completion_fact"])(
    "requires and serializes the %s replacement",
    async (kind) => {
        const { client, view } = formFixture(kind);
        render(
            <MeetingUserControls
                client={client as never}
                view={view}
                disabled={false}
                onCommitted={() => {}}
            />
        );
        fill("action", kind);
        fill(
            kind === "change_decision" ? "decisionId" : "factId",
            kind === "change_decision" ? "d" : "f"
        );
        fill("status", "superseded");
        fill("rationale", "replace");
        if (kind === "change_decision") fill("evidenceIds", ["v"]);
        fireEvent.submit(screen.getByTestId("meeting-user-controls"));
        expect(client.control).not.toHaveBeenCalled();
        if (kind === "change_decision") fill("replacementCandidateId", "c");
        else {
            fill("replacement.outputId", "o");
            fill("replacement.statement", "new fact");
            fill("replacement.rationale", "new basis");
            fill("replacement.evidenceIds", ["v"]);
            fill("replacement.decisionIds", ["d"]);
        }
        fireEvent.submit(screen.getByTestId("meeting-user-controls"));
        await waitFor(() => expect(client.control).toHaveBeenCalledOnce());
        expect(client.control.mock.calls[0][0].action).toMatchObject(
            kind === "change_decision"
                ? { replacementCandidateId: "c" }
                : {
                      replacement: {
                          outputId: "o",
                          statement: "new fact",
                          rationale: "new basis",
                          evidenceIds: ["v"],
                          decisionIds: ["d"]
                      }
                  }
        );
        expect(JSON.stringify(client.control.mock.calls[0][0])).not.toMatch(
            /actor|Session|replacementDecisionId/
        );
    }
);
