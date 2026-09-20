import { createElement, type ReactElement } from "react";
import type { MeetingViewV1 } from "@/protocol/index.js";
import { mapMeetingPanelView } from "./meeting-panel-view.js";

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

function list(values: readonly string[]): ReactElement {
    return values.length === 0
        ? createElement("p", null, "None")
        : createElement(
              "ul",
              null,
              values.map((value) => createElement("li", { key: value }, value))
          );
}

export function renderObservabilitySections(viewInput: MeetingViewV1): ReactElement {
    const view = mapMeetingPanelView(viewInput);
    const activeAgenda = view.agenda.find((item) => item.status === "active");
    return createElement(
        "div",
        null,
        section(
            "Meeting summary",
            createElement(
                "dl",
                null,
                row("Meeting version", String(view.version)),
                row("Lifecycle", view.lifecycle.status),
                row("Objective", view.objective.statement),
                row("Active agenda", activeAgenda?.title ?? "None")
            )
        ),
        section(
            "Rounds",
            createElement(
                "ul",
                null,
                view.rounds.map((round) =>
                    createElement(
                        "li",
                        { key: round.id },
                        `${round.id}: ${round.status} (${round.contributions.length} contributions)`
                    )
                )
            )
        ),
        section(
            "Evidence and reviews",
            createElement(
                "dl",
                null,
                row("Visible evidence packages", String(view.evidencePackages.length)),
                row("Visible evidence reviews", String(view.evidenceReviews.length)),
                row("Publications", String(view.publications.length))
            )
        ),
        section("Formal messages", list(view.messages.map((message) => message.body))),
        section(
            "Outcomes",
            createElement(
                "dl",
                null,
                row("Decisions", String(view.outcomes.decisions.length)),
                row("Completion facts", String(view.outcomes.completionFacts.length)),
                row("Issues", String(view.issues.length))
            )
        ),
        view.archive === undefined
            ? null
            : section(
                  "Archive",
                  createElement(
                      "dl",
                      null,
                      row("Archive status", view.archive.status),
                      row("Archive version", String(view.archive.publicSnapshotVersion)),
                      row("Archive messages", String(view.archive.messages.length))
                  )
              )
    );
}
