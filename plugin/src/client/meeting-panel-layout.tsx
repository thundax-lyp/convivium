import {
    createElement,
    type ChangeEvent,
    type Dispatch,
    type FormEvent,
    type KeyboardEvent,
    type ReactElement,
    type SetStateAction
} from "react";
import type {
    ContributionSummaryV1,
    LocalMeetingListItemV1,
    MeetingStatusResultV1,
    ProtocolErrorV1,
    ReadContributionResultV1
} from "@/protocol/index.js";
import { renderContributionDetail, renderObservabilitySections } from "./meeting-panel-sections.js";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";

export const END_OUTCOMES = [
    { value: "partial", label: "Partial" },
    { value: "no_consensus", label: "No consensus" },
    { value: "cancelled", label: "Cancelled" }
] as const;
export type EndOutcome = (typeof END_OUTCOMES)[number]["value"];
export type FactControlAction =
    "accept-decision" | "supersede-decision" | "revoke-decision" | "accept-risk" | "reject-risk";
export interface FactControlDraft {
    action: FactControlAction;
    targetId: string;
    reason: string;
    evidenceMessageIds: readonly string[];
    replacementCandidateId?: string;
}
export type ContributionControlAction = "retry" | "cancel" | "notify_manager";
export interface ContributionControlDraft {
    readonly action: ContributionControlAction;
    readonly contributionId?: string;
    reason: string;
}

interface LayoutProps {
    meetings: readonly LocalMeetingListItemV1[];
    selectedId?: string;
    detail?: MeetingStatusResultV1;
    listCached: boolean;
    detailCached: boolean;
    writePending: boolean;
    listError?: string;
    detailError?: string;
    factError?: ProtocolErrorV1;
    draft?: FactControlDraft;
    validDraft: boolean;
    factWritable: boolean;
    contributionDetail?: ReadContributionResultV1;
    contributionRevision?: number;
    contributionDraft?: ContributionControlDraft;
    contributionError?: string;
    pauseReason: string;
    endReason: string;
    endOutcome: EndOutcome;
    requestRefresh(): void;
    selectMeeting(meetingId: string): void;
    controlMeeting(action: "pause" | "resume" | "end"): Promise<void>;
    loadContribution(
        meetingId: string,
        task: ContributionSummaryV1,
        draftRevision?: number,
        selectedEvidenceKey?: string
    ): Promise<void>;
    submitContributionControl(): Promise<void>;
    submitFactControl(): Promise<void>;
    openFactControl(action: FactControlAction, targetId: string): void;
    setDraft: Dispatch<SetStateAction<FactControlDraft | undefined>>;
    setContributionDraft: Dispatch<SetStateAction<ContributionControlDraft | undefined>>;
    setPauseReason: Dispatch<SetStateAction<string>>;
    setEndReason: Dispatch<SetStateAction<string>>;
    setEndOutcome: Dispatch<SetStateAction<EndOutcome>>;
    writeActive(): boolean;
}

