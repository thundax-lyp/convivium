import { describe, expect, it, vi } from "vitest";
import { makeRunningMeetingStateV1 } from "../fixtures/meeting-state-v1.js";
import type { MeetingState } from "@/domain/index.js";
import type { DomainRepositoryRegistry } from "@/repository/domain/domain-repository-registry.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { RepositoryCommand } from "@/repository/types.js";
import { createMeetingCommandApplicationV1 } from "@/runtime/application-service/meeting-command-v1.js";
import * as legacyIdentityApplication from "@/runtime/application-service/meeting-identity-v1.js";

const managerCaller = {
    channel: "dsh_tool" as const,
    principalId: "manager-v1",
    sessionBindingId: "ownership-v1"
};

function managerScope() {
    return {
        caller: managerCaller,
        meetingId: "meeting-v1",
        identityId: "manager-v1",
        role: "manager" as const,
        ownership: {
            id: "ownership-v1",
            meetingId: "meeting-v1",
            identityId: "manager-v1",
            sessionId: "manager-session",
            parentSessionId: "captain-session",
            sessionLabel: "manager",
            provider: "spawn",
            role: "manager" as const,
            lifecycleStatus: "active" as const,
            capabilityStatus: "active" as const,
            createdAt: 0,
            updatedAt: 0
        }
    };
}

