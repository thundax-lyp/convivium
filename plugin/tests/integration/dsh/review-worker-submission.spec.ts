import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { peerBindings } from "../../fixtures/peer-ownership.ts";
import { createFakeDomainFacility } from "../../fixtures/domain-storage.ts";
import { StorageDomainRepositoryRegistry } from "@/repository/storage-domain/storage-domain-repository-registry.ts";
import {
    encodeMeetingState,
    decodeMeetingState
} from "@/repository/storage-domain/meeting-state-codec.ts";
import { createMeetingCommandApplication } from "@/runtime/application-service/meeting-command.ts";
import { createReviewWorkerPromptResolver } from "@/runtime/services/evidence-review-dispatch.ts";
import { registerMeetingTools } from "@/tools/index.ts";
import type { MeetingState } from "@/domain/index.ts";
import type { MeetingAction } from "@/protocol/index.ts";

const pendingState = (): MeetingState => {
    const state = makeRunningMeetingStateV1();
    state.identities = state.identities.map((identity) => ({
        ...identity,
        sessionOwnershipId: `ownership-${identity.id}`
    }));
    state.rounds = [
        {
            id: "round-1",
            planId: "plan-1",
            roundGoal: { question: "question", evidenceGap: "gap", expectedOutput: "output" },
            agendaId: "agenda-v1",
            publicBaselinePublicationIds: [],
            openedAt: 1,
            status: "open",
            contributionIds: ["contribution-1"]
        }
    ];
    state.managerPlans = [
        {
            id: "plan-1",
            agendaId: "agenda-v1",
            managerId: "manager-v1",
            kind: "open_round",
            roundGoal: { question: "question", evidenceGap: "gap", expectedOutput: "output" },
            rationale: "reason",
            createdAt: 1,
            status: "completed"
        }
    ];
    state.contributions = [
        {
            id: "contribution-1",
            roundId: "round-1",
            contributorId: "contributor-v1",
            handRaise: { purpose: "evidence", raisedAt: 1 },
            acceptedAt: 2,
            status: "under_review",
            packageId: "package-1",
            substantiveSupplementCount: 0
        }
    ];
    state.evidencePackages = [
        {
            id: "package-1",
            roundId: "round-1",
            contributionId: "contribution-1",
            authorId: "contributor-v1",
            agendaId: "agenda-v1",
            currentVersionId: "version-1",
            versions: [
                {
                    id: "version-1",
                    ordinal: 1,
                    observation: "observation",
                    interpretation: "interpretation",
                    method: "method",
                    falsifiers: [{ value: "falsifier" }],
                    uncertainties: [{ value: "uncertainty" }],
                    limitations: [{ value: "limitation" }],
                    claims: [
                        {
                            id: "claim-1",
                            statement: "claim",
                            materialIds: ["material-1"],
                            qualification: "qualification"
                        }
                    ],
                    materials: [
                        {
                            id: "material-1",
                            kind: "document",
                            originator: "source",
                            originalSource: "source",
                            sourcePublishedAt: "2026",
                            acquiredAt: "2026",
                            version: "1",
                            locator: "locator",
                            location: "location",
                            verificationConditions: "conditions",
                            limitations: "limitations",
                            sharedDependencies: []
                        }
                    ],
                    submittedAt: 3,
                    status: "validating",
                    failureCount: 0
                }
            ]
        }
    ];
    state.registrations = [
        { id: "registration-1", versionId: "version-1", status: "complete", createdAt: 3 }
    ];
    state.reviewClaims = [
        {
            id: "review-claim-1",
            sourceEffectId: "effect-1",
            roundId: "round-1",
            reviewerId: "reviewer-v1",
            versionId: "version-1",
            claimedAt: 4,
            expiresAt: 100
        }
    ];
    return state;
};

