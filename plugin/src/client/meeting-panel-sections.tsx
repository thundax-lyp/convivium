import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.js";
import type { MeetingLocaleKey, MeetingTranslate } from "./locales.js";
import { mapMeetingPanelView } from "./meeting-panel-view.js";

const lifecycleKeys: Record<MeetingView["lifecycle"]["status"], MeetingLocaleKey> = {
    preparing: "enum.lifecycle.preparing",
    running: "enum.lifecycle.running",
    paused: "enum.lifecycle.paused",
    converging: "enum.lifecycle.converging",
    ending: "enum.lifecycle.ending",
    terminal: "enum.lifecycle.terminal",
    archiving: "enum.lifecycle.archiving",
    archived: "enum.lifecycle.archived"
};

const roundStatusKeys: Record<MeetingView["rounds"][number]["status"], MeetingLocaleKey> = {
    open: "enum.round.open",
    published: "enum.round.published",
    aborted: "enum.round.aborted"
};

const archiveStatusKeys: Record<NonNullable<MeetingView["archive"]>["status"], MeetingLocaleKey> = {
    pending: "enum.archive.pending",
    complete: "enum.archive.complete",
    failed: "enum.archive.failed"
};

export const lifecycleLabel = (
    status: MeetingView["lifecycle"]["status"],
    t: MeetingTranslate
): string => {
    return t(lifecycleKeys[status]);
};

const row = (label: string, value: string): ReactElement => {
    return (
        <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
};

const section = (label: string, content: ReactElement): ReactElement => {
    return (
        <section aria-label={label}>
            <h4>{label}</h4>
            {content}
        </section>
    );
};

const list = (values: readonly string[], t: MeetingTranslate): ReactElement => {
    return values.length === 0 ? (
        <p>{t("common.none")}</p>
    ) : (
        <ul>
            {values.map((value) => (
                <li key={value}>{value}</li>
            ))}
        </ul>
    );
};

export const renderObservabilitySections = (
    viewInput: MeetingView,
    t: MeetingTranslate
): ReactElement => {
    const view = mapMeetingPanelView(viewInput);
    const activeAgenda = view.agenda.find((item) => item.status === "active");
    return (
        <div>
            {section(
                t("panel.summary.title"),
                <dl>
                    {row(t("panel.summary.version"), String(view.version))}
                    {row(t("panel.summary.lifecycle"), lifecycleLabel(view.lifecycle.status, t))}
                    {row(t("panel.summary.objective"), view.objective.statement)}
                    {row(t("panel.summary.activeAgenda"), activeAgenda?.title ?? t("common.none"))}
                </dl>
            )}
            {section(
                t("panel.rounds.title"),
                <ul>
                    {view.rounds.map((round) => (
                        <li key={round.id}>
                            {t("panel.rounds.summary", {
                                id: round.id,
                                status: t(roundStatusKeys[round.status]),
                                count: round.contributions.length
                            })}
                        </li>
                    ))}
                </ul>
            )}
            {section(
                t("panel.evidenceReviews.title"),
                <dl>
                    {row(
                        t("panel.evidenceReviews.visiblePackages"),
                        String(view.evidencePackages.length)
                    )}
                    {row(
                        t("panel.evidenceReviews.visibleReviews"),
                        String(view.evidenceReviews.length)
                    )}
                    {row(t("panel.evidenceReviews.publications"), String(view.publications.length))}
                </dl>
            )}
            {section(
                t("panel.formalMessages.title"),
                list(
                    view.messages.map((message) => message.body),
                    t
                )
            )}
            {section(
                t("panel.outcomes.title"),
                <dl>
                    {row(t("panel.outcomes.decisions"), String(view.outcomes.decisions.length))}
                    {row(
                        t("panel.outcomes.completionFacts"),
                        String(view.outcomes.completionFacts.length)
                    )}
                    {row(t("panel.outcomes.issues"), String(view.issues.length))}
                </dl>
            )}
            {view.archive === undefined
                ? null
                : section(
                      t("panel.archive.title"),
                      <dl>
                          {row(
                              t("panel.archive.status"),
                              t(archiveStatusKeys[view.archive.status])
                          )}
                          {row(
                              t("panel.archive.version"),
                              String(view.archive.publicSnapshotVersion)
                          )}
                          {row(t("panel.archive.messages"), String(view.archive.messages.length))}
                      </dl>
                  )}
        </div>
    );
};
