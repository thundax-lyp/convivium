import {
    createElement,
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
    type KeyboardEvent,
    type ReactElement
} from "react";
import {
    CaptainDecisionAcceptanceResultSchema,
    CaptainDecisionDispositionResultSchema,
    CaptainRiskDispositionResultSchema,
    EndMeetingResultSchema,
    LocalMeetingListResponseConsumerSchema,
    MeetingControlResultSchema,
    MeetingStatusResultSchema,
    ReassignTurnResultSchema,
    validateProtocolError,
    validateProtocolSuccessEnvelope,
    type LocalMeetingListItemV1,
    type LocalMeetingListResponseV1,
    type EndMeetingResultV1,
    type MeetingControlResultV1,
    type MeetingStatusResultV1,
    type ProtocolErrorV1,
    type ProtocolSuccessV1,
    type ReassignTurnResultV1
} from "@/protocol/index.js";
import { renderObservabilitySections } from "./meeting-panel-sections.js";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";

const meetingsPath = "/api/convivium/meetings";
const END_OUTCOMES = [
    { value: "partial", label: "Partial" },
    { value: "no_consensus", label: "No consensus" },
    { value: "cancelled", label: "Cancelled" }
] as const;
type EndOutcome = (typeof END_OUTCOMES)[number]["value"];

class ProtocolFailure extends Error {
    constructor(readonly protocolError: ProtocolErrorV1) {
        super(protocolError.message);
    }
}
type FactControlAction =
    "accept-decision" | "supersede-decision" | "revoke-decision" | "accept-risk" | "reject-risk";
interface FactControlDraft {
    action: FactControlAction;
    targetId: string;
    reason: string;
    evidenceMessageIds: readonly string[];
    replacementCandidateId?: string;
}

function meetingPath(meetingId: string): string {
    return `${meetingsPath}/${encodeURIComponent(meetingId)}`;
}

async function responseJson(response: Response): Promise<unknown> {
    return response.json() as Promise<unknown>;
}

function protocolFailure(value: unknown): ProtocolFailure {
    const validated = validateProtocolError(value);
    const error = validated as ProtocolErrorV1;
    return new ProtocolFailure(error);
}

async function readList(response: Response): Promise<LocalMeetingListResponseV1> {
    const value = await responseJson(response);
    if (!response.ok) throw protocolFailure(value);
    return LocalMeetingListResponseConsumerSchema(value) as LocalMeetingListResponseV1;
}

async function readStatus(response: Response): Promise<ProtocolSuccessV1<MeetingStatusResultV1>> {
    const value = await responseJson(response);
    if (!response.ok) throw protocolFailure(value);
    return validateProtocolSuccessEnvelope(
        MeetingStatusResultSchema,
        value
    ) as unknown as ProtocolSuccessV1<MeetingStatusResultV1>;
}

async function readControl(response: Response): Promise<ProtocolSuccessV1<MeetingControlResultV1>> {
    const value = await responseJson(response);
    if (!response.ok) throw protocolFailure(value);
    return validateProtocolSuccessEnvelope(
        MeetingControlResultSchema,
        value
    ) as ProtocolSuccessV1<MeetingControlResultV1>;
}

async function readReassign(response: Response): Promise<ProtocolSuccessV1<ReassignTurnResultV1>> {
    const value = await responseJson(response);
    if (!response.ok) throw protocolFailure(value);
    return validateProtocolSuccessEnvelope(
        ReassignTurnResultSchema,
        value
    ) as ProtocolSuccessV1<ReassignTurnResultV1>;
}

async function readEnd(response: Response): Promise<ProtocolSuccessV1<EndMeetingResultV1>> {
    const value = await responseJson(response);
    if (!response.ok) throw protocolFailure(value);
    return validateProtocolSuccessEnvelope(
        EndMeetingResultSchema,
        value
    ) as ProtocolSuccessV1<EndMeetingResultV1>;
}

function failureMessage(_error: unknown): string {
    return "Meeting data is unavailable.";
}

