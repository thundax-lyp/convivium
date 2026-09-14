import Schema from "@deepseek-ai/schemastery";
import { TurnSubmissionSchema } from "./commands.js";
import { ProtocolVersionSchema } from "./schema.js";
import type {
    ContributionBodyV1,
    ContributionCommandV1,
    ContributionResultV1,
    EvidenceMaterialV1,
    ReadContributionInputV1
} from "./types.js";

const phases = [
    "preparing",
    "boundary_review",
    "returned",
    "captain_action",
    "published",
    "cancelled"
] as const;
const evidenceKinds = ["web", "document", "data", "experiment", "code", "interview"] as const;
const verdicts = ["supports", "partially_supports", "does_not_support", "unverifiable"] as const;
const bodyKeys = [
    "kind",
    "content",
    "mentions",
    "replyTo",
    "taskIds",
    "agendaRelation",
    "changes",
    "completionClaims",
    "minutesDraft"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: object, expected: readonly string[], label: string): void {
    const actual = Object.keys(value).sort();
    const required = [...expected].sort();
    if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
        throw new TypeError(`${label} has unexpected fields`);
    }
}

function requiredText(value: unknown, label: string, max = 256): string {
    if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
    const normalized = value.trim();
    if (!normalized || normalized.length > max) throw new TypeError(`${label} is invalid`);
    return normalized;
}

