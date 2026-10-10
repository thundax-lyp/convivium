import * as React from "react";
import { useState } from "react";
import type { ReactElement } from "react";
import type { MeetingView } from "@/protocol/index.ts";
import { List } from "@/client/meeting/components/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import { knownEnum as known } from "@/client/meeting/shared/index.ts";
import {
    OverviewItem,
    Section
} from "@/client/meeting/regions/workspace/overview/components/index.ts";
import styles from "./records.module.css";
import { EvidenceModal } from "./evidence-modal.tsx";

interface SectionProps {
    detail: MeetingView;
}

type EvidencePair = {
    packageId: string;
    roundId: string | undefined;
    authorId: string;
    version: MeetingView["evidencePackages"][number]["currentVersion"];
    review: MeetingView["evidenceReviews"][number] | undefined;
};
type FormalMessage = MeetingView["messages"][number];
type Contribution = MeetingView["rounds"][number]["contributions"][number];
type ParticipationResponse = NonNullable<
    MeetingView["rounds"][number]["participationResponses"]
>[number];
type ContributorRecord =
    | {
          kind: "evidence";
          contributorId: string;
          id: string;
          pair: EvidencePair;
          messages: FormalMessage[];
      }
    | { kind: "message"; contributorId: string; id: string; message: FormalMessage }
    | { kind: "contribution"; contributorId: string; id: string; contribution: Contribution }
    | { kind: "participation"; contributorId: string; id: string; response: ParticipationResponse };

const overviewKey = (kind: string, id: string): string => `${kind}:${id}`;
const contributorNameOrder = new Intl.Collator("zh-CN", {
    numeric: true,
    sensitivity: "base"
});
const roundStatusIcon: Record<MeetingView["rounds"][number]["status"], string> = {
    open: "👉",
    published: "✅",
    aborted: "🛑"
};

const DeliveryItem = ({
    item
}: {
    item: MeetingView["reviewDeliveries"][number];
}): ReactElement => {
    const t = useMeetingTranslate();
    return (
        <OverviewItem
            kind="review_delivery"
            id={item.id}
            sign="•"
            text={`${t("panel.overview.delivery")}: ${item.id}: ${known("reviewDelivery", item.status, t)}${item.failureReason ? `: ${item.failureReason}` : ""}`}
        />
    );
};

const pairsForRound = (
    pairs: EvidencePair[],
    roundId: string,
    publishedIds: string[],
    archived: boolean
): EvidencePair[] => [
    ...publishedIds.flatMap((id) => {
        const pair = pairs.find((candidate) => candidate.version.id === id);
        return pair ? [pair] : [];
    }),
    ...(archived
        ? []
        : pairs.filter(
              (pair) => pair.roundId === roundId && !publishedIds.includes(pair.version.id)
          ))
];