function renderFactForm(ctx: LayoutProps): ReactElement | null {
    const {
        draft,
        detail,
        listCached,
        detailCached,
        writePending,
        validDraft,
        submitFactControl,
        setDraft
    } = ctx;
    const discussion = detail && "pendingDecisionCandidates" in detail ? detail : undefined;

    if (!draft || !discussion) return null;
    return createElement(
        "form",
        {
            "aria-label": "Decision and risk control",
            onSubmit: (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void submitFactControl();
            }
        },
        createElement(
            "fieldset",
            { disabled: listCached || detailCached || writePending },
            createElement(
                "label",
                null,
                "Reason",
                createElement("textarea", {
                    value: draft.reason,
                    onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
                        setDraft({ ...draft, reason: event.currentTarget.value })
                })
            ),
            draft.action === "supersede-decision"
                ? createElement(
                      "label",
                      null,
                      "Replacement decision",
                      createElement(
                          "select",
                          {
                              value: draft.replacementCandidateId,
                              onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                                  const replacementCandidateId = event.currentTarget.value;
                                  const sourceId = discussion.pendingDecisionCandidates.find(
                                      (item) => item.id === replacementCandidateId
                                  )?.sourceMessageId;
                                  setDraft({
                                      ...draft,
                                      replacementCandidateId,
                                      evidenceMessageIds:
                                          sourceId &&
                                          discussion.messages.some(
                                              (message) => message.id === sourceId
                                          )
                                              ? [sourceId]
                                              : []
                                  });
                              }
                          },
                          createElement("option", { value: "" }, "Select a candidate"),
                          discussion.pendingDecisionCandidates.map((item) =>
                              createElement(
                                  "option",
                                  { key: item.id, value: item.id },
                                  item.statement
                              )
                          )
                      )
                  )
                : null,
            createElement(
                "fieldset",
                { "aria-label": "Evidence messages" },
                createElement("legend", null, "Evidence messages"),
                discussion.messages.map((message) =>
                    createElement(
                        "label",
                        { key: message.id },
                        createElement("input", {
                            type: "checkbox",
                            value: message.id,
                            checked: draft.evidenceMessageIds.includes(message.id),
                            onChange: (event: ChangeEvent<HTMLInputElement>) =>
                                setDraft({
                                    ...draft,
                                    evidenceMessageIds: event.currentTarget.checked
                                        ? [...draft.evidenceMessageIds, message.id]
                                        : draft.evidenceMessageIds.filter((id) => id !== message.id)
                                })
                        }),
                        message.content
                    )
                )
            ),
            createElement(
                "p",
                { "aria-label": "Selected evidence" },
                discussion.messages
                    .filter((message) => draft.evidenceMessageIds.includes(message.id))
                    .map((message) => message.content)
                    .join("; ") || "No evidence selected"
            ),
            createElement(
                Button,
                { type: "submit", variant: "primary", size: "sm", disabled: !validDraft },
                "Submit"
            ),
            createElement(
                Button,
                {
                    type: "button",
                    variant: "outline",
                    size: "sm",
                    onClick: () => setDraft(undefined)
                },
                "Cancel"
            )
        )
    );
}

function renderActions(
    ctx: LayoutProps,
    id: string,
    actions: Array<[FactControlAction, string]>,
    disabled = false
): ReactElement | null {
    const { factWritable, listCached, detailCached, writePending, openFactControl, draft } = ctx;

    if (!factWritable) return null;
    return createElement(
        "div",
        null,
        actions.map(([action, label]) =>
            createElement(
                Button,
                {
                    key: action,
                    type: "button",
                    variant: "outline",
                    size: "sm",
                    disabled: disabled || listCached || detailCached || writePending,
                    onClick: () => openFactControl(action, id)
                },
                label
            )
        ),
        draft?.targetId === id && actions.some(([action]) => action === draft.action)
            ? renderFactForm(ctx)
            : null
    );
}

function renderContributionControlForm(ctx: LayoutProps): ReactElement | null {
    const {
        contributionDraft,
        submitContributionControl,
        setContributionDraft,
        listCached,
        detailCached,
        writePending
    } = ctx;

    if (contributionDraft === undefined) return null;
    return createElement(
        "form",
        {
            "aria-label": "Contribution control",
            onSubmit: (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void submitContributionControl();
            }
        },
        createElement(
            "label",
            null,
            "Reason",
            createElement(Input, {
                value: contributionDraft.reason,
                onChange: (event: ChangeEvent<HTMLInputElement>) =>
                    setContributionDraft({
                        ...contributionDraft,
                        reason: event.currentTarget.value
                    })
            })
        ),
        createElement(
            Button,
            {
                type: "submit",
                variant: "primary",
                size: "sm",
                disabled:
                    listCached ||
                    detailCached ||
                    writePending ||
                    contributionDraft.reason.trim() === ""
            },
            "Submit"
        ),
        createElement(
            Button,
            {
                type: "button",
                variant: "outline",
                size: "sm",
                onClick: () => setContributionDraft(undefined)
            },
            "Cancel"
        )
    );
}

