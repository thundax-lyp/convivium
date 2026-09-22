import { createElement, type ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.js";
import type { MeetingLocaleKey, MeetingTranslate } from "./locales.js";
import { mapMeetingPanelView } from "./meeting-panel-view.js";

const lifecycleKeys: Record<MeetingView["lifecycle"]["status"], MeetingLocaleKey> = {
    preparing: "lifecycle.preparing",
    running: "lifecycle.running",
    paused: "lifecycle.paused",
    converging: "lifecycle.converging",
    ending: "lifecycle.ending",
    terminal: "lifecycle.terminal",
    archiving: "lifecycle.archiving",
    archived: "lifecycle.archived"
};

const roundStatusKeys: Record<MeetingView["rounds"][number]["status"], MeetingLocaleKey> = {
    open: "round.open",
    published: "round.published",
    aborted: "round.aborted"
};

const archiveStatusKeys: Record<NonNullable<MeetingView["archive"]>["status"], MeetingLocaleKey> = {
    pending: "archive.pending",
    complete: "archive.complete",
    failed: "archive.failed"
};

export function lifecycleLabel(
    status: MeetingView["lifecycle"]["status"],
    t: MeetingTranslate
): string {
    return t(lifecycleKeys[status]);
}

function row(label: string, value: string): ReactElement {
    return createElement(
        "div",
        { key: label },
        createElement("dt", null, label),
        createElement("dd", null, value)
    );
}

function section(label: string, content: ReactElement): ReactElement {
    return createElement(
        "section",
        { "aria-label": label },
        createElement("h4", null, label),
        content
    );
}

function list(values: readonly string[], t: MeetingTranslate): ReactElement {
    return values.length === 0
        ? createElement("p", null, t("value.none"))
        : createElement(
              "ul",
              null,
              values.map((value) => createElement("li", { key: value }, value))
          );
}

export function renderObservabilitySections(
    viewInput: MeetingView,
    t: MeetingTranslate
): ReactElement {
    const view = mapMeetingPanelView(viewInput);
    const activeAgenda = view.agenda.find((item) => item.status === "active");
    return createElement(
        "div",
        null,
        section(
            t("section.summary"),
            createElement(
                "dl",
                null,
                row(t("field.version"), String(view.version)),
                row(t("field.lifecycle"), lifecycleLabel(view.lifecycle.status, t)),
                row(t("field.objective"), view.objective.statement),
                row(t("field.activeAgenda"), activeAgenda?.title ?? t("value.none"))
            )
        ),
        section(
            t("section.rounds"),
            createElement(
                "ul",
                null,
                view.rounds.map((round) =>
                    createElement(
                        "li",
                        { key: round.id },
                        t("round.summary", {
                            id: round.id,
                            status: t(roundStatusKeys[round.status]),
                            count: round.contributions.length
                        })
                    )
                )
            )
        ),
        section(
            t("section.evidenceReviews"),
            createElement(
                "dl",
                null,
                row(t("field.visibleEvidencePackages"), String(view.evidencePackages.length)),
                row(t("field.visibleEvidenceReviews"), String(view.evidenceReviews.length)),
                row(t("field.publications"), String(view.publications.length))
            )
        ),
        section(
            t("section.formalMessages"),
            list(
                view.messages.map((message) => message.body),
                t
            )
        ),
        section(
            t("section.outcomes"),
            createElement(
                "dl",
                null,
                row(t("field.decisions"), String(view.outcomes.decisions.length)),
                row(t("field.completionFacts"), String(view.outcomes.completionFacts.length)),
                row(t("field.issues"), String(view.issues.length))
            )
        ),
        view.archive === undefined
            ? null
            : section(
                  t("section.archive"),
                  createElement(
                      "dl",
                      null,
                      row(t("field.archiveStatus"), t(archiveStatusKeys[view.archive.status])),
                      row(t("field.archiveVersion"), String(view.archive.publicSnapshotVersion)),
                      row(t("field.archiveMessages"), String(view.archive.messages.length))
                  )
              )
    );
}
