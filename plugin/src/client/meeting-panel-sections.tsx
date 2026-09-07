import { createElement, type ReactElement } from "react";
import type { MeetingStatusResultV1 } from "../protocol/index.js";
import { mapMeetingPanelView } from "./meeting-panel-view.js";

export interface MeetingFactControls {
    renderCandidateActions(candidateId: string): ReactElement | null;
    renderDecisionActions(decisionId: string): ReactElement | null;
    renderRiskActions(issueId: string): ReactElement | null;
}
export function renderObservabilitySections(
    detail: MeetingStatusResultV1,
    controls?: MeetingFactControls
): ReactElement {
    const view = mapMeetingPanelView(detail);
    const row = (label: string, value: string) =>
        createElement(
            "div",
            { key: label },
            createElement("dt", null, label),
            createElement("dd", null, value)
        );
    return createElement(
        "div",
        null,
        createElement(
            "section",
            { "aria-label": "Meeting summary" },
            createElement("h4", null, "Meeting summary"),
            createElement(
                "dl",
                null,
                row("Topic", detail.topic),
                row("Status", detail.status),
                row("Meeting version", String(detail.meetingVersion)),
                row("Current agenda title", view.agendaTitle),
                row("Current agenda objective", view.agendaObjective)
            )
        ),
        createElement(
            "section",
            { "aria-label": "Current activity" },
            createElement("h4", null, "Current activity"),
            createElement(
                "dl",
                null,
                row("Planned speaker order", view.plannedSpeakerOrder),
                row("Current speaker", view.currentSpeaker),
                row("Turn intent", view.turnIntent),
                row("Turn reason", view.turnReason),
                row("Turn objective", view.turnObjective),
                row("Waiting reason", view.waitingReason),
                row("Waiting participants", view.waitingParticipants)
            )
        ),
        detail.status === "paused"
            ? createElement(
                  "section",
                  { "aria-label": "Pause details" },
                  createElement("h4", null, "Pause details"),
                  createElement(
                      "dl",
                      null,
                      row("Pause reason", view.pauseReason),
                      row("Paused by", view.pausedBy),
                      row("Paused at", view.pausedAt)
                  )
              )
            : null,
        createElement(
            "section",
            { "aria-label": "Meeting limits" },
            createElement("h4", null, "Meeting limits"),
            createElement(
                "dl",
                null,
                row("Maximum turns", String(view.limits.maxTurns)),
                row("Maximum speakers per turn", String(view.limits.maxSpeakersPerTurn)),
                row("Maximum total messages", String(view.limits.maxTotalMessages)),
                row(
                    "Maximum duration (ms)",
                    view.limits.maxDurationMs === undefined
                        ? "None"
                        : String(view.limits.maxDurationMs)
                ),
                row(
                    "Speaker attempt timeout (ms)",
                    view.limits.speakerAttemptTimeoutMs === undefined
                        ? "None"
                        : String(view.limits.speakerAttemptTimeoutMs)
                ),
                row(
                    "Mail handling timeout (ms)",
                    view.limits.mailHandlingTimeoutMs === undefined
                        ? "None"
                        : String(view.limits.mailHandlingTimeoutMs)
                )
            )
        ),
        createElement(
            "section",
            { "aria-label": "Transcript" },
            createElement("h4", null, "Transcript"),
            view.messages.length === 0
                ? createElement("p", null, "No committed messages.")
                : createElement(
                      "ol",
                      null,
                      view.messages.map((message) =>
                          createElement(
                              "li",
                              { key: message.id, "data-message-seq": String(message.seq) },
                              row("Speaker", message.speaker),
                              row("Kind", message.kind),
                              row("Content", message.content),
                              row("Agenda item", message.agendaItemId),
                              ...(message.minutesDraft === undefined
                                  ? []
                                  : [
                                        row("Record type", "Minutes draft (non-authoritative)"),
                                        row(
                                            "Coverage",
                                            `messages ${message.minutesDraft.coverage.fromSeq}–${message.minutesDraft.coverage.throughSeq}`
                                        ),
                                        row(
                                            "Referenced message IDs",
                                            message.minutesDraft.referencedMessageIds.join(", ")
                                        )
                                    ])
                          )
                      )
                  )
        ),
        createElement(
            "section",
            { "aria-label": "Blocking items" },
            createElement("h4", null, "Blocking items"),
            view.blockingFacts.length === 0
                ? createElement("p", null, "No blocking items.")
                : createElement(
                      "ol",
                      null,
                      view.blockingFacts.map((fact) =>
                          createElement(
                              "li",
                              { key: fact.id, "data-blocking-id": fact.id },
                              row("Kind", fact.kind),
                              row("Summary", fact.summary),
                              row("Subject", fact.subjectId)
                          )
                      )
                  )
        ),
        createElement(
            "section",
            { "aria-label": "Meeting tasks" },
            createElement("h4", null, "Meeting tasks"),
            view.meetingTasks.length === 0
                ? createElement("p", null, "No meeting tasks.")
                : createElement(
                      "ol",
                      null,
                      view.meetingTasks.map((task) =>
                          createElement(
                              "li",
                              { key: task.meetingTaskId, "data-task-id": task.meetingTaskId },
                              row("Title", task.title),
                              row("Status", task.status),
                              row("Participant", task.participantId),
                              task.resultSummary === undefined
                                  ? null
                                  : row("Result", task.resultSummary)
                          )
                      )
                  )
        ),
        createElement(
            "section",
            { "aria-label": "Parking Lot" },
            createElement("h4", null, "Parking Lot"),
            createElement("p", null, "All agenda candidates and their current disposition."),
            view.parkingLot.length === 0
                ? createElement("p", null, "No parking lot items.")
                : createElement(
                      "ol",
                      null,
                      view.parkingLot.map((candidate) =>
                          createElement(
                              "li",
                              { key: candidate.id, "data-candidate-id": candidate.id },
                              row("Candidate ID", candidate.id),
                              row("Title", candidate.title),
                              row("Reason", candidate.reason),
                              row("Status", candidate.status)
                          )
                      )
                  )
        ),
        createElement(
            "section",
            { "aria-label": "Accepted decisions" },
            createElement("h4", null, "Accepted decisions"),
            view.acceptedDecisions.length === 0
                ? createElement("p", null, "No accepted decisions.")
                : createElement(
                      "ol",
                      null,
                      view.acceptedDecisions.map((decision) =>
                          createElement(
                              "li",
                              { key: decision.id, "data-decision-id": decision.id },
                              row("Decision ID", decision.id),
                              row("Status", decision.status),
                              row("Proposal ID", decision.proposalId),
                              row("Proposal revision", String(decision.proposalRevision)),
                              decision.statement === undefined
                                  ? null
                                  : row("Statement", decision.statement),
                              decision.rationale === undefined
                                  ? null
                                  : row("Rationale", decision.rationale),
                              decision.dissentingPositionIds === undefined
                                  ? null
                                  : row(
                                        "Dissent IDs",
                                        decision.dissentingPositionIds.join(", ") || "None"
                                    ),
                              controls?.renderDecisionActions(decision.id)
                          )
                      )
                  )
        ),
        createElement(
            "section",
            { "aria-label": "Decision history" },
            createElement("h4", null, "Decision history"),
            createElement(
                "p",
                null,
                "All decisions, including current accepted, superseded and revoked decisions."
            ),
            view.decisionHistory.length === 0
                ? createElement("p", null, "No decision history.")
                : createElement(
                      "ol",
                      null,
                      view.decisionHistory.map((decision) =>
                          createElement(
                              "li",
                              { key: decision.id, "data-decision-id": decision.id },
                              row("Decision ID", decision.id),
                              row("Status", decision.status),
                              row("Proposal ID", decision.proposalId),
                              row("Proposal revision", String(decision.proposalRevision)),
                              decision.statement === undefined
                                  ? null
                                  : row("Statement", decision.statement),
                              decision.rationale === undefined
                                  ? null
                                  : row("Rationale", decision.rationale),
                              decision.acceptedBy === undefined
                                  ? null
                                  : row("Accepted by", decision.acceptedBy.join(", ") || "None"),
                              decision.agendaItemId === undefined
                                  ? null
                                  : row("Agenda item", decision.agendaItemId),
                              decision.dissentingPositionIds === undefined
                                  ? null
                                  : row(
                                        "Dissent IDs",
                                        decision.dissentingPositionIds.join(", ") || "None"
                                    ),
                              decision.supersededByDecisionId === undefined
                                  ? null
                                  : row("Superseded by", decision.supersededByDecisionId)
                          )
                      )
                  )
        ),
        createElement(
            "section",
            { "aria-label": "Pending decisions" },
            createElement("h4", null, "Pending decisions"),
            view.pendingDecisionCandidates.length === 0
                ? createElement("p", null, "No pending decisions.")
                : createElement(
                      "ol",
                      null,
                      view.pendingDecisionCandidates.map((candidate) =>
                          createElement(
                              "li",
                              { key: candidate.id, "data-candidate-id": candidate.id },
                              row("Statement", candidate.statement),
                              row("Rationale", candidate.rationale),
                              controls?.renderCandidateActions(candidate.id)
                          )
                      )
                  )
        ),
        createElement(
            "section",
            { "aria-label": "Risks" },
            createElement("h4", null, "Risks"),
            view.risks.length === 0
                ? createElement("p", null, "No risks.")
                : createElement(
                      "ol",
                      null,
                      view.risks.map((risk) =>
                          createElement(
                              "li",
                              { key: risk.id, "data-risk-id": risk.id },
                              row("Issue ID", risk.id),
                              row("Title", risk.title),
                              row("Description", risk.description),
                              row("Status", risk.status),
                              row("Disposition", risk.disposition),
                              risk.rationale === undefined
                                  ? null
                                  : row("Rationale", risk.rationale),
                              risk.ownerId === undefined ? null : row("Owner", risk.ownerId),
                              row("Related task IDs", risk.relatedTaskIds.join(", ") || "None"),
                              controls?.renderRiskActions(risk.id)
                          )
                      )
                  )
        ),
        view.termination === undefined
            ? null
            : createElement(
                  "section",
                  { "aria-label": "Termination" },
                  createElement("h4", null, "Termination"),
                  createElement(
                      "dl",
                      null,
                      row("Code", view.termination.code),
                      row("Reason", view.termination.reason),
                      row("Decision IDs", view.termination.decisionIds.join(", ") || "None")
                  )
              )
    );
}