it.each([
    "accepted",
    "replaced claim",
    "invalid baseline",
    "expired claim",
    "revoked ownership"
] as const)(
    "submits worker output through the real application and repository: %s",
    async (scenario) => {
        const state = pendingState();
        let now = 5;
        let nextId = 0;
        const registry = await StorageDomainRepositoryRegistry.open<MeetingState>({
            storageDomain: createFakeDomainFacility(),
            codec: { encode: encodeMeetingState, decode: decodeMeetingState },
            authorizationValidator: {
                validateCreate: () => undefined,
                validateCommand: () => undefined
            },
            now: () => now
        });
        try {
            const creation = {
                requestId: "create",
                requestHash: "create",
                authorization: { callerBinding: "captain", capabilityId: "captain" },
                initialState: state,
                ...peerBindings(state.id, state.identities),
                createResult: { meetingId: state.id, meetingVersion: 1 },
                createdAt: 0
            };
            const repository = await registry.openMeeting({
                meetingId: state.id,
                create: creation
            });
            for (const owner of creation.initialOwnership) {
                await repository.recordSessionOwnership({ ...owner, lifecycleStatus: "active" }, 1);
            }
            await repository.completeCreate(creation);
            const resolveCaller = async () => {
                const ownership = (await repository.recover()).sessionOwnership.find(
                    ({ identityId }) => identityId === "reviewer-v1"
                )!;
                return {
                    caller: {
                        channel: "dsh_tool" as const,
                        principalId: "reviewer-v1",
                        sessionBindingId: ownership.id
                    },
                    meetingId: state.id,
                    identityId: "reviewer-v1",
                    role: "evidence_reviewer" as const,
                    ownership
                };
            };
            const application = createMeetingCommandApplication({
                registry,
                creation: {
                    create: async () => {
                        throw new Error("not a create command");
                    }
                },
                ids: { nextId: (kind) => `${kind}-${++nextId}` },
                clock: { now: () => now },
                resolveCallerScope: async ({ caller }) =>
                    caller.channel === "runtime_recovery"
                        ? { caller, meetingId: state.id, role: "runtime" }
                        : resolveCaller()
            });
            const execute = vi.spyOn(application, "execute");
            const definitions: ToolDefinition[] = [];
            const dimension = {
                score: 2,
                scope: "scope",
                reason: "verified",
                baselineEvidenceIds: scenario === "invalid baseline" ? ["unpublished-version"] : []
            };
            const dispose = vi.fn(async () => undefined);
            registerMeetingTools({
                registry: {
                    register: (definition) => {
                        definitions.push(definition);
                        return () => undefined;
                    }
                },
                application,
                callers: { resolve: resolveCaller },
                reader: { read: vi.fn() },
                reviewPrompts: createReviewWorkerPromptResolver({
                    registry,
                    clock: { now: () => now }
                }),
                reviewWorkers: {
                    start: async () => {
                        if (scenario === "expired claim") {
                            now = 100;
                        }
                        if (scenario === "replaced claim") {
                            const replace = async (action: MeetingAction, requestId: string) => {
                                const recovered = await repository.recover();
                                return application.execute(
                                    {
                                        protocolVersion: 1,
                                        meetingId: state.id,
                                        requestId,
                                        expectedMeetingVersion: recovered.snapshot!.version,
                                        action
                                    },
                                    {
                                        caller: {
                                            channel: "runtime_recovery",
                                            principalId: "runtime-recovery"
                                        }
                                    },
                                    new AbortController().signal
                                );
                            };
                            expect(
                                await replace(
                                    {
                                        kind: "fail_evidence_validation",
                                        roundId: "round-1",
                                        claimId: "review-claim-1",
                                        reason: "dispatch_failed"
                                    },
                                    "fail-old"
                                )
                            ).toMatchObject({ kind: "accepted" });
                            expect(
                                await replace(
                                    {
                                        kind: "claim_evidence_review",
                                        roundId: "round-1",
                                        versionId: "version-1",
                                        sourceEffectId: "effect-2"
                                    },
                                    "reclaim"
                                )
                            ).toMatchObject({ kind: "accepted" });
                        }
                        if (scenario === "revoked ownership") {
                            const { ownership } = await resolveCaller();
                            const {
                                createdAt: _createdAt,
                                updatedAt: _updatedAt,
                                ...input
                            } = ownership;
                            await repository.recordSessionOwnership(
                                { ...input, capabilityStatus: "revoked" },
                                now,
                                creation.preparedDescriptors.find(
                                    ({ identityId }) => identityId === ownership.identityId
                                )
                            );
                        }
                        return {
                            id: "worker-1",
                            localAgent: undefined,
                            dispose,
                            result: Promise.resolve({
                                output: [],
                                stopReason: "completed",
                                structured: {
                                    versionId: "version-1",
                                    scope: "scope",
                                    dimensions: {
                                        source: dimension,
                                        credibility: dimension,
                                        completeness: dimension,
                                        support: dimension
                                    }
                                }
                            })
                        };
                    }
                }
            });
            const before = await repository.recover();
            const result = await definitions
                .find(({ name }) => name === "convivium_run_review_worker")!
                .execute({ input: { meetingId: state.id, versionId: "version-1" } }, {
                    agent: { id: "session-reviewer-v1" } as Agent,
                    signal: new AbortController().signal
                } as ToolRunContext);
            const after = await repository.recover();
            expect(dispose).toHaveBeenCalledOnce();
            if (scenario === "accepted") {
                expect(result).toMatchObject({ kind: "accepted" });
                expect(after.snapshot!.state.reviews).toMatchObject([
                    {
                        versionId: "version-1",
                        reviewerId: "reviewer-v1",
                        baselinePublicationIds: []
                    }
                ]);
                expect(after.snapshot!.state.reviewClaims).toEqual([]);
                expect(after.snapshot!.state.evidencePackages[0]!.versions[0]!.status).toBe(
                    "validated"
                );
                const events = await repository.readCommittedEvents();
                expect(
                    events.kind === "complete" &&
                        events.events.some(({ type }) => type === "evidence_review.submitted")
                ).toBe(true);
                const facts = await repository.readCommittedFacts();
                expect(facts.filter(({ kind }) => kind === "submit_evidence_review")).toHaveLength(
                    1
                );
                const [command, context, signal] = execute.mock.calls[0]!;
                expect(await application.execute(command, context, signal)).toEqual(result);
                expect((await repository.recover()).snapshot).toEqual(after.snapshot);
                expect(await repository.readCommittedEvents()).toEqual(events);
            } else {
                expect(result).toMatchObject({
                    kind: "rejected",
                    error: {
                        code:
                            scenario === "expired claim" || scenario === "replaced claim"
                                ? "REVIEWER_CONFLICT"
                                : scenario === "revoked ownership"
                                  ? "UNAUTHORIZED"
                                  : "INVALID_ARGUMENT"
                    }
                });
                if (scenario === "replaced claim") {
                    expect(after.snapshot!.state.reviewClaims).toHaveLength(1);
                    expect(after.snapshot!.state.reviewClaims[0]!.id).not.toBe("review-claim-1");
                    expect(after.snapshot!.state.reviewClaims[0]!.sourceEffectId).toBe("effect-2");
                    expect(after.snapshot!.version).toBe(before.snapshot!.version + 2);
                    expect(after.snapshot!.state.evidencePackages[0]!.versions[0]).toMatchObject({
                        status: "validating",
                        failureCount: 1
                    });
                } else {
                    expect(after.snapshot).toEqual(before.snapshot);
                }
                expect(after.snapshot!.state.reviews).toEqual([]);
                expect(
                    (await repository.readCommittedFacts()).filter(
                        ({ kind }) => kind === "submit_evidence_review"
                    )
                ).toEqual([]);
            }
        } finally {
            await registry.close();
        }
    }
);
