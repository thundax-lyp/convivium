import { describe, expect, it, vi } from "vitest";
import {
    createMeetingCreationCoordinatorV1,
    createMeetingRuntime
} from "@/runtime/meeting-runtime.js";
import type { CreateMeetingInputV1 } from "@/protocol/index.js";
import { MeetingCommandV1Schema } from "@/protocol/meeting-command.js";
import { LocalMeetingRecoveryUnavailableError } from "@/runtime/application-service/index.js";
import { RepositoryError } from "@/repository/errors.js";

const input: CreateMeetingInputV1 = {
    evidenceReviewerKey: "p-3",
    protocolVersion: 1,
    requestId: "create-1",
    teamId: "team-1",
    topic: "Topic",
    objective: "Objective",
    objectiveContract: {
        requiredOutputs: [],
        acceptanceCriteria: [],
        hardConstraints: [],
        requiredReviewerKeys: [],
        riskAcceptanceAuthorityKeys: [],
        acceptableRiskLevel: "low"
    },
    agenda: [
        {
            key: "agenda-1",
            title: "Agenda",
            objective: "Discuss",
            inScope: [],
            outOfScope: [],
            completionCriteria: [],
            requiredParticipantKeys: ["p-1", "p-2", "p-3"]
        }
    ],
    participants: [
        { participantKey: "p-1", displayName: "One" },
        { participantKey: "p-2", displayName: "Two" },
        { participantKey: "p-3", displayName: "Three" }
    ],
    selectionMode: "manager"
};

function dependencies(overrides: Record<string, unknown> = {}) {
    const calls: string[] = [];
    const repository = {
        meetingId: "meeting-1",
        create: async () => {
            calls.push("bootstrap");
            return {};
        },
        recordSessionOwnership: async (ownership: { lifecycleStatus: string }) => {
            calls.push(`ownership:${ownership.lifecycleStatus}`);
            return ownership;
        },
        completeCreate: async () => {
            calls.push("complete");
            return { requestId: "create-1", meetingId: "meeting-1", meetingVersion: 0, result: {} };
        },
        updateBootstrap: async () => {
            calls.push("failed");
            return { status: "creation_failed" };
        }
    };
    return {
        calls,
        repository,
        continuable: {
            startContinuable: async (spec: { childId?: string }) => ({
                childId: spec.childId!,
                messageId: "message-1" as never
            })
        },
        parent: { id: "captain-1" } as never,
        provider: "spawn",
        authorization: { callerBinding: "captain-1", capabilityId: "capability-1" },
        allocateSessionId: (role: string, key: string) => `${role}-${key}` as never,
        signal: new AbortController().signal,
        now: () => 100,
        ...overrides
    };
}

describe("meeting creation and Session provisioning", () => {
    it("creates bootstrap, four owned Sessions, and the public Meeting in order", async () => {
        const deps = dependencies();
        await createMeetingRuntime(input, deps as never);

        expect(deps.calls).toEqual([
            "bootstrap",
            "ownership:provisioning",
            "ownership:active",
            "ownership:provisioning",
            "ownership:active",
            "ownership:provisioning",
            "ownership:active",
            "ownership:provisioning",
            "ownership:active",
            "complete"
        ]);
    });

    it("marks bootstrap failed and invokes cleanup when Session creation fails", async () => {
        const deps = dependencies({
            continuable: {
                startContinuable: async () => {
                    throw new Error("provider unavailable");
                }
            },
            cleanup: async (ownerships: readonly { sessionId: string }[]) => {
                deps.calls.push(`cleanup:${ownerships.length}`);
            }
        });

        await expect(createMeetingRuntime(input, deps as never)).rejects.toThrow(
            "provider unavailable"
        );
        expect(deps.calls).toEqual(["bootstrap", "ownership:provisioning", "failed", "cleanup:1"]);
    });

    it("replays a committed create after ready publication is repaired", async () => {
        const deps = dependencies();
        let completes = 0;
        deps.repository.completeCreate = async () => {
            deps.calls.push("complete");
            completes += 1;
            if (completes === 1) throw new Error("ready publication failed");
            return {
                requestId: "create-1",
                meetingId: "meeting-1",
                meetingVersion: 0,
                result: {}
            };
        };
        deps.repository.updateBootstrap = async () => {
            deps.calls.push("repair");
            return { status: "ready" };
        };

        await expect(createMeetingRuntime(input, deps as never)).resolves.toMatchObject({
            requestId: "create-1",
            meetingId: "meeting-1"
        });
        expect(deps.calls.slice(-3)).toEqual(["complete", "repair", "complete"]);
    });
});