function nonNegativeInteger(value: unknown, label: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative safe integer`);
    }
    return value;
}

function uniqueTextArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    const normalized = value.map((item) => requiredText(item, label));
    if (new Set(normalized).size !== normalized.length)
        throw new TypeError(`${label} must be unique`);
    return normalized;
}

function canonicalBytes(value: object): number {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function normalizeBody(value: unknown): ContributionBodyV1 {
    if (!isRecord(value)) throw new TypeError("body must be an object");
    const expected = bodyKeys.filter((key) => Object.hasOwn(value, key));
    for (const key of [
        "kind",
        "content",
        "mentions",
        "taskIds",
        "agendaRelation",
        "changes"
    ] as const) {
        if (!Object.hasOwn(value, key)) throw new TypeError(`body requires ${key}`);
    }
    assertExactKeys(value, expected, "ContributionBodyV1");
    const validated = TurnSubmissionSchema({
        protocolVersion: 1,
        meetingId: "contribution-wire",
        turnId: "contribution-wire",
        stepId: "contribution-wire",
        attemptId: "contribution-wire",
        deliveryId: "contribution-wire",
        agendaItemId: "contribution-wire",
        ...value
    });
    if (!Array.isArray(validated.taskIds) || validated.taskIds.length !== 0) {
        throw new TypeError("Contribution body taskIds must be empty");
    }
    const completion = validated.completionClaims as Record<string, unknown> | undefined;
    for (const claims of [completion?.outputClaims, completion?.criterionClaims]) {
        if (
            Array.isArray(claims) &&
            claims.some(
                (claim) =>
                    isRecord(claim) && Array.isArray(claim.taskIds) && claim.taskIds.length > 0
            )
        ) {
            throw new TypeError("Contribution completion claim taskIds must be empty");
        }
    }
    return Object.fromEntries(expected.map((key) => [key, validated[key]])) as ContributionBodyV1;
}

function normalizeMaterial(value: unknown): EvidenceMaterialV1 {
    if (!isRecord(value)) throw new TypeError("material must be an object");
    const required = [
        "title",
        "kind",
        "source",
        "sourceDate",
        "collectedAt",
        "locator",
        "observation",
        "methodAndConditions",
        "limitations",
        "dependencies",
        "material"
    ];
    const expected = [...required, ...(Object.hasOwn(value, "code") ? ["code"] : [])];
    assertExactKeys(value, expected, "EvidenceMaterialV1");
    if (!evidenceKinds.includes(value.kind as (typeof evidenceKinds)[number]))
        throw new TypeError("Invalid evidence kind");
    const material = value.material;
    if (!isRecord(material) || (material.kind !== "text" && material.kind !== "reference"))
        throw new TypeError("Invalid evidence material");
    const normalizedMaterial =
        material.kind === "text"
            ? (() => {
                  assertExactKeys(material, ["kind", "text"], "text material");
                  return {
                      kind: "text" as const,
                      text: requiredText(material.text, "material.text", 8192)
                  };
              })()
            : (() => {
                  assertExactKeys(material, ["kind", "uri", "sourceVersion"], "reference material");
                  const uri = requiredText(material.uri, "material.uri", 1024);
                  if (!/^https:\/\//u.test(uri) || /https:\/\/[^/]*@/u.test(uri))
                      throw new TypeError("material.uri must be an HTTPS URL without credentials");
                  return {
                      kind: "reference" as const,
                      uri,
                      sourceVersion: requiredText(
                          material.sourceVersion,
                          "material.sourceVersion",
                          1024
                      )
                  };
              })();
    let code: EvidenceMaterialV1["code"];
    if (value.kind === "code") {
        if (!isRecord(value.code)) throw new TypeError("code evidence requires code metadata");
        assertExactKeys(
            value.code,
            [
                "repository",
                "revision",
                "pathsAndSymbols",
                "patchEvidenceKeys",
                "validation",
                "reproduction",
                "expected",
                "observed",
                "notCovered"
            ],
            "code evidence"
        );
        if (value.code.validation !== "static_only" && value.code.validation !== "executed")
            throw new TypeError("Invalid code validation");
        code = {
            repository: requiredText(value.code.repository, "code.repository", 1024),
            revision: requiredText(value.code.revision, "code.revision", 1024),
            pathsAndSymbols: requiredText(value.code.pathsAndSymbols, "code.pathsAndSymbols", 2048),
            patchEvidenceKeys: uniqueTextArray(
                value.code.patchEvidenceKeys,
                "code.patchEvidenceKeys"
            ),
            validation: value.code.validation,
            reproduction: requiredText(value.code.reproduction, "code.reproduction", 2048),
            expected: requiredText(value.code.expected, "code.expected", 2048),
            observed: requiredText(value.code.observed, "code.observed", 2048),
            notCovered: requiredText(value.code.notCovered, "code.notCovered", 2048)
        };
    } else if (Object.hasOwn(value, "code"))
        throw new TypeError("Only code evidence may contain code metadata");
    const normalized: EvidenceMaterialV1 = {
        title: requiredText(value.title, "title"),
        kind: value.kind as EvidenceMaterialV1["kind"],
        source: requiredText(value.source, "source", 1024),
        sourceDate: requiredText(value.sourceDate, "sourceDate", 1024),
        collectedAt: requiredText(value.collectedAt, "collectedAt", 1024),
        locator: requiredText(value.locator, "locator", 1024),
        observation: requiredText(value.observation, "observation", 2048),
        methodAndConditions: requiredText(value.methodAndConditions, "methodAndConditions", 2048),
        limitations: requiredText(value.limitations, "limitations", 2048),
        dependencies: requiredText(value.dependencies, "dependencies", 2048),
        material: normalizedMaterial,
        ...(code ? { code } : {})
    };
    if (canonicalBytes(normalized) > 8192)
        throw new TypeError("Evidence material exceeds 8192 UTF-8 bytes");
    return normalized;
}

function normalizeCommand(value: unknown): ContributionCommandV1 {
    if (!isRecord(value)) throw new TypeError("Contribution command must be an object");
    const action = value.action;
    const baseKeys = [
        "protocolVersion",
        "meetingId",
        "requestId",
        "expectedMeetingVersion",
        "action"
    ];
    const actionKeys: Record<string, readonly string[]> = {
        assign: [
            "participantId",
            "agendaItemId",
            "instruction",
            "targetIds",
            "requiredForCompletion",
            "requiresEvidenceReview"
        ],
        save_evidence: [
            "contributionId",
            "generation",
            "evidenceId",
            "expectedEvidenceRevision",
            "material"
        ],
        submit: [
            "contributionId",
            "generation",
            "expectedDraftRevision",
            "basedOnSeq",
            "body",
            "citations"
        ],
        boundary_review: [
            "contributionId",
            "generation",
            "draftRevision",
            "decision",
            "reason",
            "checkedThroughSeq"
        ],
        evidence_review: ["contributionId", "generation", "draftRevision", "reviews"],
        retry: ["contributionId", "generation", "reason"],
        cancel: ["contributionId", "generation", "reason"],
        notify_manager: ["reason"]
    };
    if (typeof action !== "string" || !actionKeys[action])
        throw new TypeError("Unknown contribution action");
    const expected = [
        ...baseKeys,
        ...actionKeys[action].filter((key) => key !== "evidenceId" || Object.hasOwn(value, key))
    ];
    assertExactKeys(value, expected, "ContributionCommandV1");
    const base = {
        protocolVersion: ProtocolVersionSchema(value.protocolVersion as 1) as 1,
        meetingId: requiredText(value.meetingId, "meetingId"),
        requestId: requiredText(value.requestId, "requestId"),
        expectedMeetingVersion: nonNegativeInteger(
            value.expectedMeetingVersion,
            "expectedMeetingVersion"
        )
    };
    const contribution = Object.hasOwn(value, "contributionId")
        ? {
              contributionId: requiredText(value.contributionId, "contributionId"),
              generation: nonNegativeInteger(value.generation, "generation")
          }
        : {};
    let normalized!: ContributionCommandV1;
    switch (action) {
        case "assign":
            normalized = {
                ...base,
                action,
                participantId: requiredText(value.participantId, "participantId"),
                agendaItemId: requiredText(value.agendaItemId, "agendaItemId"),
                instruction: requiredText(value.instruction, "instruction", 2048),
                targetIds: uniqueTextArray(value.targetIds, "targetIds"),
                requiredForCompletion: Boolean(value.requiredForCompletion),
                requiresEvidenceReview: Boolean(value.requiresEvidenceReview)
            } as ContributionCommandV1;
            if (
                typeof value.requiredForCompletion !== "boolean" ||
                typeof value.requiresEvidenceReview !== "boolean"
            )
                throw new TypeError("assign flags must be booleans");
            break;
        case "save_evidence":
            normalized = {
                ...base,
                action,
                ...contribution,
                ...(Object.hasOwn(value, "evidenceId")
                    ? { evidenceId: requiredText(value.evidenceId, "evidenceId") }
                    : {}),
                expectedEvidenceRevision: nonNegativeInteger(
                    value.expectedEvidenceRevision,
                    "expectedEvidenceRevision"
                ),
                material: normalizeMaterial(value.material)
            } as ContributionCommandV1;
            break;
        case "submit": {
            const citations = Array.isArray(value.citations)
                ? value.citations.map((citation) => {
                      if (!isRecord(citation)) throw new TypeError("Invalid citation");
                      assertExactKeys(
                          citation,
                          ["evidenceKey", "claim", "locator", "inference"],
                          "EvidenceCitationV1"
                      );
                      return {
                          evidenceKey: requiredText(citation.evidenceKey, "evidenceKey"),
                          claim: requiredText(citation.claim, "claim", 1024),
                          locator: requiredText(citation.locator, "locator", 1024),
                          inference: requiredText(citation.inference, "inference", 1024)
                      };
                  })
                : (() => {
                      throw new TypeError("citations must be an array");
                  })();
            if (
                citations.length > 8 ||
                new Set(
                    citations.map((citation) => `${citation.evidenceKey}\u0000${citation.claim}`)
                ).size !== citations.length
            )
                throw new TypeError("Invalid citations");
            normalized = {
                ...base,
                action,
                ...contribution,
                expectedDraftRevision: nonNegativeInteger(
                    value.expectedDraftRevision,
                    "expectedDraftRevision"
                ),
                basedOnSeq: nonNegativeInteger(value.basedOnSeq, "basedOnSeq"),
                body: normalizeBody(value.body),
                citations
            } as ContributionCommandV1;
            break;
        }
        case "boundary_review":
            if (value.decision !== "approve" && value.decision !== "return")
                throw new TypeError("Invalid boundary decision");
            normalized = {
                ...base,
                action,
                ...contribution,
                draftRevision: nonNegativeInteger(value.draftRevision, "draftRevision"),
                decision: value.decision,
                reason: requiredText(value.reason, "reason", 2048),
                checkedThroughSeq: nonNegativeInteger(value.checkedThroughSeq, "checkedThroughSeq")
            } as ContributionCommandV1;
            break;
        case "evidence_review": {
            const reviews = Array.isArray(value.reviews)
                ? value.reviews.map((review) => {
                      if (!isRecord(review)) throw new TypeError("Invalid evidence review");
                      assertExactKeys(
                          review,
                          ["evidenceKey", "claim", "verdict", "method", "result", "limitations"],
                          "EvidenceReviewV1"
                      );
                      if (!verdicts.includes(review.verdict as (typeof verdicts)[number]))
                          throw new TypeError("Invalid evidence verdict");
                      return {
                          evidenceKey: requiredText(review.evidenceKey, "evidenceKey"),
                          claim: requiredText(review.claim, "claim", 1024),
                          verdict: review.verdict as (typeof verdicts)[number],
                          method: requiredText(review.method, "method", 2048),
                          result: requiredText(review.result, "result", 2048),
                          limitations: requiredText(review.limitations, "limitations", 2048)
                      };
                  })
                : (() => {
                      throw new TypeError("reviews must be an array");
                  })();
            if (
                new Set(reviews.map((review) => `${review.evidenceKey}\u0000${review.claim}`))
                    .size !== reviews.length
            )
                throw new TypeError("Evidence reviews must be unique");
            normalized = {
                ...base,
                action,
                ...contribution,
                draftRevision: nonNegativeInteger(value.draftRevision, "draftRevision"),
                reviews
            } as ContributionCommandV1;
            break;
        }
        case "retry":
        case "cancel":
            normalized = {
                ...base,
                action,
                ...contribution,
                reason: requiredText(value.reason, "reason", 2048)
            } as ContributionCommandV1;
            break;
        case "notify_manager":
            normalized = { ...base, action, reason: requiredText(value.reason, "reason", 2048) };
            break;
    }
    const limit = action === "submit" || action === "evidence_review" ? 8192 : 16384;
    if (canonicalBytes(normalized) > limit)
        throw new TypeError(`Contribution ${action} input exceeds ${limit} UTF-8 bytes`);
    return normalized;
}

export const ContributionCommandSchema: Schema<unknown, ContributionCommandV1> = Schema.transform(
    Schema.any<Record<string, unknown>>().required(),
    normalizeCommand
) as Schema<unknown, ContributionCommandV1>;

export const ReadContributionInputSchema: Schema<unknown, ReadContributionInputV1> =
    Schema.transform(Schema.any<Record<string, unknown>>().required(), (value) => {
        if (!isRecord(value)) throw new TypeError("Read contribution input must be an object");
        const expected = [
            "protocolVersion",
            "meetingId",
            "contributionId",
            ...(Object.hasOwn(value, "evidenceKey") ? ["evidenceKey"] : []),
            ...(Object.hasOwn(value, "draftRevision") ? ["draftRevision"] : [])
        ];
        assertExactKeys(value, expected, "ReadContributionInputV1");
        const normalized = {
            protocolVersion: ProtocolVersionSchema(value.protocolVersion as 1) as 1,
            meetingId: requiredText(value.meetingId, "meetingId"),
            contributionId: requiredText(value.contributionId, "contributionId"),
            ...(Object.hasOwn(value, "evidenceKey")
                ? { evidenceKey: requiredText(value.evidenceKey, "evidenceKey") }
                : {}),
            ...(Object.hasOwn(value, "draftRevision")
                ? { draftRevision: nonNegativeInteger(value.draftRevision, "draftRevision") }
                : {})
        };
        if (normalized.draftRevision !== undefined && normalized.draftRevision < 1)
            throw new TypeError("draftRevision must be positive");
        if (canonicalBytes(normalized) > 16384)
            throw new TypeError("Read contribution input exceeds 16384 UTF-8 bytes");
        return normalized;
    }) as Schema<unknown, ReadContributionInputV1>;

export const ContributionResultSchema: Schema<unknown, ContributionResultV1> = Schema.transform(
    Schema.any<Record<string, unknown>>().required(),
    (value) => {
        if (!isRecord(value)) throw new TypeError("Contribution result must be an object");
        if (Object.hasOwn(value, "managerNoticeSeq")) {
            assertExactKeys(value, ["managerNoticeSeq"], "notify_manager result");
            return {
                managerNoticeSeq: nonNegativeInteger(value.managerNoticeSeq, "managerNoticeSeq")
            };
        }
        const required = ["contributionId", "generation", "phase"];
        const allowed = ["evidenceKey", "draftRevision", "messageId"];
        if (
            !required.every((key) => Object.hasOwn(value, key)) ||
            Object.keys(value).some((key) => !required.includes(key) && !allowed.includes(key))
        )
            throw new TypeError("Invalid contribution result fields");
        const result = {
            contributionId: requiredText(value.contributionId, "contributionId"),
            generation: nonNegativeInteger(value.generation, "generation"),
            phase: value.phase
        };
        if (!phases.includes(result.phase as (typeof phases)[number]))
            throw new TypeError("Invalid contribution phase");
        const hasEvidence = Object.hasOwn(value, "evidenceKey"),
            hasDraft = Object.hasOwn(value, "draftRevision"),
            hasMessage = Object.hasOwn(value, "messageId");
        if ((hasEvidence && (hasDraft || hasMessage)) || (hasMessage && !hasDraft))
            throw new TypeError("Invalid contribution result combination");
        return {
            ...result,
            ...(hasEvidence ? { evidenceKey: requiredText(value.evidenceKey, "evidenceKey") } : {}),
            ...(hasDraft
                ? { draftRevision: nonNegativeInteger(value.draftRevision, "draftRevision") }
                : {}),
            ...(hasMessage ? { messageId: requiredText(value.messageId, "messageId") } : {})
        } as ContributionResultV1;
    }
) as Schema<unknown, ContributionResultV1>;
