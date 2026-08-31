import {
    createElement,
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type ReactElement
} from "react";
import {
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
} from "../protocol/index.js";
import { mapMeetingPanelView } from "./meeting-panel-view.js";

const meetingsPath = "/api/convivium/meetings";

class ProtocolFailure extends Error {}

function renderObservabilitySections(detail: MeetingStatusResultV1): ReactElement {
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
                row("Waiting reason", view.waitingReason),
                row("Waiting participants", view.waitingParticipants)
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
                              row("Agenda item", message.agendaItemId)
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
                                    )
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

function meetingPath(meetingId: string): string {
    return `${meetingsPath}/${encodeURIComponent(meetingId)}`;
}

async function responseJson(response: Response): Promise<unknown> {
    return response.json() as Promise<unknown>;
}

function protocolFailure(value: unknown): ProtocolFailure {
    const validated = validateProtocolError(value);
    const error = validated as ProtocolErrorV1;
    return new ProtocolFailure(error.message);
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
    const [endOutcome, setEndOutcome] = useState<"partial" | "no_consensus" | "cancelled">(
        "partial"
    );
    const [writePending, setWritePending] = useState(false);

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
            "button",
            { type: "button", "aria-label": "Reload meetings", onClick: () => void loadList() },
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
                                  "button",
                                  {
                                      type: "button",
                                      "data-meeting-id": item.meetingId,
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
                  detail === undefined
                      ? createElement("p", null, "Loading meeting status…")
                      : createElement(
                            "div",
                            null,
                            renderObservabilitySections(detail),
                            canPause
                                ? createElement(
                                      "div",
                                      null,
                                      createElement("input", {
                                          "aria-label": "Pause reason",
                                          value: pauseReason,
                                          onChange: (event: ChangeEvent<HTMLInputElement>) =>
                                              setPauseReason(event.currentTarget.value)
                                      }),
                                      createElement(
                                          "button",
                                          {
                                              type: "button",
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
                                      "button",
                                      {
                                          type: "button",
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
                                      null,
                                      createElement("input", {
                                          "aria-label": "Skip reason",
                                          value: skipReason,
                                          onChange: (event: ChangeEvent<HTMLInputElement>) =>
                                              setSkipReason(event.currentTarget.value)
                                      }),
                                      createElement(
                                          "button",
                                          {
                                              type: "button",
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
                                      null,
                                      createElement(
                                          "select",
                                          {
                                              "aria-label": "End outcome",
                                              value: endOutcome,
                                              onChange: (event: ChangeEvent<HTMLSelectElement>) =>
                                                  setEndOutcome(
                                                      event.currentTarget.value as
                                                          "partial" | "no_consensus" | "cancelled"
                                                  )
                                          },
                                          createElement("option", { value: "partial" }, "Partial"),
                                          createElement(
                                              "option",
                                              { value: "no_consensus" },
                                              "No consensus"
                                          ),
                                          createElement(
                                              "option",
                                              { value: "cancelled" },
                                              "Cancelled"
                                          )
                                      ),
                                      createElement("input", {
                                          "aria-label": "End reason",
                                          value: endReason,
                                          onChange: (event: ChangeEvent<HTMLInputElement>) =>
                                              setEndReason(event.currentTarget.value)
                                      }),
                                      createElement(
                                          "button",
                                          {
                                              type: "button",
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
