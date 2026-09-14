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
    type ContributionSummaryV1,
    type LocalMeetingListItemV1,
    type MeetingStatusResultV1,
    type ProtocolErrorV1,
    type ReadContributionResultV1
} from "@/protocol/index.js";
import { ProtocolFailure, type MeetingClient } from "./meeting-client.js";
import { renderContributionDetail, renderObservabilitySections } from "./meeting-panel-sections.js";
import { Button, Input } from "@deepseek-ai/dsh-client-ui-primitives";

const END_OUTCOMES = [
    { value: "partial", label: "Partial" },
    { value: "no_consensus", label: "No consensus" },
    { value: "cancelled", label: "Cancelled" }
] as const;
type EndOutcome = (typeof END_OUTCOMES)[number]["value"];

type FactControlAction =
    "accept-decision" | "supersede-decision" | "revoke-decision" | "accept-risk" | "reject-risk";
interface FactControlDraft {
    action: FactControlAction;
    targetId: string;
    reason: string;
    evidenceMessageIds: readonly string[];
    replacementCandidateId?: string;
}

type ContributionControlAction = "retry" | "cancel" | "notify_manager";
interface ContributionControlDraft {
    readonly action: ContributionControlAction;
    readonly contributionId?: string;
    reason: string;
}

function failureMessage(_error: unknown): string {
    return "Meeting data is unavailable.";
}

