import * as React from "react";
import type { ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { List } from "@/client/meeting/components/index.ts";
import { knownEnum as known } from "@/client/meeting/shared/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { OverviewItem, Section } from "@/client/meeting/regions/workspace/overview/components/index.ts";

interface SectionProps {
    detail: MeetingView;
}

const overviewKey = (kind: string, id: string): string => `${kind}:${id}`;

export const OverviewOpenItems = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const questionStatusIcon: Record<MeetingView["questions"][number]["status"], string> = {
        open: "🔘",
        answered: "✅",
        withdrawn: "⏹️",
        deferred: "⏸️"
    };
    const issueStatusIcon: Record<MeetingView["issues"][number]["status"], string> = {
        open: "🔘",
        resolved: "✅",
        deferred: "⏸️",
        out_of_scope: "🚫"
    };
    const riskActionIcon: Record<
        MeetingView["outcomes"]["riskDispositions"][number]["action"],
        string
    > = {
        accept: "✅",
        reject: "❌"
    };
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    const questions = archive?.questions ?? detail.questions;
    const issues = archive?.issues ?? detail.issues;
    const risks = archive?.riskDispositions ?? detail.outcomes.riskDispositions;
    return (
        <Section label={t("panel.overview.openItems")}>
            <List
                items={[
                    ...questions.map((item) => (
                        <OverviewItem
                            key={overviewKey("question", item.id)}
                            kind="question"
                            id={item.id}
                            sign={questionStatusIcon[item.status]}
                            text={`${item.text}: ${known("questionStatus", item.status, t)}`}
                        />
                    )),
                    ...issues.map((item) => (
                        <OverviewItem
                            key={overviewKey("issue", item.id)}
                            kind="issue"
                            id={item.id}
                            sign={issueStatusIcon[item.status]}
                            text={`${item.description}: ${known("issueStatus", item.status, t)}: ${known("issueClassification", item.classification, t)}: ${item.rationale}`}
                        />
                    )),
                    ...risks.map((item) => (
                        <OverviewItem
                            key={overviewKey("risk_disposition", item.id)}
                            kind="risk_disposition"
                            id={item.id}
                            sign={riskActionIcon[item.action]}
                            text={`${known("riskAction", item.action, t)}: ${item.scope}: ${item.rationale}`}
                        />
                    ))
                ]}
            />
        </Section>
    );
};
