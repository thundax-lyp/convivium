import * as React from "react";
import { useState, type ReactElement } from "react";
import { MeetingCommandSchema, type MeetingView } from "@/protocol/index.js";
import { useMeetingSubmission, type MeetingClient } from "./meeting-client.js";
import type { MeetingTranslate } from "./locales.js";
import {
    MeetingField,
    SubmissionFeedback,
    formText,
    formValue,
    formValues
} from "./meeting-create-form.js";

const kinds = [
    "activate_agenda",
    "dispose_agenda_candidate",
    "resolve_question",
    "dispose_issue",
    "abort_round",
    "decide",
    "change_decision",
    "dispose_risk",
    "record_completion_fact",
    "change_completion_fact"
] as const;
const completion = (data: FormData, prefix = "") => ({
    outputId: formValue(data, `${prefix}outputId`),
    ...(formValue(data, `${prefix}criterionId`)
        ? { criterionId: formValue(data, `${prefix}criterionId`) }
        : {}),
    statement: formValue(data, `${prefix}statement`),
    rationale: formValue(data, `${prefix}rationale`),
    evidenceIds: formValues(data, `${prefix}evidenceIds`),
    decisionIds: formValues(data, `${prefix}decisionIds`)
});
const actionFrom = (kind: string, data: FormData) => {
    const value = (name: string) => formValue(data, name);
    const evidenceIds = formValues(data, "evidenceIds");
    switch (kind) {
        case "activate_agenda":
            return {
                kind,
                agendaId: value("agendaId"),
                previousDisposition: value("previousDisposition"),
                reason: value("reason")
            };
        case "dispose_agenda_candidate":
            return {
                kind,
                candidateId: value("candidateId"),
                disposition: value("disposition"),
                reason: value("reason"),
                ...(value("disposition") === "promoted"
                    ? {
                          promotedAgenda: {
                              id: value("promoted.id"),
                              title: value("promoted.title"),
                              question: value("promoted.question"),
                              requiredOutputIds: formValues(data, "promoted.requiredOutputIds"),
                              ...(value("promoted.ownerId")
                                  ? { ownerId: value("promoted.ownerId") }
                                  : {})
                          }
                      }
                    : {})
            };
        case "resolve_question":
            return {
                kind,
                questionId: value("questionId"),
                status: value("status"),
                rationale: value("rationale"),
                evidenceIds
            };
        case "dispose_issue":
            return {
                kind,
                issueId: value("issueId"),
                status: value("status"),
                rationale: value("rationale"),
                evidenceIds
            };
        case "abort_round":
            return { kind, roundId: value("roundId"), reason: value("reason") };
        case "decide":
            return { kind, candidateId: value("candidateId") };
        case "change_decision":
            return {
                kind,
                decisionId: value("decisionId"),
                status: value("status"),
                rationale: value("rationale"),
                evidenceIds,
                ...(value("status") === "superseded"
                    ? { replacementCandidateId: value("replacementCandidateId") }
                    : {})
            };
        case "dispose_risk":
            return {
                kind,
                issueId: value("issueId"),
                action: value("riskAction"),
                scope: value("scope"),
                rationale: value("rationale"),
                evidenceIds
            };
        case "record_completion_fact":
            return { kind, ...completion(data) };
        case "change_completion_fact":
            return {
                kind,
                factId: value("factId"),
                status: value("status"),
                rationale: value("rationale"),
                ...(value("status") === "superseded"
                    ? { replacement: completion(data, "replacement.") }
                    : {})
            };
        default:
            return undefined;
    }
};

