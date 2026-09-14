import type { ContributionBodyV1 } from "@/protocol/index.js";
import type { ContributionClaims, ContributionDraft } from "@/domain/index.js";

export function preparePublicSubmission(
    body: ContributionBodyV1,
    source: { messageId: string; idSeed: string; agendaItemId: string; now: number }
): Pick<ContributionDraft, "message" | "claims"> {
    const changes = body.changes;
    return {
        message: {
            id: source.messageId,
            content: body.content,
            kind: body.kind,
            mentions: body.mentions,
            ...(body.replyTo === undefined ? {} : { replyTo: body.replyTo }),
            taskIds: body.taskIds,
            agendaRelation: body.agendaRelation,
            createdAt: source.now,
            ...(body.minutesDraft === undefined
                ? {}
                : {
                      minutesDraft: {
                          status: "draft" as const,
                          coverage: { ...body.minutesDraft.coverage },
                          referencedMessageIds: [...body.minutesDraft.referencedMessageIds]
                      }
                  })
        },
        claims: {
            questions: (changes.questions ?? []).map((claim, index) => ({
                id: `question-${source.idSeed}-${index + 1}`,
                text: claim.text.trim(),
                ...(claim.directedTo === undefined ? {} : { directedTo: claim.directedTo }),
                blocking: claim.blocking,
                affectedOutputIds: [...(claim.affectedOutputIds ?? [])],
                affectedCriterionIds: [...(claim.affectedCriterionIds ?? [])],
                violatedConstraintIds: [...(claim.violatedConstraintIds ?? [])],
                createdAt: source.now
            })),
            issues: (changes.issues ?? []).map((claim, index) => ({
                id: `issue-${source.idSeed}-${index + 1}`,
                title: claim.title,
                description: claim.description,
                affectedOutputIds: claim.affectedOutputIds,
                affectedCriterionIds: claim.affectedCriterionIds,
                violatedConstraintIds: claim.violatedConstraintIds,
                impact: claim.impact,
                urgency: claim.urgency,
                safeDefaultAvailable: claim.safeDefaultAvailable,
                ...(claim.riskLevel === undefined ? {} : { riskLevel: claim.riskLevel })
            })),
            proposals: (changes.proposals ?? []).map((claim, index) => ({
                id: `${source.idSeed}-proposal-${index + 1}`,
                ...(claim.proposalId === undefined ? {} : { proposalId: claim.proposalId }),
                ...(claim.expectedRevision === undefined
                    ? {}
                    : { expectedRevision: claim.expectedRevision }),
                title: claim.title,
                description: claim.description,
                now: source.now
            })),
            positions: (changes.positions ?? []).map((claim, index) => ({
                id: `${source.idSeed}-position-${index + 1}`,
                proposalId: claim.proposalId,
                proposalRevision: claim.proposalRevision,
                position: claim.position,
                ...(claim.reason === undefined ? {} : { reason: claim.reason }),
                blocking: claim.blocking,
                now: source.now
            })),
            agendaCandidates: (changes.agendaCandidates ?? []).map((claim, index) => ({
                id: `${source.idSeed}-agenda-candidate-${index + 1}`,
                title: claim.title,
                reason: claim.reason,
                relationToActiveAgenda: claim.relationToActiveAgenda,
                urgency: claim.urgency,
                suggestedParticipants: claim.suggestedParticipants,
                now: source.now
            })),
            decisionCandidates: (changes.decisionProposals ?? []).map((claim, index) => ({
                id: `decision-candidate-${source.idSeed}-${index + 1}`,
                proposalId: claim.proposalId,
                proposalRevision: claim.proposalRevision,
                statement: claim.statement,
                rationale: claim.rationale,
                sourceMessageId: source.messageId,
                agendaItemId: source.agendaItemId,
                createdAt: source.now
            }))
        } as ContributionClaims
    };
}