function renderContributionActions(ctx: LayoutProps, contributionId: string): ReactElement | null {
    const {
        detail,
        selectedId,
        listCached,
        detailCached,
        writePending,
        loadContribution,
        setContributionDraft,
        contributionDraft
    } = ctx;

    const task = detail?.contributions?.tasks.find((candidate) => candidate.id === contributionId);
    if (task === undefined || selectedId === undefined) return null;
    const retryable =
        ["returned", "captain_action", "cancelled"].includes(task.phase) ||
        (task.phase === "published" && task.reviewStatus === "captain_action");
    const cancellable = !["published", "cancelled"].includes(task.phase);
    const disabled = listCached || detailCached || writePending;
    return createElement(
        "div",
        null,
        createElement(
            Button,
            {
                type: "button",
                variant: "outline",
                size: "sm",
                disabled,
                onClick: () => void loadContribution(selectedId, task)
            },
            "View contribution"
        ),
        retryable
            ? createElement(
                  Button,
                  {
                      type: "button",
                      variant: "outline",
                      size: "sm",
                      disabled,
                      onClick: () =>
                          setContributionDraft({ action: "retry", contributionId, reason: "" })
                  },
                  "Retry contribution"
              )
            : null,
        cancellable
            ? createElement(
                  Button,
                  {
                      type: "button",
                      variant: "outline",
                      size: "sm",
                      disabled,
                      onClick: () =>
                          setContributionDraft({
                              action: "cancel",
                              contributionId,
                              reason: ""
                          })
                  },
                  "Cancel contribution"
              )
            : null,
        contributionDraft?.contributionId === contributionId
            ? renderContributionControlForm(ctx)
            : null
    );
}

