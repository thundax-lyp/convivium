import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
    type ContributionSummaryV1,
    type LocalMeetingListItemV1,
    type MeetingStatusResultV1,
    type ProtocolErrorV1,
    type ReadContributionResultV1
} from "@/protocol/index.js";
import { ProtocolFailure, type MeetingClient } from "./meeting-client.js";
import {
    renderMeetingPanelLayout,
    type ContributionControlDraft,
    type EndOutcome,
    type FactControlAction,
    type FactControlDraft
} from "./meeting-panel-layout.js";

function failureMessage(_error: unknown): string {
    return "Meeting data is unavailable.";
}

function usePanelState() {
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
    return {
        meetings,
        setMeetings,
        selectedId,
        setSelectedId,
        detail,
        setDetail,
        listCached,
        setListCached,
        detailCached,
        setDetailCached,
        listError,
        setListError,
        detailError,
        setDetailError,
        pauseReason,
        setPauseReason,
        endReason,
        setEndReason,
        endOutcome,
        setEndOutcome,
        writePending,
        setWritePending,
        draft,
        setDraft,
        factError,
        setFactError,
        contributionDetail,
        setContributionDetail,
        contributionRevision,
        setContributionRevision,
        contributionDraft,
        setContributionDraft,
        contributionError,
        setContributionError,
        mounted,
        selectedIdRef,
        writePendingRef,
        listController,
        detailController,
        writeController,
        contributionController,
        listGeneration,
        detailGeneration,
        writeGeneration,
        contributionGeneration,
        refreshReading,
        refreshDirty,
        refreshEpoch,
        streamReady
    };
}

type PanelState = ReturnType<typeof usePanelState>;

function usePanelRefresh(api: MeetingClient, state: PanelState) {
    const {
        refreshEpoch,
        listGeneration,
        detailGeneration,
        listController,
        detailController,
        contributionController,
        writeController,
        writeGeneration,
        contributionGeneration,
        selectedIdRef,
        writePendingRef,
        setSelectedId,
        setDetail,
        setDetailCached,
        setDetailError,
        setPauseReason,
        setEndReason,
        setEndOutcome,
        setDraft,
        setFactError,
        setContributionDetail,
        setContributionRevision,
        setContributionDraft,
        setContributionError,
        setWritePending,
        mounted,
        setMeetings,
        setListError,
        setListCached,
        refreshDirty,
        refreshReading,
        streamReady
    } = state;
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
    return { invalidateReads, requestRefresh, selectMeeting };
}

type PanelRefresh = ReturnType<typeof usePanelRefresh>;

function useMeetingUpdates(api: MeetingClient, state: PanelState, refresh: PanelRefresh) {
    const { streamReady, setListCached, setDetailCached } = state;
    const { invalidateReads, requestRefresh } = refresh;
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
}

function useMeetingControl(api: MeetingClient, state: PanelState, refresh: PanelRefresh) {
    const {
        selectedIdRef,
        detail,
        listCached,
        detailCached,
        writePendingRef,
        writeController,
        writeGeneration,
        setDetailCached,
        setWritePending,
        setDetailError,
        pauseReason,
        endReason,
        endOutcome,
        mounted,
        refreshDirty
    } = state;
    const { invalidateReads, requestRefresh } = refresh;
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
    return controlMeeting;
}

function useContributionActions(api: MeetingClient, state: PanelState, refresh: PanelRefresh) {
    const {
        contributionController,
        contributionGeneration,
        mounted,
        selectedIdRef,
        setContributionError,
        setContributionDetail,
        setContributionRevision,
        contributionDraft,
        listCached,
        detailCached,
        writePendingRef,
        writeController,
        writeGeneration,
        setWritePending,
        refreshDirty,
        setDetailCached,
        setContributionDraft
    } = state;
    const { requestRefresh } = refresh;
    const loadContribution = useCallback(
        async (
            meetingId: string,
            task: ContributionSummaryV1,
            draftRevision?: number,
            selectedEvidenceKey?: string
        ) => {
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
                const evidenceKey =
                    selectedEvidenceKey ?? selected.result.drafts[0]?.citations[0]?.evidenceKey;
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
    return { loadContribution, submitContributionControl };
}

function useFactActions(api: MeetingClient, state: PanelState, refresh: PanelRefresh) {
    const {
        detail,
        draft,
        setDraft,
        listCached,
        detailCached,
        writePendingRef,
        selectedIdRef,
        selectedId,
        writeController,
        writeGeneration,
        mounted,
        setDetailCached,
        setWritePending,
        setFactError,
        refreshDirty,
        setDetailError
    } = state;
    const { invalidateReads, requestRefresh } = refresh;
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
    return { factWritable, validDraft, openFactControl, submitFactControl };
}

export function ConviviumMeetingPanel({ api }: { api: MeetingClient }): ReactElement {
    const state = usePanelState();
    const refresh = usePanelRefresh(api, state);
    useMeetingUpdates(api, state, refresh);
    const controlMeeting = useMeetingControl(api, state, refresh);
    const contribution = useContributionActions(api, state, refresh);
    const facts = useFactActions(api, state, refresh);
    return renderMeetingPanelLayout({
        ...state,
        ...refresh,
        ...contribution,
        ...facts,
        controlMeeting,
        writeActive: () => state.writePendingRef.current
    });
}