export function ConviviumMeetingPanel(): ReactElement {
    const [meetings, setMeetings] = useState<readonly LocalMeetingListItemV1[]>([]);
    const [selectedId, setSelectedId] = useState<string>();
    const [detail, setDetail] = useState<MeetingStatusResultV1>();
    const [listCached, setListCached] = useState(false);
    const [detailCached, setDetailCached] = useState(false);
    const [listError, setListError] = useState<string>();
    const [detailError, setDetailError] = useState<string>();
    const [pauseReason, setPauseReason] = useState("");
    const [skipReason, setSkipReason] = useState("");
    const [endReason, setEndReason] = useState("");
    const [endOutcome, setEndOutcome] = useState<EndOutcome>("partial");
    const [writePending, setWritePending] = useState(false);
    const [draft, setDraft] = useState<FactControlDraft>();
    const [factError, setFactError] = useState<ProtocolErrorV1>();

    const mounted = useRef(true);
    const selectedIdRef = useRef<string>();
    const writePendingRef = useRef(false);
    const listController = useRef<AbortController>();
    const detailController = useRef<AbortController>();
    const writeController = useRef<AbortController>();
    const listGeneration = useRef(0);
    const detailGeneration = useRef(0);
    const writeGeneration = useRef(0);

    const clearSelection = useCallback(() => {
        detailController.current?.abort();
        writeController.current?.abort();
        detailGeneration.current += 1;
        writeGeneration.current += 1;
        selectedIdRef.current = undefined;
        writePendingRef.current = false;
        setSelectedId(undefined);
        setDetail(undefined);
        setDetailCached(false);
        setDetailError(undefined);
        setPauseReason("");
        setSkipReason("");
        setEndReason("");
        setEndOutcome("partial");
        setDraft(undefined);
        setFactError(undefined);
        setWritePending(false);
    }, []);

    const loadList = useCallback(async () => {
        listController.current?.abort();
        const controller = new AbortController();
        listController.current = controller;
        const generation = ++listGeneration.current;
        try {
            const response = await fetch(meetingsPath, { signal: controller.signal });
            const validated = await readList(response);
            if (!mounted.current || generation !== listGeneration.current) return;
            const nextMeetings = validated.result.meetings;
            setMeetings(nextMeetings);
            setListCached(false);
            setListError(undefined);
            const currentId = selectedIdRef.current;
            if (
                currentId !== undefined &&
                !nextMeetings.some((item) => item.meetingId === currentId)
            ) {
                clearSelection();
            }
        } catch (error) {
            if (controller.signal.aborted || generation !== listGeneration.current) return;
            setListCached(true);
            setListError(failureMessage(error));
        }
    }, [clearSelection]);

    const loadDetail = useCallback(async (meetingId: string): Promise<boolean> => {
        detailController.current?.abort();
        const controller = new AbortController();
        detailController.current = controller;
        const generation = ++detailGeneration.current;
        try {
            const response = await fetch(meetingPath(meetingId), { signal: controller.signal });
            const validated = await readStatus(response);
            if (
                !mounted.current ||
                generation !== detailGeneration.current ||
                selectedIdRef.current !== meetingId
            ) {
                return false;
            }
            setDetail(validated.result);
            setDetailCached(false);
            setDetailError(undefined);
            return true;
        } catch (error) {
            if (
                controller.signal.aborted ||
                generation !== detailGeneration.current ||
                selectedIdRef.current !== meetingId
            ) {
                return false;
            }
            setDetailCached(true);
            setDetailError(failureMessage(error));
            return false;
        }
    }, []);

    const refreshSelectedMeeting = useCallback(
        async (meetingId: string) => Promise.all([loadList(), loadDetail(meetingId)]),
        [loadDetail, loadList]
    );

    const selectMeeting = useCallback(
        (meetingId: string) => {
            detailController.current?.abort();
            writeController.current?.abort();
            detailGeneration.current += 1;
            writeGeneration.current += 1;
            selectedIdRef.current = meetingId;
            writePendingRef.current = false;
            setSelectedId(meetingId);
            setDetail(undefined);
            setDetailCached(false);
            setDetailError(undefined);
            setPauseReason("");
            setSkipReason("");
            setEndReason("");
            setEndOutcome("partial");
            setDraft(undefined);
            setFactError(undefined);
            setWritePending(false);
            void loadDetail(meetingId);
        },
        [loadDetail]
    );

    const controlMeeting = useCallback(
        async (action: "pause" | "resume" | "reassign" | "end") => {
            const meetingId = selectedIdRef.current;
            if (
                meetingId === undefined ||
                detail === undefined ||
                detailCached ||
                writePendingRef.current
            ) {
                return;
            }
            const controller = new AbortController();
            writeController.current = controller;
            const generation = ++writeGeneration.current;
            writePendingRef.current = true;
            setWritePending(true);
            setDetailError(undefined);
            const body =
                action === "pause"
                    ? {
                          protocolVersion: 1,
                          meetingId,
                          expectedMeetingVersion: detail.meetingVersion,
                          requestId: crypto.randomUUID(),
                          reason: pauseReason
                      }
                    : action === "resume"
                      ? {
                            protocolVersion: 1,
                            meetingId,
                            expectedMeetingVersion: detail.meetingVersion,
                            requestId: crypto.randomUUID()
                        }
                      : action === "reassign"
                        ? {
                              protocolVersion: 1,
                              meetingId,
                              expectedMeetingVersion: detail.meetingVersion,
                              currentAttemptId: detail.currentAttemptId!,
                              action: "skip" as const,
                              reason: skipReason,
                              requestId: crypto.randomUUID()
                          }
                        : {
                              protocolVersion: 1,
                              meetingId,
                              expectedMeetingVersion: detail.meetingVersion,
                              outcome: endOutcome,
                              reason: endReason,
                              acceptedDecisionIds: [],
                              deferredAgendaItemIds: [],
                              waivers: [],
                              requestId: crypto.randomUUID()
                          };
            let shouldRefetch = false;
            try {
                const response = await fetch(`${meetingPath(meetingId)}/${action}`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
                try {
                    if (action === "pause" || action === "resume") await readControl(response);
                    else if (action === "reassign") await readReassign(response);
                    else await readEnd(response);
                    shouldRefetch = true;
                } catch (error) {
                    if (error instanceof ProtocolFailure) {
                        shouldRefetch = true;
                        setDetailError(error.message);
                        setDetailCached(true);
                    } else {
                        throw error;
                    }
                }
                if (generation === writeGeneration.current && selectedIdRef.current === meetingId) {
                    await refreshSelectedMeeting(meetingId);
                }
            } catch (error) {
                if (
                    !controller.signal.aborted &&
                    generation === writeGeneration.current &&
                    selectedIdRef.current === meetingId
                ) {
                    setDetailCached(true);
                    setDetailError(failureMessage(error));
                }
            } finally {
                if (
                    mounted.current &&
                    generation === writeGeneration.current &&
                    selectedIdRef.current === meetingId
                ) {
                    writePendingRef.current = false;
                    setWritePending(false);
                    if (!shouldRefetch) setDetailCached(true);
                }
            }
        },
        [
            detail,
            detailCached,
            endOutcome,
            endReason,
            pauseReason,
            refreshSelectedMeeting,
            skipReason
        ]
    );

    useEffect(() => {
        mounted.current = true;
        void loadList();
        return () => {
            mounted.current = false;
            listController.current?.abort();
            detailController.current?.abort();
            writeController.current?.abort();
            listGeneration.current += 1;
            detailGeneration.current += 1;
            writeGeneration.current += 1;
        };
    }, [loadList]);

    useEffect(() => {
        const onFocus = () => {
            const meetingId = selectedIdRef.current;
            if (meetingId === undefined) void loadList();
            else if (!writePendingRef.current) void refreshSelectedMeeting(meetingId);
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [loadList, refreshSelectedMeeting]);

    useEffect(() => {
        if (selectedId === undefined) return;
        const timer = window.setInterval(() => {
            if (!writePendingRef.current && selectedIdRef.current !== undefined) {
                void refreshSelectedMeeting(selectedIdRef.current);
            }
        }, 5_000);
        return () => window.clearInterval(timer);
    }, [refreshSelectedMeeting, selectedId]);

    const discussion = detail && "pendingDecisionCandidates" in detail ? detail : undefined;
    const factWritable =
        detail !== undefined &&
        ["created", "running", "waiting", "paused", "converging"].includes(detail.status);
    const targetExists =
        draft !== undefined &&
        discussion !== undefined &&
        (draft.action === "accept-decision"
            ? discussion.pendingDecisionCandidates.some((item) => item.id === draft.targetId)
            : draft.action === "supersede-decision" || draft.action === "revoke-decision"
              ? discussion.acceptedDecisions.some((item) => item.id === draft.targetId)
              : discussion.risks.some(
                    (item) =>
                        item.id === draft.targetId &&
                        item.riskLevel !== undefined &&
                        item.violatedConstraintIds.length === 0 &&
                        (draft.action === "accept-risk"
                            ? item.status === "open"
                            : item.status === "accepted_risk" ||
                              (item.status === "open" && item.disposition !== "blocking"))
                ));
    const validDraft =
        draft !== undefined &&
        targetExists &&
        factWritable &&
        draft.reason.trim() !== "" &&
        draft.evidenceMessageIds.length > 0 &&
        draft.evidenceMessageIds.every((id) =>
            discussion?.messages.some((message) => message.id === id)
        ) &&
        (draft.action !== "supersede-decision" ||
            discussion?.pendingDecisionCandidates.some(
                (item) => item.id === draft.replacementCandidateId
            ));

    useEffect(() => {
        setDraft((current) => {
            if (!current) return current;
            if (!discussion || !factWritable) return undefined;
            const exists =
                current.action === "accept-decision"
                    ? discussion.pendingDecisionCandidates.some(
                          (item) => item.id === current.targetId
                      )
                    : current.action === "supersede-decision" ||
                        current.action === "revoke-decision"
                      ? discussion.acceptedDecisions.some((item) => item.id === current.targetId)
                      : discussion.risks.some(
                            (item) =>
                                item.id === current.targetId &&
                                ["open", "accepted_risk"].includes(item.status)
                        );
            if (!exists) return undefined;
            if (
                current.action === "supersede-decision" &&
                !discussion.pendingDecisionCandidates.some(
                    (item) => item.id === current.replacementCandidateId
                )
            )
                return { ...current, replacementCandidateId: "", evidenceMessageIds: [] };
            return {
                ...current,
                evidenceMessageIds: current.evidenceMessageIds.filter((id) =>
                    discussion.messages.some((message) => message.id === id)
                )
            };
        });
    }, [discussion, factWritable]);

    function openFactControl(action: FactControlAction, targetId: string): void {
        if (!discussion || !factWritable || listCached || detailCached || writePendingRef.current)
            return;
        const sourceId =
            action === "accept-decision"
                ? discussion.pendingDecisionCandidates.find((item) => item.id === targetId)
                      ?.sourceMessageId
                : action === "accept-risk" || action === "reject-risk"
                  ? discussion.risks.find((item) => item.id === targetId)?.sourceMessageId
                  : undefined;
        setDraft({
            action,
            targetId,
            reason: "",
            evidenceMessageIds:
                sourceId && discussion.messages.some((message) => message.id === sourceId)
                    ? [sourceId]
                    : [],
            ...(action === "supersede-decision" ? { replacementCandidateId: "" } : {})
        });
    }

    async function submitFactControl(): Promise<void> {
        const meetingId = selectedIdRef.current;
        if (
            !meetingId ||
            meetingId !== selectedId ||
            !detail ||
            detail.meetingId !== meetingId ||
            !draft ||
            !validDraft ||
            listCached ||
            detailCached ||
            writePendingRef.current
        )
            return;
        const controller = new AbortController();
        writeController.current = controller;
        const generation = ++writeGeneration.current;
        const current = () =>
            mounted.current &&
            generation === writeGeneration.current &&
            selectedIdRef.current === meetingId;
        writePendingRef.current = true;
        setWritePending(true);
        setFactError(undefined);
        const base = {
            protocolVersion: 1,
            meetingId,
            expectedMeetingVersion: detail.meetingVersion,
            requestId: crypto.randomUUID(),
            reason: draft.reason,
            evidenceMessageIds: draft.evidenceMessageIds
        };
        const suffix =
            draft.action === "accept-decision"
                ? "accept-decision"
                : draft.action === "supersede-decision" || draft.action === "revoke-decision"
                  ? "dispose-decision"
                  : "dispose-risk";
        const body =
            draft.action === "accept-decision"
                ? { ...base, decisionCandidateId: draft.targetId }
                : draft.action === "supersede-decision"
                  ? {
                        ...base,
                        decisionId: draft.targetId,
                        action: "supersede",
                        replacementCandidateId: draft.replacementCandidateId
                    }
                  : draft.action === "revoke-decision"
                    ? { ...base, decisionId: draft.targetId, action: "revoke" }
                    : {
                          ...base,
                          issueId: draft.targetId,
                          decision: draft.action === "accept-risk" ? "accept" : "reject"
                      };
        try {
            const response = await fetch(`${meetingPath(meetingId)}/${suffix}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal
            });
            if (!current()) return;
            const value = await responseJson(response);
            if (!current()) return;
            if (!response.ok) throw protocolFailure(value);
            if (suffix === "accept-decision")
                validateProtocolSuccessEnvelope(CaptainDecisionAcceptanceResultSchema, value);
            else if (suffix === "dispose-decision")
                validateProtocolSuccessEnvelope(CaptainDecisionDispositionResultSchema, value);
            else validateProtocolSuccessEnvelope(CaptainRiskDispositionResultSchema, value);
            setDraft(undefined);
            setFactError(undefined);
            await refreshSelectedMeeting(meetingId);
        } catch (error) {
            if (!current() || controller.signal.aborted) return;
            setDraft(undefined);
            if (error instanceof ProtocolFailure) {
                setFactError(error.protocolError);
                await refreshSelectedMeeting(meetingId);
            } else {
                setDetailCached(true);
                setDetailError(failureMessage(error));
            }
        } finally {
            if (current()) {
                writePendingRef.current = false;
                setWritePending(false);
            }
        }
    }

    function renderFactForm(): ReactElement | null {
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
                                            : draft.evidenceMessageIds.filter(
                                                  (id) => id !== message.id
                                              )
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
        id: string,
        actions: Array<[FactControlAction, string]>,
        disabled = false
    ): ReactElement | null {
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
                        disabled: disabled || listCached || detailCached || writePending,
                        onClick: () => openFactControl(action, id)
                    },
                    label
                )
            ),
            draft?.targetId === id && actions.some(([action]) => action === draft.action)
                ? renderFactForm()
                : null
        );
    }

    const selectedItem = meetings.find((item) => item.meetingId === selectedId);
    const canPause =
        detail !== undefined && ["created", "running", "waiting"].includes(detail.status);
    const canResume = detail?.status === "paused";
    const canSkip =
        detail?.status === "running" &&
        detail.currentTurn !== undefined &&
        detail.currentSpeakerId !== undefined &&
        detail.currentAttemptId !== undefined;
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
                onClick: () => void loadList()
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
                                    renderActions(id, [["accept-decision", "Accept decision"]]),
                                renderDecisionActions: (id) =>
                                    renderActions(id, [
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
                                        id,
                                        actions,
                                        risk.riskLevel === undefined ||
                                            risk.violatedConstraintIds.length > 0
                                    );
                                }
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
                            canSkip
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
                                          "aria-label": "Skip reason",
                                          value: skipReason,
                                          onChange: (event: ChangeEvent<HTMLInputElement>) =>
                                              setSkipReason(event.currentTarget.value)
                                      }),
                                      createElement(
                                          Button,
                                          {
                                              type: "button",
                                              variant: "outline",
                                              size: "sm",
                                              "aria-label": "Skip current speaker",
                                              disabled: writesDisabled || skipReason.trim() === "",
                                              onClick: () => void controlMeeting("reassign")
                                          },
                                          "Skip current speaker"
                                      )
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
                                                          if (
                                                              writesDisabled ||
                                                              writePendingRef.current
                                                          )
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
                                                          if (
                                                              writesDisabled ||
                                                              writePendingRef.current
                                                          )
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