describe("local meeting recovery failure", () => {
    it("keeps recovery unavailability outside the public protocol code space", () => {
        const cause = new Error("storage unavailable");
        const error = new LocalMeetingRecoveryUnavailableError("recovery unavailable", { cause });

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("LocalMeetingRecoveryUnavailableError");
        expect(error.cause).toBe(cause);
        expect(error).not.toHaveProperty("code");
    });
});

describe("creation role preflight", () => {
    const definitions = [
        {
            agentDefinitionId: "manager",
            definitionVersion: "1",
            roleDefinitionId: "meeting_manager",
            displayName: "Manager",
            summary: "Manager",
            roleDescription: "Manager persona",
            dshPresetId: "minimal",
            requiredSkillNames: ["fixture"],
            expertiseTags: ["fixture"],
            evidenceScopes: []
        },
        {
            agentDefinitionId: "participant",
            definitionVersion: "1",
            roleDefinitionId: "domain_architect",
            displayName: "Participant",
            summary: "Participant",
            roleDescription: "Participant persona",
            dshPresetId: "minimal",
            requiredSkillNames: ["fixture"],
            expertiseTags: ["fixture"],
            evidenceScopes: [],
            toolFilter: { deny: ["probe"] }
        }
    ];
    const selected = {
        ...input,
        managerAgentDefinitionId: "manager",
        participants: input.participants.map((p, i) => ({
            ...p,
            ...(i === 1 ? { agentDefinitionId: "participant" } : {})
        }))
    };
    function fixture(failAt = 0) {
        const requests = [];
        const ownerships = [];
        const cleaned = [];
        const deps = dependencies({ agentDefinitions: definitions });
        deps.parent = {
            id: "captain-1",
            session: { header: { cwd: "/fixture" } },
            ctx: {
                get: (key) =>
                    key === "agentPresets"
                        ? { composedPreset: () => "minimal" }
                        : {
                              get: async () => {
                                  deps.calls.push("validate");
                                  return {
                                      content: "fixture",
                                      invocation: { modelInvocable: true }
                                  };
                              }
                          }
            }
        };
        deps.continuable.startContinuable = async (spec) => {
            requests.push(spec);
            if (requests.length === failAt) throw new Error("child failed");
            return { childId: spec.childId, messageId: "message" };
        };
        deps.repository.recordSessionOwnership = async (owned) => {
            ownerships.push(owned);
            deps.calls.push("owned");
            return owned;
        };
        deps.cleanup = async (owned) => {
            cleaned.push(...owned);
        };
        return { deps, requests, ownerships, cleaned };
    }
    it("preflights once and binds selection by participant key through both ownership writes", async () => {
        const f = fixture();
        await createMeetingRuntime(selected, f.deps);
        expect(f.deps.calls.slice(0, 3)).toEqual(["bootstrap", "validate", "owned"]);
        expect(f.requests).toHaveLength(4);
        expect(f.requests[0].request.persona).toBe(
            "Manager persona\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：fixture。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。"
        );
        expect(f.requests[1].request.persona).toBeUndefined();
        expect(f.requests[2].request).toMatchObject({
            persona:
                "Participant persona\n\n开始处理会议任务前，调用 DSH 原生 skill 工具依次加载：fixture。加载失败时报告缺失能力，不以角色描述代替 Skill。Skill 不授予会议权限，Runtime 的当前身份和 capability 判定优先。",
            toolFilter: { deny: ["probe"] }
        });
        expect(f.requests[3].request.persona).toBeUndefined();
        expect(f.ownerships[0].agentDefinition).toEqual(f.ownerships[1].agentDefinition);
        expect(f.ownerships[4].agentDefinition).toEqual(f.ownerships[5].agentDefinition);
        expect(f.ownerships[4].agentDefinition.agentDefinitionId).toBe("participant");
        expect(f.ownerships[2].agentDefinition).toBeUndefined();
    });
    it("rejects the last invalid selection before any child allocation or ownership", async () => {
        const f = fixture();
        f.deps.allocateSessionId = () => {
            throw new Error("must not allocate");
        };
        await expect(
            createMeetingRuntime(
                {
                    ...selected,
                    participants: selected.participants.map((p, i) =>
                        i === 2 ? { ...p, agentDefinitionId: "missing" } : p
                    )
                },
                f.deps
            )
        ).rejects.toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
        expect(f.deps.calls).toEqual(["bootstrap", "failed"]);
        expect(f.requests).toEqual([]);
        expect(f.ownerships).toEqual([]);
        expect(f.cleaned).toEqual([]);
    });
    it("passes all allocated identities to original cleanup after the second child fails", async () => {
        const f = fixture(2);
        await expect(createMeetingRuntime(selected, f.deps)).rejects.toThrow("child failed");
        expect(f.cleaned.map((o) => o.sessionId)).toEqual([
            "manager-manager",
            "participant-participant-p-1"
        ]);
        expect(f.deps.calls).not.toContain("complete");
        expect(f.deps.calls.at(-1)).toBe("failed");
    });
});