export const OverviewRecords = ({ detail }: SectionProps): ReactElement => {
    const t = useMeetingTranslate();
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
    const rounds = detail.rounds;
    const archive =
        detail.lifecycle.status === "archived" && detail.archive?.status === "complete"
            ? detail.archive
            : undefined;
    const publications = archive?.publications ?? detail.publications;
    const messages = archive?.messages ?? detail.messages;
    const pairs: EvidencePair[] = archive
        ? archive.evidenceBundles.map((bundle) => ({
              packageId: bundle.packageId,
              roundId: publications.find((item) => item.finalVersionIds.includes(bundle.version.id))
                  ?.roundId,
              authorId: bundle.authorIdentityId,
              version: bundle.version,
              review: bundle.review
          }))
        : detail.evidencePackages.map((pkg) => ({
              packageId: pkg.id,
              roundId: pkg.roundId,
              authorId: pkg.authorId,
              version: pkg.currentVersion,
              review: detail.evidenceReviews.find(
                  (review) => review.versionId === pkg.currentVersion.id
              )
          }));
    const selectedPair = pairs.find((pair) => pair.version.id === selectedVersionId);
    const selectedVersion = selectedPair?.version;
    const nameFor = (identityId: string): string =>
        (archive?.identityProvenance ?? detail.identities).find(
            (identity) =>
                ("identityId" in identity ? identity.identityId : identity.id) === identityId
        )?.displayName ?? identityId;
    const visibleReviewIds = new Set(
        pairs.flatMap((pair) => (pair.review ? [pair.review.id] : []))
    );
    const unmatchedDeliveries = archive
        ? []
        : detail.reviewDeliveries.filter((item) => !visibleReviewIds.has(item.reviewId));
    const deliveryItem = (item: MeetingView["reviewDeliveries"][number]): ReactElement => (
        <DeliveryItem key={overviewKey("review_delivery", item.id)} item={item} />
    );
    return (
        <Section label={t("panel.overview.roundRecords")}>
            {rounds.length === 0 ? <p>{t("common.none")}</p> : null}
            {[...rounds]
                .sort((left, right) => left.openedAt - right.openedAt)
                .map((round) => {
                    const label = round.roundGoal.question;
                    const publication = publications.find((item) => item.roundId === round.id);
                    const publishedIds = publication?.finalVersionIds ?? [];
                    const roundPairs = pairsForRound(pairs, round.id, publishedIds, !!archive);
                    const roundMessages = publication
                        ? messages
                              .filter((item) => item.publicationId === publication.id)
                              .sort((left, right) => left.seq - right.seq)
                        : [];
                    const linkedMessageIds = new Set<string>();
                    const contributorRecords: ContributorRecord[] = roundPairs.map((pair) => {
                        const relatedMessages = roundMessages.filter(
                            (item) =>
                                item.actorId === pair.authorId &&
                                item.relatedIds.includes(pair.version.id)
                        );
                        relatedMessages.forEach((item) => linkedMessageIds.add(item.id));
                        return {
                            kind: "evidence",
                            contributorId: pair.authorId,
                            id: pair.version.id,
                            pair,
                            messages: relatedMessages
                        };
                    });
                    contributorRecords.push(
                        ...roundMessages
                            .filter((item) => !linkedMessageIds.has(item.id))
                            .map((message) => ({
                                kind: "message" as const,
                                contributorId: message.actorId,
                                id: message.id,
                                message
                            })),
                        ...round.contributions
                            .filter(
                                (item) =>
                                    !roundPairs.some((pair) => pair.packageId === item.packageId)
                            )
                            .map((contribution) => ({
                                kind: "contribution" as const,
                                contributorId: contribution.contributorId,
                                id: contribution.id,
                                contribution
                            })),
                        ...(round.participationResponses ?? [])
                            .filter(
                                (response) =>
                                    response.status === "declined" ||
                                    response.status === "no_response"
                            )
                            .map((response) => ({
                                kind: "participation" as const,
                                contributorId: response.contributorId,
                                id: response.contributorId,
                                response
                            }))
                    );
                    contributorRecords.sort(
                        (left, right) =>
                            contributorNameOrder.compare(
                                nameFor(left.contributorId),
                                nameFor(right.contributorId)
                            ) ||
                            left.contributorId.localeCompare(right.contributorId, "en") ||
                            left.id.localeCompare(right.id, "en")
                    );
                    const messageItem = (item: FormalMessage): ReactElement => (
                        <OverviewItem
                            key={overviewKey("formal_message", item.id)}
                            kind="formal_message"
                            id={item.id}
                            sign="💡"
                            text={item.body}
                            accessibleLabel={t("panel.overview.message")}
                            maxLines={3}
                        />
                    );
                    const renderRecord = (record: ContributorRecord): ReactElement => (
                        <div
                            key={`${record.kind}:${record.id}`}
                            className={styles.contributorRecord}
                        >
                            <h6>{nameFor(record.contributorId)}</h6>
                            <List
                                items={
                                    record.kind === "evidence"
                                        ? [
                                              ...record.messages.map(messageItem),
                                              ...(record.messages.length === 0 &&
                                              record.pair.version.summary
                                                  ? [
                                                        <OverviewItem
                                                            key={overviewKey(
                                                                "formal_message",
                                                                record.pair.version.id
                                                            )}
                                                            kind="formal_message"
                                                            id={record.pair.version.id}
                                                            sign="💡"
                                                            text={record.pair.version.summary}
                                                            accessibleLabel={t(
                                                                "panel.overview.message"
                                                            )}
                                                            maxLines={3}
                                                        />
                                                    ]
                                                  : []),
                                              ...(!record.pair.review
                                                  ? [
                                                        <OverviewItem
                                                            key={overviewKey(
                                                                "evidence_status",
                                                                record.pair.version.id
                                                            )}
                                                            kind="evidence_status"
                                                            id={record.pair.version.id}
                                                            sign={
                                                                record.pair.version.status ===
                                                                "validation_failed"
                                                                    ? "⚠️"
                                                                    : "•"
                                                            }
                                                            text={known(
                                                                "evidenceStatus",
                                                                record.pair.version.status,
                                                                t
                                                            )}
                                                        />
                                                    ]
                                                  : []),
                                              ...(record.pair.review
                                                  ? [
                                                        <OverviewItem
                                                            key={overviewKey(
                                                                "evidence_review",
                                                                record.pair.review.id
                                                            )}
                                                            kind="evidence_review"
                                                            id={record.pair.review.id}
                                                            sign="💬"
                                                            text={record.pair.review.scope}
                                                            accessibleLabel={t(
                                                                "panel.overview.review"
                                                            )}
                                                        />,
                                                        ...(archive
                                                            ? []
                                                            : detail.reviewDeliveries
                                                                  .filter(
                                                                      (item) =>
                                                                          item.reviewId ===
                                                                          record.pair.review?.id
                                                                  )
                                                                  .map(deliveryItem))
                                                    ]
                                                  : []),
                                              <OverviewItem
                                                  key={overviewKey(
                                                      "evidence_version",
                                                      record.pair.version.id
                                                  )}
                                                  kind="evidence_version"
                                                  id={record.pair.version.id}
                                                  sign={null}
                                                  text={
                                                      <button
                                                          type="button"
                                                          className={styles.evidenceButton}
                                                          aria-label={`${t("panel.overview.viewEvidence")}: ${nameFor(record.contributorId)} (${record.pair.version.id})`}
                                                          onClick={() =>
                                                              setSelectedVersionId(
                                                                  record.pair.version.id
                                                              )
                                                          }
                                                      >
                                                          {t("panel.overview.viewEvidence")}
                                                      </button>
                                                  }
                                              />
                                          ]
                                        : record.kind === "message"
                                          ? [messageItem(record.message)]
                                          : record.kind === "contribution"
                                            ? [
                                                  <OverviewItem
                                                      key={overviewKey(
                                                          "contribution",
                                                          record.contribution.id
                                                      )}
                                                      kind="contribution"
                                                      id={record.contribution.id}
                                                      sign={
                                                          record.contribution.status ===
                                                              "preparing" ||
                                                          record.contribution.status ===
                                                              "registered" ||
                                                          record.contribution.status ===
                                                              "under_review" ||
                                                          record.contribution.status ===
                                                              "awaiting_response"
                                                              ? "•"
                                                              : "⚠️"
                                                      }
                                                      text={`${known("contribution", record.contribution.status, t)}${record.contribution.failure ? `: ${record.contribution.failure.failureSummary}` : record.contribution.exitReason ? `: ${record.contribution.exitReason}` : ""}`}
                                                  />
                                              ]
                                            : [
                                                  <OverviewItem
                                                      key={overviewKey("participation", record.id)}
                                                      kind="participation"
                                                      id={record.id}
                                                      sign="•"
                                                      text={t(
                                                          `enum.participation.${record.response.status}`
                                                      )}
                                                  />
                                              ]
                                }
                            />
                        </div>
                    );
                    return (
                        <section
                            key={round.id}
                            aria-label={`${label}: ${known("round", round.status, t)}`}
                            className={styles.round}
                            data-overview-key={overviewKey("round", round.id)}
                            tabIndex={-1}
                        >
                            <h5 aria-label={`${label}: ${known("round", round.status, t)}`}>
                                <span aria-hidden="true">{roundStatusIcon[round.status]}</span>{" "}
                                {label}
                            </h5>
                            {publication ? (
                                <List
                                    items={[
                                        <OverviewItem
                                            key={overviewKey("publication", publication.id)}
                                            kind="publication"
                                            id={publication.id}
                                            sign="•"
                                            text={`${t("panel.overview.publication")}: ${publication.id}`}
                                            maxLines={3}
                                        />
                                    ]}
                                />
                            ) : null}
                            {contributorRecords.map(renderRecord)}
                            {!publication && contributorRecords.length === 0 ? (
                                <p>{t("common.none")}</p>
                            ) : null}
                        </section>
                    );
                })}
            {unmatchedDeliveries.length > 0 ? (
                <div className={styles.unmatchedDeliveries}>
                    <h5>{t("panel.overview.otherDeliveries")}</h5>
                    <List items={unmatchedDeliveries.map(deliveryItem)} />
                </div>
            ) : null}
            <EvidenceModal
                version={selectedVersion}
                title={
                    rounds.find((round) => round.id === selectedPair?.roundId)?.roundGoal
                        .question ?? t("panel.overview.evidenceItem")
                }
                contributorName={selectedPair ? nameFor(selectedPair.authorId) : ""}
                originalMessage={
                    selectedVersion?.summary === undefined
                        ? messages.find(
                              (message) =>
                                  message.kind === "round_evidence" &&
                                  message.relatedIds.includes(selectedVersionId ?? "")
                          )?.body
                        : undefined
                }
                onClose={() => setSelectedVersionId(null)}
            />
        </Section>
    );
};
