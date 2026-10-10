import * as React from "react";
import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";
import { Modal, MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import type { MeetingView } from "@/protocol/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { knownEnum as known } from "@/client/meeting/shared/index.ts";
import styles from "./evidence-modal.module.css";

type EvidenceVersion = MeetingView["evidencePackages"][number]["currentVersion"];

const EvidenceText = ({ text }: { text: string }): ReactElement => {
    const t = useMeetingTranslate();
    const labels = useMemo(
        () => ({
            code: {
                copyLabel: t("panel.evidence.copyCode"),
                copiedLabel: t("panel.evidence.copiedCode")
            },
            footnotes: t("panel.evidence.footnotes")
        }),
        [t]
    );
    return (
        <div className={styles.markdown}>
            <MarkdownText text={text} labels={labels} variant="compact" />
        </div>
    );
};

const Field = ({
    label,
    children,
    markdown = false
}: {
    label: string;
    children: ReactNode;
    markdown?: boolean;
}): ReactElement => (
    <div className={styles.field}>
        <dt>{label}</dt>
        <dd>
            {markdown && typeof children === "string" ? <EvidenceText text={children} /> : children}
        </dd>
    </div>
);

export const EvidenceModal = ({
    version,
    title,
    contributorName,
    originalMessage,
    onClose
}: {
    version: EvidenceVersion | undefined;
    title: string;
    contributorName: string;
    originalMessage?: string;
    onClose: () => void;
}): ReactElement => {
    const t = useMeetingTranslate();
    const submittedAt = version
        ? new Intl.DateTimeFormat(navigator.language, {
              dateStyle: "medium",
              timeStyle: "medium"
          }).format(version.submittedAt)
        : "";
    return (
        <Modal
            open={version !== undefined}
            onClose={onClose}
            title={title}
            closeLabel={t("panel.overview.closeEvidence")}
            className={styles.modal}
            contentClassName={styles.content}
        >
            {version ? (
                <div className={styles.evidence}>
                    <div className={styles.metadata}>
                        <span>{contributorName}</span>
                        <span>
                            {known("evidenceStatus", version.status, t)}
                            {version.lastFailureReason ? (
                                <small>{version.lastFailureReason}</small>
                            ) : null}
                        </span>
                        <time dateTime={new Date(version.submittedAt).toISOString()}>
                            {submittedAt}
                        </time>
                    </div>
                    <div className={styles.body}>
                        <dl>
                            {version.summary ? (
                                <Field markdown label={t("panel.evidence.summary")}>
                                    {version.summary}
                                </Field>
                            ) : null}
                            {originalMessage ? (
                                <Field markdown label={t("panel.evidence.originalMessage")}>
                                    {originalMessage}
                                </Field>
                            ) : null}
                            <Field markdown label={t("panel.evidence.observation")}>
                                {version.observation}
                            </Field>
                            <Field markdown label={t("panel.evidence.interpretation")}>
                                {version.interpretation}
                            </Field>
                            <Field markdown label={t("panel.evidence.method")}>
                                {version.method}
                            </Field>
                        </dl>
                        {(
                            [
                                [t("panel.evidence.falsifiers"), version.falsifiers],
                                [t("panel.evidence.uncertainties"), version.uncertainties],
                                [t("panel.evidence.limitations"), version.limitations]
                            ] as const
                        ).map(([label, items]) => (
                            <section key={label}>
                                <h3>{label}</h3>
                                {items.length ? (
                                    <ul>
                                        {items.map((item, index) => (
                                            <li key={index}>
                                                <EvidenceText text={item.value} />
                                                {item.reason ? (
                                                    <EvidenceText text={item.reason} />
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p>{t("common.none")}</p>
                                )}
                            </section>
                        ))}
                        <section>
                            <h3>{t("panel.evidence.claims")}</h3>
                            {version.claims.length ? (
                                <ul>
                                    {version.claims.map((claim) => (
                                        <li key={claim.id}>
                                            <dl>
                                                <Field label="ID">{claim.id}</Field>
                                                <Field
                                                    markdown
                                                    label={t("panel.evidence.statement")}
                                                >
                                                    {claim.statement}
                                                </Field>
                                                <Field
                                                    markdown
                                                    label={t("panel.evidence.qualification")}
                                                >
                                                    {claim.qualification}
                                                </Field>
                                                <Field label={t("panel.evidence.materialIds")}>
                                                    {claim.materialIds.join("、") ||
                                                        t("common.none")}
                                                </Field>
                                            </dl>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>{t("common.none")}</p>
                            )}
                        </section>
                        <section>
                            <h3>{t("panel.evidence.materials")}</h3>
                            {version.materials.length ? (
                                <ul>
                                    {version.materials.map((material) => (
                                        <li key={material.id}>
                                            <dl>
                                                <Field label="ID">{material.id}</Field>
                                                <Field label={t("panel.evidence.kind")}>
                                                    {material.kind}
                                                </Field>
                                                <Field
                                                    markdown
                                                    label={t("panel.evidence.originator")}
                                                >
                                                    {material.originator}
                                                </Field>
                                                <Field
                                                    markdown
                                                    label={t("panel.evidence.originalSource")}
                                                >
                                                    {material.originalSource}
                                                </Field>
                                                <Field
                                                    label={t("panel.evidence.sourcePublishedAt")}
                                                >
                                                    {material.sourcePublishedAt}
                                                </Field>
                                                <Field label={t("panel.evidence.acquiredAt")}>
                                                    {material.acquiredAt}
                                                </Field>
                                                <Field label={t("panel.evidence.version")}>
                                                    {material.version}
                                                </Field>
                                                <Field label={t("panel.evidence.locator")}>
                                                    {material.locator}
                                                </Field>
                                                <Field label={t("panel.evidence.location")}>
                                                    {material.location}
                                                </Field>
                                                <Field
                                                    markdown
                                                    label={t(
                                                        "panel.evidence.verificationConditions"
                                                    )}
                                                >
                                                    {material.verificationConditions}
                                                </Field>
                                                <Field
                                                    markdown
                                                    label={t("panel.evidence.materialLimitations")}
                                                >
                                                    {material.limitations}
                                                </Field>
                                                <Field
                                                    label={t("panel.evidence.sharedDependencies")}
                                                >
                                                    {material.sharedDependencies.join("、") ||
                                                        t("common.none")}
                                                </Field>
                                                {material.reason ? (
                                                    <Field
                                                        markdown
                                                        label={t("panel.evidence.reason")}
                                                    >
                                                        {material.reason}
                                                    </Field>
                                                ) : null}
                                            </dl>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>{t("common.none")}</p>
                            )}
                        </section>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
};