describe("meeting identity command", () => {
    it("rejects an untrusted caller before repository execution", async () => {
        const openMeeting = vi.fn();
        const app = createMeetingCommandApplicationV1({
            creation: { create: vi.fn() },
            registry: { openMeeting } as unknown as DomainRepositoryRegistry<MeetingState>,
            ids: { nextId: (kind) => `${kind}-1` },
            clock: { now: () => 1 },
            resolveCallerScope: async () => undefined
        });
        const result = await app.execute(
            {
                protocolVersion: 1,
                meetingId: "meeting-v1",
                expectedMeetingVersion: 1,
                requestId: "request-1",
                action: {
                    kind: "recommend_identity",
                    candidateId: "candidate-1",
                    definitionId: "domain_architect",
                    definitionVersion: "1",
                    catalogId: "catalog-1",
                    catalogVersion: "1",
                    agendaId: "agenda-v1",
                    decision: "reject",
                    rationale: "理由",
                    expectedContribution: "贡献",
                    evidenceGap: "缺口"
                }
            },
            {
                caller: {
                    channel: "dsh_tool",
                    principalId: "other",
                    sessionBindingId: "manager-session"
                }
            },
            new AbortController().signal
        );
        expect(result).toMatchObject({ kind: "rejected", error: { code: "UNAUTHORIZED" } });
        expect(openMeeting).not.toHaveBeenCalled();
    });

    it("routes a manager recommendation through the unique command dispatcher", async () => {
        const state = makeRunningMeetingStateV1();
        const execute = vi.fn(async (command: RepositoryCommand<unknown, MeetingState>) => {
            const transition = command.transition({
                meetingId: state.id,
                version: state.version,
                state,
                createdAt: state.createdAt,
                updatedAt: state.updatedAt
            });
            expect(command.facts).toHaveLength(1);
            expect(transition.state.identityRecommendations).toHaveLength(1);
            return {
                requestId: command.requestId,
                meetingId: state.id,
                meetingVersion: state.version + 1,
                result: transition.result,
                eventSeqs: []
            };
        });
        const repository = {
            execute,
            replayReceipt: async () => undefined
        } as unknown as MeetingRepositoryPort<MeetingState>;
        const app = createMeetingCommandApplicationV1({
            creation: { create: vi.fn() },
            registry: {
                openMeeting: vi.fn(async () => repository)
            } as unknown as DomainRepositoryRegistry<MeetingState>,
            ids: { nextId: (kind) => `${kind}-1` },
            clock: { now: () => 1 },
            resolveCallerScope: async () => managerScope(),
            catalog: {
                readSnapshot: async () => ({
                    kind: "available",
                    snapshot: {
                        protocolVersion: 1,
                        meetingId: "meeting-v1",
                        catalogId: "catalog-1",
                        catalogVersion: "1",
                        generatedAt: 0,
                        candidates: [
                            {
                                candidateId: "candidate-1",
                                definition: { id: "domain_architect", version: "1" },
                                definitionHash: "a".repeat(64),
                                displayName: "Architect",
                                availability: "available",
                                meetingRoles: ["contributor"],
                                responsibilitySummary: "形成架构证据",
                                capabilitySummary: [],
                                suitability: []
                            }
                        ]
                    }
                })
            }
        });

        const result = await app.execute(
            {
                protocolVersion: 1,
                meetingId: "meeting-v1",
                expectedMeetingVersion: 1,
                requestId: "request-1",
                action: {
                    kind: "recommend_identity",
                    candidateId: "candidate-1",
                    definitionId: "domain_architect",
                    definitionVersion: "1",
                    catalogId: "catalog-1",
                    catalogVersion: "1",
                    agendaId: "agenda-v1",
                    decision: "reject",
                    rationale: "理由",
                    expectedContribution: "贡献",
                    evidenceGap: "缺口"
                }
            },
            { caller: managerCaller },
            new AbortController().signal
        );

        expect(result).toMatchObject({
            kind: "accepted",
            meetingId: "meeting-v1",
            committedVersion: 2,
            factIds: ["fact-1"],
            identityDecision: {
                recommendationId: "identity_recommendation-1",
                decision: "reject",
                status: "rejected"
            }
        });
        expect(execute).toHaveBeenCalledOnce();
        expect(legacyIdentityApplication).not.toHaveProperty("createMeetingIdentityApplicationV1");
    });

    it("replays a recommendation receipt before consulting the mutable Catalog", async () => {
        const replayed = {
            kind: "accepted" as const,
            meetingId: "meeting-v1",
            committedVersion: 2,
            receiptId: "receipt-1",
            factIds: ["fact-1"],
            effects: [],
            identityDecision: {
                recommendationId: "recommendation-1",
                decision: "reject" as const,
                status: "rejected" as const
            }
        };
        const replayReceipt = vi.fn(async () => ({
            requestId: "request-1",
            meetingId: "meeting-v1",
            meetingVersion: 2,
            result: replayed,
            eventSeqs: []
        }));
        const execute = vi.fn();
        const repository = {
            replayReceipt,
            execute
        } as unknown as MeetingRepositoryPort<MeetingState>;
        const readSnapshot = vi.fn(async () => ({
            kind: "unavailable" as const,
            error: { code: "CATALOG_NOT_FOUND" as const, message: "Catalog unavailable" }
        }));
        const app = createMeetingCommandApplicationV1({
            creation: { create: vi.fn() },
            registry: {
                openMeeting: vi.fn(async () => repository)
            } as unknown as DomainRepositoryRegistry<MeetingState>,
            ids: { nextId: (kind) => `${kind}-1` },
            clock: { now: () => 1 },
            resolveCallerScope: async () => managerScope(),
            catalog: { readSnapshot }
        });

        const result = await app.execute(
            {
                protocolVersion: 1,
                meetingId: "meeting-v1",
                expectedMeetingVersion: 1,
                requestId: "request-1",
                action: {
                    kind: "recommend_identity",
                    candidateId: "candidate-1",
                    definitionId: "domain_architect",
                    definitionVersion: "1",
                    catalogId: "catalog-1",
                    catalogVersion: "1",
                    agendaId: "agenda-v1",
                    decision: "reject",
                    rationale: "理由",
                    expectedContribution: "贡献",
                    evidenceGap: "缺口"
                }
            },
            { caller: managerCaller },
            new AbortController().signal
        );

        expect(result).toEqual(replayed);
        expect(replayReceipt).toHaveBeenCalledOnce();
        expect(readSnapshot).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });
});
