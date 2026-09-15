import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    renderObservabilitySections,
    MeetingStatusResultSchema,
    statusResult,
    factStatus,
    factArchiveStatus
} from "./meeting-panel-fixtures.js";

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