export function ConviviumMeetingPanel({ api }: { api: MeetingClient }): ReactElement {
    const [meetings, setMeetings] = useState<readonly LocalMeetingListItemV1[]>([]);
    const [selectedId, setSelectedId] = useState<string>();
    const [detail, setDetail] = useState<MeetingStatusResultV1>();
    const [listCached, setListCached] = useState(false);
    const [detailCached, setDetailCached] = useState(false);
    const [listError, setListError] = useState<string>();
    const [detailError, setDetailError] = useState<string>();
    const [pauseReason, setPauseReason] = useState("");
    const [endReason, setEndReason] = useState("");
    const [endOutcome, setEndOutcome] = useState<EndOutcome>("partial");
    const [writePending, setWritePending] = useState(false);
    const [draft, setDraft] = useState<FactControlDraft>();
    const [factError, setFactError] = useState<ProtocolErrorV1>();
    const [contributionDetail, setContributionDetail] = useState<ReadContributionResultV1>();
    const [contributionRevision, setContributionRevision] = useState<number>();
    const [contributionDraft, setContributionDraft] = useState<ContributionControlDraft>();
    const [contributionError, setContributionError] = useState<string>();

    const mounted = useRef(true);
    const selectedIdRef = useRef<string>();
    const writePendingRef = useRef(false);
    const listController = useRef<AbortController>();
    const detailController = useRef<AbortController>();
    const writeController = useRef<AbortController>();
    const contributionController = useRef<AbortController>();
    const listGeneration = useRef(0);
    const detailGeneration = useRef(0);
    const writeGeneration = useRef(0);
    const contributionGeneration = useRef(0);
    const refreshReading = useRef(false);
    const refreshDirty = useRef(false);
    const refreshEpoch = useRef(0);
    const streamReady = useRef(false);
    const invalidateReads = useCallback(() => {
        refreshEpoch.current += 1;
        listGeneration.current += 1;
        detailGeneration.current += 1;
        listController.current?.abort();
        detailController.current?.abort();
        contributionController.current?.abort();
    }, []);

    const clearSelection = useCallback(() => {
        detailController.current?.abort();
        writeController.current?.abort();
        detailGeneration.current += 1;
        writeGeneration.current += 1;
        contributionGeneration.current += 1;
        selectedIdRef.current = undefined;
        writePendingRef.current = false;
        setSelectedId(undefined);
        setDetail(undefined);
        setDetailCached(false);
        setDetailError(undefined);
        setPauseReason("");
        setEndReason("");
        setEndOutcome("partial");
        setDraft(undefined);
        setFactError(undefined);
        setContributionDetail(undefined);
        setContributionRevision(undefined);
        setContributionDraft(undefined);
        setContributionError(undefined);
        setWritePending(false);
    }, []);

    const loadList = useCallback(async (): Promise<boolean> => {
        listController.current?.abort();
        const controller = new AbortController();
        listController.current = controller;
        const generation = ++listGeneration.current;
        try {
            const validated = await api.list(controller.signal);
            if (!mounted.current || generation !== listGeneration.current) return false;
            const nextMeetings = validated.result.meetings;
            setMeetings(nextMeetings);
            setListError(undefined);
            const currentId = selectedIdRef.current;
            if (
                currentId !== undefined &&
                !nextMeetings.some((item) => item.meetingId === currentId)
            ) {
                clearSelection();
            }
            return true;
        } catch (error) {
            if (controller.signal.aborted || generation !== listGeneration.current) return false;
            setListCached(true);
            setListError(failureMessage(error));
            return false;
        }
    }, [api, clearSelection]);

    const loadDetail = useCallback(
        async (meetingId: string): Promise<boolean> => {
            detailController.current?.abort();
            contributionController.current?.abort();
            const controller = new AbortController();
            detailController.current = controller;
            const generation = ++detailGeneration.current;
            try {
                const validated = await api.getStatus(
                    { protocolVersion: 1, meetingId },
                    controller.signal
                );
                if (
                    !mounted.current ||
                    generation !== detailGeneration.current ||
                    selectedIdRef.current !== meetingId
                ) {
                    return false;
                }
                setDetail(validated.result);
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
        },
        [api]
    );

    const requestRefresh = useCallback(() => {
        refreshDirty.current = true;
        if (refreshReading.current || writePendingRef.current || !mounted.current) return;
        refreshReading.current = true;
        void (async () => {
            try {
                while (refreshDirty.current && !writePendingRef.current && mounted.current) {
                    refreshDirty.current = false;
                    const epoch = refreshEpoch.current;
                    const meetingId = selectedIdRef.current;
                    const [listOk, detailOk] = await Promise.all([
                        loadList(),
                        meetingId === undefined ? Promise.resolve(true) : loadDetail(meetingId)
                    ]);
                    if (
                        mounted.current &&
                        epoch === refreshEpoch.current &&
                        streamReady.current &&
                        meetingId === selectedIdRef.current
                    ) {
                        setListCached(!listOk);
                        setDetailCached(!detailOk || !listOk);
                    }
                }
            } finally {
                refreshReading.current = false;
            }
        })();
    }, [loadList, loadDetail]);

    const selectMeeting = useCallback(
        (meetingId: string) => {
            invalidateReads();
            writeController.current?.abort();
            detailGeneration.current += 1;
            writeGeneration.current += 1;
            contributionGeneration.current += 1;
            selectedIdRef.current = meetingId;
            writePendingRef.current = false;
            setSelectedId(meetingId);
            setDetail(undefined);
            setDetailCached(true);
            setDetailError(undefined);
            setPauseReason("");
            setEndReason("");
            setEndOutcome("partial");
            setDraft(undefined);
            setFactError(undefined);
            setContributionDetail(undefined);
            setContributionRevision(undefined);
            setContributionDraft(undefined);
            setContributionError(undefined);
            setWritePending(false);
            requestRefresh();
        },
        [invalidateReads, requestRefresh]
    );

    const controlMeeting = useCallback(
        async (action: "pause" | "resume" | "end") => {
            const meetingId = selectedIdRef.current;
            if (
                meetingId === undefined ||
                detail === undefined ||
                listCached ||
                detailCached ||
                writePendingRef.current
            ) {
                return;
            }
            const controller = new AbortController();
            writeController.current = controller;
            const generation = ++writeGeneration.current;
            writePendingRef.current = true;
            invalidateReads();
            setDetailCached(true);
            setWritePending(true);
            setDetailError(undefined);
            let shouldRefetch = false;
            try {
                try {
                    if (action === "pause") {
                        await api.pause(
                            {
                                protocolVersion: 1,
                                meetingId,
                                expectedMeetingVersion: detail.meetingVersion,
                                requestId: crypto.randomUUID(),
                                reason: pauseReason
                            },
                            controller.signal
                        );
                    } else if (action === "resume") {
                        await api.resume(
                            {
                                protocolVersion: 1,
                                meetingId,
                                expectedMeetingVersion: detail.meetingVersion,
                                requestId: crypto.randomUUID()
                            },
                            controller.signal
                        );
                    } else {
                        await api.end(
                            {
                                protocolVersion: 1,
                                meetingId,
                                expectedMeetingVersion: detail.meetingVersion,
                                outcome: endOutcome,
                                reason: endReason,
                                acceptedDecisionIds: [],
                                deferredAgendaItemIds: [],
                                waivers: [],
                                requestId: crypto.randomUUID()
                            },
                            controller.signal
                        );
                    }
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
                    if (shouldRefetch || refreshDirty.current) requestRefresh();
                }
            }
        },
        [
            api,
            detail,
            detailCached,
            listCached,
            endOutcome,
            endReason,
            pauseReason,
            requestRefresh,
            invalidateReads
        ]
    );

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            listController.current?.abort();
            detailController.current?.abort();
            contributionController.current?.abort();
            writeController.current?.abort();
            listGeneration.current += 1;
            detailGeneration.current += 1;
            writeGeneration.current += 1;
            contributionGeneration.current += 1;
        };
    }, [requestRefresh]);

    useEffect(() => {
        let stopped = false;
        let desired = 0;
        let restarting = false;
        let active: ReturnType<MeetingClient["openUpdates"]> | undefined;
        let removeAbortListener = () => {};
        const invalidate = () => {
            if (stopped) return;
            streamReady.current = false;
            invalidateReads();
            setListCached(true);
            setDetailCached(true);
        };
        const consume = async (stream: ReturnType<MeetingClient["openUpdates"]>, epoch: number) => {
            let generation: number | undefined;
            try {
                for await (const item of stream) {
                    if (stopped || epoch !== desired) break;
                    if (item.value?.kind !== "refresh" || Object.keys(item.value).length !== 1)
                        throw new Error("Invalid meeting refresh notice.");
                    if (generation !== item.generation) {
                        removeAbortListener();
                        invalidate();
                        generation = item.generation;
                        item.signal.addEventListener("abort", invalidate, { once: true });
                        removeAbortListener = () =>
                            item.signal.removeEventListener("abort", invalidate);
                        if (item.signal.aborted) continue;
                        streamReady.current = true;
                    }
                    item.accept();
                    requestRefresh();
                }
            } catch {
                if (!stopped && epoch === desired) invalidate();
            } finally {
                if (!stopped && epoch === desired) {
                    invalidate();
                    await stream.dispose();
                }
            }
        };
        const restart = () => {
            desired += 1;
            invalidate();
            if (restarting) return;
            restarting = true;
            void (async () => {
                try {
                    let epoch: number;
                    do {
                        epoch = desired;
                        removeAbortListener();
                        await active?.dispose();
                        active = undefined;
                        if (stopped) return;
                    } while (epoch !== desired);
                    const stream = api.openUpdates(() => {
                        if (!stopped && desired === epoch) invalidate();
                    });
                    active = stream;
                    void consume(stream, epoch);
                } catch {
                    invalidate();
                } finally {
                    restarting = false;
                }
            })();
        };
        restart();
        window.addEventListener("focus", restart);
        return () => {
            stopped = true;
            desired += 1;
            streamReady.current = false;
            removeAbortListener();
            window.removeEventListener("focus", restart);
            void active?.dispose();
        };
    }, [api, invalidateReads, requestRefresh]);

    const loadContribution = useCallback(
        async (meetingId: string, task: ContributionSummaryV1, draftRevision?: number) => {
            contributionController.current?.abort();
            const controller = new AbortController();
            contributionController.current = controller;
            const generation = ++contributionGeneration.current;
            const selectedRevision = draftRevision ?? task.currentDraftRevision;
            const isCurrent = () =>
                mounted.current &&
                !controller.signal.aborted &&
                generation === contributionGeneration.current &&
                selectedIdRef.current === meetingId;
            setContributionError(undefined);
            try {
                const selected = await api.readContribution(
                    {
                        protocolVersion: 1,
                        meetingId,
                        contributionId: task.id,
                        ...(selectedRevision > 0 ? { draftRevision: selectedRevision } : {})
                    },
                    controller.signal
                );
                if (!isCurrent()) return;
                const evidenceKey = selected.result.drafts[0]?.citations[0]?.evidenceKey;
                const result =
                    evidenceKey === undefined
                        ? selected.result
                        : (
                              await api.readContribution(
                                  {
                                      protocolVersion: 1,
                                      meetingId,
                                      contributionId: task.id,
                                      draftRevision: selectedRevision,
                                      evidenceKey
                                  },
                                  controller.signal
                              )
                          ).result;
                if (!isCurrent()) return;
                setContributionDetail(result);
                setContributionRevision(selectedRevision);
            } catch (error) {
                if (!isCurrent()) return;
                setContributionDetail(undefined);
                setContributionError(
                    error instanceof ProtocolFailure ? error.message : failureMessage(error)
                );
            }
        },
        [api]
    );

    const submitContributionControl = useCallback(async () => {
        const meetingId = selectedIdRef.current;
        if (
            meetingId === undefined ||
            contributionDraft === undefined ||
            contributionDraft.reason.trim() === "" ||
            listCached ||
            detailCached ||
            writePendingRef.current
        )
            return;
        const controller = new AbortController();
        writeController.current = controller;
        const generation = ++writeGeneration.current;
        const isCurrent = () =>
            mounted.current &&
            !controller.signal.aborted &&
            generation === writeGeneration.current &&
            selectedIdRef.current === meetingId;
        writePendingRef.current = true;
        setWritePending(true);
        setContributionError(undefined);
        try {
            const latest = await api.getStatus(
                { protocolVersion: 1, meetingId },
                controller.signal
            );
            if (!isCurrent()) return;
            const task = latest.result.contributions?.tasks.find(
                (candidate) => candidate.id === contributionDraft.contributionId
            );
            const command =
                contributionDraft.action === "notify_manager"
                    ? {
                          protocolVersion: 1 as const,
                          meetingId,
                          requestId: crypto.randomUUID(),
                          expectedMeetingVersion: latest.meetingVersion,
                          action: "notify_manager" as const,
                          reason: contributionDraft.reason
                      }
                    : task === undefined
                      ? undefined
                      : {
                            protocolVersion: 1 as const,
                            meetingId,
                            requestId: crypto.randomUUID(),
                            expectedMeetingVersion: latest.meetingVersion,
                            action: contributionDraft.action,
                            contributionId: task.id,
                            generation: task.generation,
                            reason: contributionDraft.reason
                        };
            if (command === undefined) {
                setContributionDraft(undefined);
                setContributionError("Contribution is no longer available.");
                return;
            }
            await api.controlContribution(command, controller.signal);
            if (!isCurrent()) return;
            setContributionDraft(undefined);
            setContributionDetail(undefined);
            refreshDirty.current = true;
        } catch (error) {
            if (!isCurrent()) return;
            setContributionDraft(undefined);
            if (error instanceof ProtocolFailure) {
                setContributionError(error.message);
                refreshDirty.current = true;
            } else {
                setDetailCached(true);
                setContributionError(failureMessage(error));
            }
        } finally {
            if (isCurrent()) {
                writePendingRef.current = false;
                setWritePending(false);
                if (refreshDirty.current) requestRefresh();
            }
        }
    }, [api, contributionDraft, detailCached, listCached, requestRefresh]);

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
        invalidateReads();
        setDetailCached(true);
        setWritePending(true);
        setFactError(undefined);
        const base = {
            protocolVersion: 1 as const,
            meetingId,
            expectedMeetingVersion: detail.meetingVersion,
            requestId: crypto.randomUUID(),
            reason: draft.reason,
            evidenceMessageIds: draft.evidenceMessageIds
        };
        try {
            if (draft.action === "accept-decision") {
                await api.acceptDecision(
                    { ...base, decisionCandidateId: draft.targetId },
                    controller.signal
                );
            } else if (
                draft.action === "supersede-decision" ||
                draft.action === "revoke-decision"
            ) {
                await api.disposeDecision(
                    {
                        ...base,
                        decisionId: draft.targetId,
                        action: draft.action === "supersede-decision" ? "supersede" : "revoke",
                        ...(draft.action === "supersede-decision"
                            ? { replacementCandidateId: draft.replacementCandidateId }
                            : {})
                    },
                    controller.signal
                );
            } else {
                await api.disposeRisk(
                    {
                        ...base,
                        issueId: draft.targetId,
                        decision: draft.action === "accept-risk" ? "accept" : "reject"
                    },
                    controller.signal
                );
            }
            if (!current() || controller.signal.aborted) return;
            setDraft(undefined);
            setFactError(undefined);
            refreshDirty.current = true;
        } catch (error) {
            if (!current() || controller.signal.aborted) return;
            setDraft(undefined);
            if (error instanceof ProtocolFailure) {
                setFactError(error.protocolError);
                refreshDirty.current = true;
            } else {
                setDetailCached(true);
                setDetailError(failureMessage(error));
            }
        } finally {
            if (current()) {
                writePendingRef.current = false;
                setWritePending(false);
                if (refreshDirty.current) requestRefresh();
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
                        variant: "outline",
                        size: "sm",
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

    function renderContributionControlForm(): ReactElement | null {
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

    function renderContributionActions(contributionId: string): ReactElement | null {
        const task = detail?.contributions?.tasks.find(
            (candidate) => candidate.id === contributionId
        );
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
                ? renderContributionControlForm()
                : null
        );
    }

    function renderContributionFooter(): ReactElement | null {
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
                          onClick: () =>
                              setContributionDraft({ action: "notify_manager", reason: "" })
                      },
                      "Notify Manager"
                  )
                : null,
            contributionDraft?.action === "notify_manager" ? renderContributionControlForm() : null,
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
                      renderContributionDetail(contributionDetail)
                  )
        );
    }

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
                                },
                                renderContributionActions,
                                renderContributionFooter
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
