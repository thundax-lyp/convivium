import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { List } from "@/client/meeting/components/index.ts";
import { knownEnum as known } from "@/client/meeting/shared/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import {
    OverviewItem,
    Section
} from "@/client/meeting/regions/workspace/overview/components/index.ts";

interface SectionProps {
    detail: MeetingView;
}

const overviewKey = (kind: string, id: string): string => `${kind}:${id}`;

export const OverviewOutcomes = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const terminationIcon: Record<
        NonNullable<MeetingView["outcomes"]["termination"]>["outcome"],
        string
    > = {
        completed: "✅",
        partial: "🌓",
        no_consensus: "⚖️",
        cancelled: "🛑",
        failed: "❌"
    };
    const decisionOutcomeIcon: Record<
        MeetingView["outcomes"]["decisions"][number]["outcome"],
        string
    > = {
        adopt: "✅",
        reject: "❌",
        defer: "⏸️"
    };
    const decisionStatusIcon: Record<
        MeetingView["outcomes"]["decisions"][number]["status"],
        string
    > = {
        accepted: "✅",
        superseded: "⏹️",
        revoked: "🚫"
    };
    const completionStatusIcon: Record<
        MeetingView["outcomes"]["completionFacts"][number]["status"],
        string
    > = {
        active: "✅",
        superseded: "⏹️",
        revoked: "🚫"
    };
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    const candidates =
        archive?.decisionCandidates ?? detail.outcomes.pendingDecisionCandidates ?? [];
    const decisions = archive?.decisions ?? detail.outcomes.decisions;
    const facts = archive?.completionFacts ?? detail.outcomes.completionFacts;
    const termination = archive?.termination ?? detail.outcomes.termination;
    return (
        <Section label={t("panel.overview.outcomes")}>
            <List
                items={[
                    ...(termination
                        ? [
                              <OverviewItem
                                  key={termination.id}
                                  kind="termination"
                                  id={termination.id}
                                  accessibleLabel={`${t("panel.overview.meetingOutcome")}: ${known("terminationOutcome", termination.outcome, t)}`}
                                  sign={terminationIcon[termination.outcome]}
                                  text={termination.reason}
                              />
                          ]
                        : []),
                    ...candidates.map((item) => (
                        <OverviewItem
                            key={overviewKey("decision_candidate", item.id)}
                            kind="decision_candidate"
                            id={item.id}
                            sign={decisionOutcomeIcon[item.outcome]}
                            text={`${item.id}: ${known("decisionOutcome", item.outcome, t)}: ${item.rationale}`}
                        />
                    )),
                    ...decisions.map((item) => (
                        <OverviewItem
                            key={overviewKey("decision", item.id)}
                            kind="decision"
                            id={item.id}
                            sign={decisionStatusIcon[item.status]}
                            text={`${item.id}: ${known("decisionOutcome", item.outcome, t)}: ${known("decisionStatus", item.status, t)}: ${item.rationale}`}
                        />
                    )),
                    ...facts.map((item) => (
                        <OverviewItem
                            key={overviewKey("completion_fact", item.id)}
                            kind="completion_fact"
                            id={item.id}
                            sign={completionStatusIcon[item.status]}
                            text={`${item.statement}: ${known("completionStatus", item.status, t)}: ${item.rationale}`}
                        />
                    ))
                ]}
            />
        </Section>
    );
};