export const MeetingUserControls = ({
    client,
    view,
    disabled,
    onCommitted,
    t
}: {
    client: MeetingClient;
    view: MeetingView;
    disabled: boolean;
    onCommitted: () => void;
    t?: MeetingTranslate;
}): ReactElement => {
    const [kind, setKind] = useState("");
    const [branch, setBranch] = useState("");
    const submission = useMeetingSubmission(client, disabled, onCommitted);
    const choices = kinds.filter((item) => view.controls.includes(item));
    const evidence = [...new Set(view.publications.flatMap((item) => item.finalVersionIds))];
    const candidates = (view.outcomes.pendingDecisionCandidates ?? []).map((item) => ({
        id: item.id,
        text: item.rationale
    }));
    const decisions = view.outcomes.decisions
        .filter((item) => item.status === "accepted")
        .map((item) => ({ id: item.id, text: item.rationale }));
    const field = (
        name: string,
        options?: readonly (string | { id: string; text: string })[],
        multiple = false,
        required = true
    ) => (
        <MeetingField
            name={name}
            options={options}
            multiple={multiple}
            required={required}
            type={
                ["reason", "rationale", "statement", "scope"].includes(name.split(".").at(-1)!)
                    ? "textarea"
                    : "text"
            }
            t={t}
        />
    );
    const completionFields = (prefix = "") => (
        <>
            {field(`${prefix}outputId`, view.objective.requiredOutputs)}
            {field(`${prefix}criterionId`, view.objective.acceptanceCriteria, false, false)}
            {field(`${prefix}statement`)}
            {field(`${prefix}rationale`)}
            {field(`${prefix}evidenceIds`, evidence, true)}
            {field(`${prefix}decisionIds`, decisions, true)}
        </>
    );
    return (
        <form
            data-testid="meeting-user-controls"
            onChange={(event) => {
                submission.edit();
                const data = new FormData(event.currentTarget);
                setBranch(formValue(data, "disposition") || formValue(data, "status"));
            }}
            onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const parsed = MeetingCommandSchema.safeParse({
                    protocolVersion: 1,
                    meetingId: view.meetingId,
                    expectedMeetingVersion: view.version,
                    requestId: "validation",
                    action: actionFrom(kind, data)
                });
                if (
                    !event.currentTarget.checkValidity() ||
                    !parsed.success ||
                    !choices.includes(kind as (typeof kinds)[number])
                ) {
                    submission.invalid();
                    return;
                }
                void submission.submit(view.meetingId, view.version, parsed.data.action);
            }}
        >
            <fieldset disabled={disabled || submission.pending}>
                <legend>{formText("controls", t)}</legend>
                <label>
                    {formText("action", t)}
                    <select
                        name="action"
                        value={kind}
                        onChange={(event) => {
                            setKind(event.target.value);
                            setBranch("");
                        }}
                        required
                    >
                        <option value="">—</option>
                        {choices.map((item) => (
                            <option key={item} value={item}>
                                {formText(item, t)}
                            </option>
                        ))}
                    </select>
                </label>
                <div key={kind}>
                    {kind === "activate_agenda" && (
                        <>
                            {field(
                                "agendaId",
                                view.agenda
                                    .filter((item) => item.status === "pending")
                                    .map((item) => ({ id: item.id, text: item.title }))
                            )}
                            {field("previousDisposition", ["completed", "deferred", "closed"])}
                            {field("reason")}
                        </>
                    )}
                    {kind === "dispose_agenda_candidate" && (
                        <>
                            {field(
                                "candidateId",
                                view.agendaCandidates
                                    .filter((item) => item.status === "pending")
                                    .map((item) => ({ id: item.id, text: item.title }))
                            )}
                            {field("disposition", ["promoted", "parked", "rejected"])}
                            {field("reason")}
                            {branch === "promoted" && (
                                <fieldset>
                                    <legend>{formText("promotedAgenda", t)}</legend>
                                    {field("promoted.id")}
                                    {field("promoted.title")}
                                    {field("promoted.question")}
                                    {field(
                                        "promoted.requiredOutputIds",
                                        view.objective.requiredOutputs,
                                        true,
                                        false
                                    )}
                                    {field(
                                        "promoted.ownerId",
                                        view.identities.map((item) => ({
                                            id: item.id,
                                            text: item.displayName
                                        })),
                                        false,
                                        false
                                    )}
                                </fieldset>
                            )}
                        </>
                    )}
                    {kind === "resolve_question" && (
                        <>
                            {field(
                                "questionId",
                                view.questions
                                    .filter((item) => ["open", "deferred"].includes(item.status))
                                    .map((item) => ({ id: item.id, text: item.text }))
                            )}
                            {field("status", ["answered", "withdrawn", "deferred"])}
                            {field("rationale")}
                            {field("evidenceIds", evidence, true, false)}
                        </>
                    )}
                    {kind === "dispose_issue" && (
                        <>
                            {field(
                                "issueId",
                                view.issues
                                    .filter((item) => ["open", "deferred"].includes(item.status))
                                    .map((item) => ({ id: item.id, text: item.description }))
                            )}
                            {field("status", ["resolved", "deferred", "out_of_scope"])}
                            {field("rationale")}
                            {field("evidenceIds", evidence, true, false)}
                        </>
                    )}
                    {kind === "abort_round" && (
                        <>
                            {field(
                                "roundId",
                                view.rounds
                                    .filter((item) => item.status === "open")
                                    .map((item) => ({ id: item.id, text: item.roundGoal.question }))
                            )}
                            {field("reason")}
                        </>
                    )}
                    {kind === "decide" && field("candidateId", candidates)}
                    {kind === "change_decision" && (
                        <>
                            {field("decisionId", decisions)}
                            {field("status", ["superseded", "revoked"])}
                            {field("rationale")}
                            {field("evidenceIds", evidence, true)}
                            {branch === "superseded" && field("replacementCandidateId", candidates)}
                        </>
                    )}
                    {kind === "dispose_risk" && (
                        <>
                            {field(
                                "issueId",
                                view.issues
                                    .filter((item) => item.status === "open")
                                    .map((item) => ({ id: item.id, text: item.description }))
                            )}
                            {field("riskAction", ["accept", "reject"])}
                            {field("scope")}
                            {field("rationale")}
                            {field("evidenceIds", evidence, true)}
                        </>
                    )}
                    {kind === "record_completion_fact" && completionFields()}
                    {kind === "change_completion_fact" && (
                        <>
                            {field(
                                "factId",
                                view.outcomes.completionFacts
                                    .filter((item) => item.status === "active")
                                    .map((item) => ({ id: item.id, text: item.statement }))
                            )}
                            {field("status", ["superseded", "revoked"])}
                            {field("rationale")}
                            {branch === "superseded" && (
                                <fieldset>
                                    <legend>{formText("replacement", t)}</legend>
                                    {completionFields("replacement.")}
                                </fieldset>
                            )}
                        </>
                    )}
                </div>
                <button
                    type="submit"
                    disabled={!kind || !choices.includes(kind as (typeof kinds)[number])}
                >
                    {formText("submit", t)}
                </button>
            </fieldset>
            <SubmissionFeedback submission={submission} disabled={disabled} t={t} />
        </form>
    );
};