describe("target Meeting creation idempotency", () => {
    const definitions = [
        {
            agentDefinitionId: "manager-definition",
            definitionVersion: "1",
            roleDefinitionId: "meeting_manager" as const,
            displayName: "Manager",
            summary: "Manager",
            roleDescription: "Manager",
            dshPresetId: "minimal",
            requiredSkillNames: [],
            expertiseTags: ["meeting"],
            evidenceScopes: []
        },
        {
            agentDefinitionId: "reviewer-definition",
            definitionVersion: "1",
            roleDefinitionId: "verification_reviewer" as const,
            displayName: "Reviewer",
            summary: "Reviewer",
            roleDescription: "Reviewer",
            dshPresetId: "minimal",
            requiredSkillNames: [],
            expertiseTags: ["review"],
            evidenceScopes: []
        },
        {
            agentDefinitionId: "contributor-definition",
            definitionVersion: "1",
            roleDefinitionId: "domain_architect" as const,
            displayName: "Contributor",
            summary: "Contributor",
            roleDescription: "Contributor",
            dshPresetId: "minimal",
            requiredSkillNames: [],
            expertiseTags: ["domain"],
            evidenceScopes: []
        }
    ];
    const identities = [
        {
            identityKey: "manager",
            displayName: "Manager",
            roles: ["manager" as const],
            agendaResponsibilityIds: ["agenda-1"],
            riskAuthority: true,
            required: true,
            definitionId: "manager-definition",
            definitionVersion: "1"
        },
        {
            identityKey: "reviewer",
            displayName: "Reviewer",
            roles: ["evidence_reviewer" as const],
            agendaResponsibilityIds: ["agenda-1"],
            riskAuthority: false,
            required: true,
            definitionId: "reviewer-definition",
            definitionVersion: "1"
        },
        ...Array.from({ length: 5 }, (_, index) => ({
            identityKey: `contributor-${index + 1}`,
            displayName: `Contributor ${index + 1}`,
            roles: ["contributor" as const],
            agendaResponsibilityIds: ["agenda-1"],
            riskAuthority: false,
            required: true,
            definitionId: "contributor-definition",
            definitionVersion: "1"
        }))
    ];
    function command(statement = "objective") {
        return MeetingCommandV1Schema.parse({
            protocolVersion: 1,
            meetingId: "new",
            expectedMeetingVersion: 0,
            requestId: "create-request-1",
            action: {
                kind: "create_meeting",
                objective: {
                    statement,
                    requiredOutputs: [],
                    acceptanceCriteria: [],
                    hardConstraints: [],
                    acceptableRiskLevel: "low"
                },
                identities,
                managerIdentityKey: "manager",
                evidenceReviewerIdentityKey: "reviewer",
                initialAgenda: [
                    {
                        id: "agenda-1",
                        title: "Agenda",
                        question: "Question",
                        requiredOutputIds: []
                    }
                ],
                initialActiveAgendaId: "agenda-1",
                limits: {
                    maxFormalMessages: 8,
                    maxDurationMs: 60_000,
                    taskDeadlineMs: 1_000,
                    reviewDeadlineMs: 1_000
                }
            }
        });
    }
    const accepted = {
        kind: "accepted" as const,
        meetingId: "meeting-1",
        meetingVersion: 1,
        committedVersion: 1,
        receiptId: "receipt-1",
        factIds: [],
        effects: []
    };
    const context = (parent: object) => ({
        caller: { channel: "dsh_tool" as const, principalId: "captain-1" },
        captainParent: parent as never
    });
    const normalParent = {
        id: "captain-1",
        ctx: { get: () => ({ composedPreset: () => "minimal" }) }
    };

    it("does not coalesce concurrent creates with different normalized payloads", async () => {
        let releaseRecovery!: () => void;
        const recoveryGate = new Promise<void>((resolve) => {
            releaseRecovery = resolve;
        });
        let createOpens = 0;
        const repository = {
            recover: async () => {
                await recoveryGate;
                return {
                    bootstrap: {
                        status: "ready",
                        createRequestId: "create-request-1",
                        requestHash: JSON.stringify(command().action),
                        createResult: accepted,
                        createdAt: 1,
                        updatedAt: 1
                    },
                    sessionOwnership: []
                };
            }
        };
        const openMeeting = vi.fn(async (input: { create?: unknown }) => {
            if (input.create === undefined)
                throw new RepositoryError(
                    "MEETING_NOT_FOUND",
                    false,
                    "meeting-1",
                    "Meeting is not registered"
                );
            createOpens += 1;
            if (createOpens > 1)
                throw new RepositoryError(
                    "IDEMPOTENCY_CONFLICT",
                    false,
                    "meeting-1",
                    "Request hash conflicts with bootstrap"
                );
            return repository;
        });
        const coordinator = createMeetingCreationCoordinatorV1({
            registry: { openMeeting } as never,
            definitions,
            continuable: {} as never,
            provider: "fixture",
            ids: { nextId: (kind) => `${kind}-1` }
        });

        const first = coordinator.create(
            command(),
            context(normalParent),
            "meeting-1",
            1,
            new AbortController().signal
        );
        await vi.waitFor(() => expect(createOpens).toBe(1));
        const second = coordinator.create(
            command("different objective"),
            context(normalParent),
            "meeting-1",
            1,
            new AbortController().signal
        );
        releaseRecovery();

        await expect(first).resolves.toEqual(accepted);
        await expect(second).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    });

    it("replays a committed create receipt before capability preflight", async () => {
        const replayReceipt = vi.fn(async () => ({
            requestId: "create-request-1",
            meetingId: "meeting-1",
            meetingVersion: 1,
            result: accepted,
            eventSeqs: []
        }));
        const coordinator = createMeetingCreationCoordinatorV1({
            registry: {
                openMeeting: vi.fn(async () => ({ replayReceipt }))
            } as never,
            definitions,
            continuable: {} as never,
            provider: "fixture",
            ids: { nextId: (kind) => `${kind}-1` }
        });
        const changedParent = {
            id: "captain-1",
            ctx: { get: () => undefined }
        };

        await expect(
            coordinator.create(
                command(),
                context(changedParent),
                "meeting-1",
                2,
                new AbortController().signal
            )
        ).resolves.toEqual(accepted);
        expect(replayReceipt).toHaveBeenCalledOnce();
    });
});
