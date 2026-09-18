import type { FormalMessageV1, MeetingState, OpaqueId, PublicationV1 } from "@/domain/index.js";
import { isRoundClosableV1 } from "./round-v1.js";
import { isObjectiveSatisfiedV1 } from "./outcome-v1.js";
import { rejectedTransitionV1 as reject, type MeetingTransitionResultV1 } from "./result-v1.js";
type Input = {
    roundId: OpaqueId;
    managerId: OpaqueId;
    publicationId: OpaqueId;
    messageIds: readonly OpaqueId[];
    now: number;
};
function body(version: {
    observation: string;
    interpretation: string;
    method: string;
    claims: readonly { statement: string; qualification: string; materialIds: readonly string[] }[];
    falsifiers: readonly { value: string; reason?: string }[];
    uncertainties: readonly { value: string; reason?: string }[];
    limitations: readonly { value: string; reason?: string }[];
}) {
    const suffix = (reason?: string) => (reason === undefined ? "" : `｜原因：${reason}`);
    return [
        `观察：${version.observation}`,
        `解释：${version.interpretation}`,
        `方法：${version.method}`,
        "主张：",
        ...version.claims.map(
            (claim) =>
                `- ${claim.statement}｜限定：${claim.qualification}｜资料：${claim.materialIds.join("，")}`
        ),
        "反证：",
        ...version.falsifiers.map((item) => `- ${item.value}${suffix(item.reason)}`),
        "不确定性：",
        ...version.uncertainties.map((item) => `- ${item.value}${suffix(item.reason)}`),
        "限制：",
        ...version.limitations.map((item) => `- ${item.value}${suffix(item.reason)}`)
    ].join("\n");
}
export function publishRoundV1(state: MeetingState, input: Input): MeetingTransitionResultV1 {
    if (
        !input.roundId.trim() ||
        !input.managerId.trim() ||
        !input.publicationId.trim() ||
        !Number.isSafeInteger(input.now) ||
        input.now < 0
    )
        return reject(state, "INVALID_ARGUMENT", "invalid publication input");
    const round = state.rounds.find((candidate) => candidate.id === input.roundId);
    if (!round) return reject(state, "NOT_FOUND", "round not found");
    const agenda = state.agenda.find((candidate) => candidate.id === round.agendaId);
    const manager = state.identities.find((candidate) => candidate.id === input.managerId);
    if (
        !agenda ||
        !manager ||
        !manager.roles.includes("manager") ||
        (manager.agendaResponsibilityIds.length > 0 &&
            !manager.agendaResponsibilityIds.includes(round.agendaId))
    )
        return reject(state, "UNAUTHORIZED", "manager is not assigned to agenda");
    if (!isRoundClosableV1(state, round.id))
        return reject(state, "ROUND_NOT_CLOSABLE", "round is not closable");
    if (input.now >= state.createdAt + state.limits.maxDurationMs)
        return reject(state, "PRECONDITION_FAILED", "meeting duration has elapsed");
    const packages = round.contributionIds
        .map((id) => state.contributions.find((candidate) => candidate.id === id))
        .filter((candidate) => candidate?.packageId !== undefined)
        .map((candidate) => state.evidencePackages.find((pkg) => pkg.id === candidate!.packageId)!);
    if (
        packages.some((pkg) => {
            const review = state.reviews.find(
                (candidate) => candidate.versionId === pkg.currentVersionId
            );
            return (
                review === undefined ||
                !state.reviewDeliveries.some(
                    (delivery) => delivery.reviewId === review.id && delivery.status === "sent"
                )
            );
        })
    )
        return reject(state, "ROUND_NOT_CLOSABLE", "current evidence review is not delivered");
    const finalVersionIds = packages.map((pkg) => pkg.currentVersionId);
    const finalReviewIds = packages.map(
        (pkg) => state.reviews.find((review) => review.versionId === pkg.currentVersionId)!.id
    );
    if (input.messageIds.length !== finalVersionIds.length)
        return reject(state, "INVALID_ARGUMENT", "message count does not match final versions");
    if (state.publications.some((publication) => publication.id === input.publicationId))
        return reject(state, "INVALID_ARGUMENT", "publication id already exists");
    const publicationSeq =
        Math.max(
            0,
            ...state.publications.map((publication) => publication.seq),
            ...state.messages.map((message) => message.seq)
        ) + 1;
    const messages: FormalMessageV1[] = packages.map((pkg, index) => ({
        id: input.messageIds[index],
        seq: publicationSeq + 1 + index,
        actorId: pkg.authorId,
        agendaId: round.agendaId,
        kind: "round_evidence",
        body: body(pkg.versions.find((version) => version.id === pkg.currentVersionId)!),
        publicationId: input.publicationId,
        relatedIds: [pkg.currentVersionId, finalReviewIds[index]],
        createdAt: input.now
    }));
    if (
        new Set(input.messageIds).size !== input.messageIds.length ||
        input.messageIds.some((id) => state.messages.some((message) => message.id === id))
    )
        return reject(state, "INVALID_ARGUMENT", "message id already exists");
    const nextFormalMessageCount = state.messages.length + messages.length;
    if (nextFormalMessageCount > state.limits.maxFormalMessages)
        return reject(state, "PRECONDITION_FAILED", "publication exceeds message budget");
    const publication: PublicationV1 = {
        id: input.publicationId,
        roundId: round.id,
        seq: publicationSeq,
        finalVersionIds,
        finalReviewIds,
        publishedAt: input.now,
        exitReasons: round.contributionIds.map(
            (id) => state.contributions.find((candidate) => candidate.id === id)?.exitReason ?? ""
        )
    };
    const idleContributors = state.identities.filter(
        (identity) =>
            identity.roles.includes("contributor") &&
            (identity.agendaResponsibilityIds.length === 0 ||
                identity.agendaResponsibilityIds.includes(round.agendaId)) &&
            !state.tasks.some(
                (task) =>
                    task.assigneeId === identity.id &&
                    (task.status === "open" || task.status === "claimed")
            )
    );
    const nextState: MeetingState = {
        ...state,
        version: state.version + 1,
        updatedAt: input.now,
        rounds: state.rounds.map((candidate) =>
            candidate.id === round.id
                ? { ...candidate, status: "published", publicationId: publication.id }
                : candidate
        ),
        contributions: state.contributions.map((contribution) =>
            round.contributionIds.includes(contribution.id) &&
            contribution.status === "awaiting_response"
                ? { ...contribution, status: "closed" as const }
                : contribution
        ),
        publications: [...state.publications, publication],
        messages: [...state.messages, ...messages]
    };
    const exhaustedState: MeetingState =
        nextFormalMessageCount === state.limits.maxFormalMessages
            ? {
                  ...nextState,
                  lifecycle: isObjectiveSatisfiedV1(nextState)
                      ? {
                            status: "converging",
                            changedAt: input.now,
                            changedBy: input.managerId
                        }
                      : {
                            status: "paused",
                            changedAt: input.now,
                            changedBy: input.managerId,
                            reason: "message budget exhausted"
                        }
              }
            : nextState;
    return {
        kind: "accepted",
        state: exhaustedState,
        relatedIds: [publication.id, ...input.messageIds],
        effectRequests: messages.flatMap((message) =>
            idleContributors.map((identity) => ({
                kind: "agent_notice" as const,
                noticeKind: "transcript_update" as const,
                recipientId: identity.id,
                agendaId: message.agendaId,
                publicMessageId: message.id
            }))
        )
    };
}