function renderContributionFooter(ctx: LayoutProps): ReactElement | null {
    const {
        detail,
        listCached,
        detailCached,
        writePending,
        setContributionDraft,
        contributionDraft,
        contributionError,
        contributionDetail,
        contributionRevision,
        selectedId,
        loadContribution
    } = ctx;

    if (detail?.contributions === undefined) return null;
    const disabled = listCached || detailCached || writePending;
    return createElement(
        "div",
        null,
        ["running", "waiting"].includes(detail.status)
            ? createElement(
                  Button,
                  {
                      type: "button",
                      variant: "outline",
                      size: "sm",
                      disabled,
                      onClick: () => setContributionDraft({ action: "notify_manager", reason: "" })
                  },
                  "Notify Manager"
              )
            : null,
        contributionDraft?.action === "notify_manager" ? renderContributionControlForm(ctx) : null,
        contributionError === undefined
            ? null
            : createElement("p", { role: "alert" }, contributionError),
        contributionDetail === undefined
            ? null
            : createElement(
                  "div",
                  null,
                  contributionDetail.task.currentDraftRevision > 0
                      ? createElement(
                            "label",
                            null,
                            "Draft revision",
                            createElement(
                                "select",
                                {
                                    value: contributionRevision,
                                    onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                                        const revision = Number(event.currentTarget.value);
                                        if (selectedId !== undefined)
                                            void loadContribution(
                                                selectedId,
                                                contributionDetail.task,
                                                revision
                                            );
                                    }
                                },
                                Array.from(
                                    { length: contributionDetail.task.currentDraftRevision },
                                    (_, index) => index + 1
                                ).map((revision) =>
                                    createElement(
                                        "option",
                                        { key: revision, value: revision },
                                        String(revision)
                                    )
                                )
                            )
                        )
                      : null,
                  (contributionDetail.drafts[0]?.citations.length ?? 0) > 0
                      ? createElement(
                            "label",
                            null,
                            "Evidence version",
                            createElement(
                                "select",
                                {
                                    value:
                                        contributionDetail.evidence?.key ??
                                        contributionDetail.drafts[0]!.citations[0]!.evidenceKey,
                                    onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                                        if (selectedId !== undefined)
                                            void loadContribution(
                                                selectedId,
                                                contributionDetail.task,
                                                contributionRevision,
                                                event.currentTarget.value
                                            );
                                    }
                                },
                                contributionDetail.drafts[0]!.citations.map((citation) =>
                                    createElement(
                                        "option",
                                        {
                                            key: citation.evidenceKey,
                                            value: citation.evidenceKey
                                        },
                                        citation.evidenceKey
                                    )
                                )
                            )
                        )
                      : null,
                  renderContributionDetail(contributionDetail)
              )
    );
}
export function renderMeetingPanelLayout(ctx: LayoutProps): ReactElement {
    const {
        meetings,
        selectedId,
        detail,
        listCached,
        detailCached,
        writePending,
        listError,
        detailError,
        factError,
        pauseReason,
        endReason,
        endOutcome,
        requestRefresh,
        selectMeeting,
        controlMeeting,
        setPauseReason,
        setEndReason,
        setEndOutcome
    } = ctx;
    const discussion = detail && "pendingDecisionCandidates" in detail ? detail : undefined;
    const selectedItem = meetings.find((item) => item.meetingId === selectedId);
    const canPause =
        detail !== undefined && ["created", "running", "waiting"].includes(detail.status);
    const canResume = detail?.status === "paused";
    const canEnd =
        detail !== undefined && ["running", "paused", "converging"].includes(detail.status);
    const writesDisabled = listCached || detailCached || writePending;

    return createElement(
        "section",
        { "data-testid": "convivium-meeting-panel", "aria-label": "Convivium meetings" },
        createElement("h2", null, "Meetings"),
        createElement(
            Button,
            {
                type: "button",
                variant: "outline",
                size: "sm",
                "aria-label": "Reload meetings",
                onClick: requestRefresh
            },
            "Reload"
        ),
        createElement(
            "div",
            { "data-cached": listCached ? "true" : undefined },
            listError === undefined ? null : createElement("p", { role: "status" }, listError),
            meetings.length === 0
                ? createElement("p", null, "No meetings found.")
                : createElement(
                      "ul",
                      { "aria-label": "Meetings" },
                      meetings.map((item) =>
                          createElement(
                              "li",
                              { key: item.meetingId },
                              createElement(
                                  Button,
                                  {
                                      type: "button",
                                      variant: "outline",
                                      size: "sm",
                                      ...{ "data-meeting-id": item.meetingId },
                                      onClick: () => selectMeeting(item.meetingId)
                                  },
                                  `${item.topic} (${item.status})`
                              )
                          )
                      )
                  )
        ),
        selectedId === undefined
            ? null
            : createElement(
                  "div",
                  { "data-cached": detailCached ? "true" : undefined },
                  createElement("h3", null, detail?.topic ?? selectedItem?.topic ?? "Meeting"),
                  detailError === undefined
                      ? null
                      : createElement("p", { role: "alert" }, detailError),
                  factError === undefined
                      ? null
                      : createElement(
                            "p",
                            { role: "alert" },
                            `${factError.code}: ${factError.message}${factError.retryable ? " Refresh before submitting again" : ""}`
                        ),
                  detail === undefined
                      ? createElement("p", null, "Loading meeting status…")
                      : createElement(
                            "div",
                            null,
                            renderObservabilitySections(detail, {
                                renderCandidateActions: (id) =>
                                    renderActions(ctx, id, [
                                        ["accept-decision", "Accept decision"]
                                    ]),
                                renderDecisionActions: (id) =>
                                    renderActions(ctx, id, [
                                        ["supersede-decision", "Replace decision"],
                                        ["revoke-decision", "Revoke decision"]
                                    ]),
                                renderRiskActions: (id) => {
                                    const risk = discussion?.risks.find((item) => item.id === id);
                                    if (!risk || !["open", "accepted_risk"].includes(risk.status))
                                        return null;
                                    const actions: Array<[FactControlAction, string]> = [];
                                    if (risk.status === "open")
                                        actions.push(["accept-risk", "Accept risk"]);
                                    if (
                                        risk.status === "accepted_risk" ||
                                        risk.disposition !== "blocking"
                                    )
                                        actions.push(["reject-risk", "Set as blocking"]);
                                    return renderActions(
                                        ctx,
                                        id,
                                        actions,
                                        risk.riskLevel === undefined ||
                                            risk.violatedConstraintIds.length > 0
                                    );
                                },
                                renderContributionActions: (id) =>
                                    renderContributionActions(ctx, id),
                                renderContributionFooter: () => renderContributionFooter(ctx)
                            }),
                            canPause
                                ? createElement(
                                      "div",
                                      {
                                          style: {
                                              display: "flex",
                                              flexWrap: "wrap",
                                              alignItems: "center",
                                              gap: 8
                                          }
                                      },
                                      createElement(Input, {
                                          "aria-label": "Pause reason",
                                          value: pauseReason,
                                          onChange: (event: ChangeEvent<HTMLInputElement>) =>
                                              setPauseReason(event.currentTarget.value)
                                      }),
                                      createElement(
                                          Button,
                                          {
                                              type: "button",
                                              variant: "outline",
                                              size: "sm",
                                              "aria-label": "Pause meeting",
                                              disabled: writesDisabled || pauseReason.trim() === "",
                                              onClick: () => void controlMeeting("pause")
                                          },
                                          "Pause"
                                      )
                                  )
                                : null,
                            canResume
                                ? createElement(
                                      Button,
                                      {
                                          type: "button",
                                          variant: "outline",
                                          size: "sm",
                                          "aria-label": "Resume meeting",
                                          disabled: writesDisabled,
                                          onClick: () => void controlMeeting("resume")
                                      },
                                      "Resume"
                                  )
                                : null,
                            canEnd
                                ? createElement(
                                      "div",
                                      {
                                          style: {
                                              display: "flex",
                                              flexWrap: "wrap",
                                              alignItems: "center",
                                              gap: 8
                                          }
                                      },
                                      createElement(
                                          "div",
                                          {
                                              role: "radiogroup",
                                              "aria-label": "End outcome",
                                              style: { display: "flex", flexWrap: "wrap", gap: 4 }
                                          },
                                          END_OUTCOMES.map((option, index) =>
                                              createElement(
                                                  Button,
                                                  {
                                                      key: option.value,
                                                      type: "button",
                                                      size: "sm",
                                                      variant:
                                                          endOutcome === option.value
                                                              ? "primary"
                                                              : "outline",
                                                      role: "radio",
                                                      ...{ "data-end-outcome": option.value },
                                                      "aria-checked": endOutcome === option.value,
                                                      tabIndex:
                                                          endOutcome === option.value ? 0 : -1,
                                                      disabled: writesDisabled,
                                                      onClick: () => {
                                                          if (writesDisabled || ctx.writeActive())
                                                              return;
                                                          setEndOutcome(option.value);
                                                      },
                                                      onKeyDown: (
                                                          event: KeyboardEvent<HTMLButtonElement>
                                                      ) => {
                                                          let nextIndex: number;
                                                          switch (event.key) {
                                                              case "ArrowRight":
                                                              case "ArrowDown":
                                                                  nextIndex =
                                                                      (index + 1) %
                                                                      END_OUTCOMES.length;
                                                                  break;
                                                              case "ArrowLeft":
                                                              case "ArrowUp":
                                                                  nextIndex =
                                                                      (index +
                                                                          END_OUTCOMES.length -
                                                                          1) %
                                                                      END_OUTCOMES.length;
                                                                  break;
                                                              case "Home":
                                                                  nextIndex = 0;
                                                                  break;
                                                              case "End":
                                                                  nextIndex =
                                                                      END_OUTCOMES.length - 1;
                                                                  break;
                                                              default:
                                                                  return;
                                                          }
                                                          event.preventDefault();
                                                          if (writesDisabled || ctx.writeActive())
                                                              return;
                                                          const nextOption =
                                                              END_OUTCOMES[nextIndex];
                                                          if (nextOption === undefined) return;
                                                          setEndOutcome(nextOption.value);
                                                          event.currentTarget.parentElement
                                                              ?.querySelector<HTMLButtonElement>(
                                                                  `[data-end-outcome="${nextOption.value}"]`
                                                              )
                                                              ?.focus();
                                                      }
                                                  },
                                                  option.label
                                              )
                                          )
                                      ),
                                      createElement(Input, {
                                          "aria-label": "End reason",
                                          value: endReason,
                                          onChange: (event: ChangeEvent<HTMLInputElement>) =>
                                              setEndReason(event.currentTarget.value)
                                      }),
                                      createElement(
                                          Button,
                                          {
                                              type: "button",
                                              variant: "outline",
                                              size: "sm",
                                              "aria-label": "End meeting",
                                              disabled: writesDisabled || endReason.trim() === "",
                                              onClick: () => void controlMeeting("end")
                                          },
                                          "End meeting"
                                      )
                                  )
                                : null
                        )
              )
    );
}
