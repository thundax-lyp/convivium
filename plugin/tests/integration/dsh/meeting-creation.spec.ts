import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createMeetingCreationCoordinator } from "@/runtime/meeting-runtime.js";
import { DomainMeetingRepository } from "@/repository/domain/domain-meeting-repository.js";
import { RepositoryError } from "@/repository/errors.js";
import { decodeMeetingState, encodeMeetingState } from "@/repository/domain/meeting-state-codec.js";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../../fixtures/domain-storage.js";

const fixture = async (failAt = -1) => {
    const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const definitions = parseAgentDefinitions(
        JSON.parse(await readFile(join(packageRoot, "config/definitions.json"), "utf8")).definitions
    );
    const meetingDomain = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain,
        meetingId: "meeting",
        authorizationValidator: { validateCreate: () => {}, validateCommand: () => {} },
        codec: { encode: encodeMeetingState, decode: decodeMeetingState },
        now: () => Date.now()
    });
    let created = false;
    const registry = {
        openMeeting: vi.fn(async ({ create }) => {
            if (create) {
                await repository.create(create);
                created = true;
            }
            if (!created)
                throw new RepositoryError("MEETING_NOT_FOUND", false, "meeting", "missing");
            return repository;
        })
    };
    const skillsFor = async (scope) =>
        Promise.all(
            definitions
                .find((d) => d.dshPresetId === scope)!
                .requiredSkillNames.map(async (name) => {
                    const path = join(packageRoot, "config/skills", name, "SKILL.md");
                    return {
                        name,
                        path,
                        content: (await readFile(path, "utf8"))
                            .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
                            .trim(),
                        resourceBase: {
                            kind: "directory",
                            path: join(packageRoot, "config/skills", name)
                        },
                        invocation: { modelInvocable: true }
                    };
                })
        );
    const ctx = {
        agentDefaultModel: {
            currentSelection: vi.fn(() => ({ provider: "fixture", model: "original" }))
        },
        llm: { resolveCallConfig: async (c) => c },
        agentPresets: { standingKeyFor: vi.fn(async (id) => id) },
        skills: {
            snapshot: async ({ scope }) => ({ complete: true, skills: await skillsFor(scope) }),
            get: async (name, { scope }) => (await skillsFor(scope)).find((s) => s.name === name)
        }
    };
    const active = new Set<string>();
    const owner = {
        create: vi.fn(async ({ ownership }) => {
            const recovery = await repository.recover();
            expect(recovery.bootstrap.status).toBe("creating");
            expect(recovery.sessionOwnership).toHaveLength(7);
            expect(recovery.pendingOutbox).toBe(0);
            if (active.size === failAt) throw new Error("factory failed");
            active.add(ownership.sessionId);
        }),
        resume: vi.fn(async ({ ownership, purpose }) => {
            if (purpose === "delivery")
                expect((await repository.recover()).bootstrap.status).toBe("ready");
            active.add(ownership.sessionId);
        }),
        stop: vi.fn(async ({ ownership }) => {
            expect(
                (await repository.recover()).sessionOwnership.every(
                    (o) => o.capabilityStatus === "revoked"
                )
            ).toBe(true);
            active.delete(ownership.sessionId);
        })
    };
    const identities = definitions.map((d) => ({
        identityKey: d.roleDefinitionId,
        displayName: d.displayName,
        roles: [
            d.roleDefinitionId === "meeting_manager"
                ? "manager"
                : d.roleDefinitionId === "verification_reviewer"
                  ? "evidence_reviewer"
                  : "contributor"
        ],
        agendaResponsibilityIds: ["agenda"],
        riskAuthority: false,
        required: true,
        definitionId: d.agentDefinitionId,
        definitionVersion: d.definitionVersion
    }));
    const command = {
        protocolVersion: 1,
        meetingId: "new",
        requestId: "create",
        expectedMeetingVersion: 0,
        action: {
            kind: "create_meeting",
            objective: {
                statement: "goal",
                requiredOutputs: [],
                acceptanceCriteria: [],
                hardConstraints: [],
                acceptableRiskLevel: "low"
            },
            identities,
            managerIdentityKey: "meeting_manager",
            evidenceReviewerIdentityKey: "verification_reviewer",
            initialAgenda: [
                { id: "agenda", title: "agenda", question: "question", requiredOutputIds: [] }
            ],
            initialActiveAgendaId: "agenda",
            limits: {
                maxFormalMessages: 100,
                maxDurationMs: 100000,
                taskDeadlineMs: 1000,
                reviewDeadlineMs: 1000
            }
        }
    };
    const context = { caller: { channel: "loopback_remote", principalId: "local-controller" } };
    const dependencies = { ctx, owner, registry, definitions, packageRoot, cwd: packageRoot };
    const coordinator = createMeetingCreationCoordinator(dependencies);
    const run = () =>
        coordinator.create(command, context, "meeting", Date.now(), new AbortController().signal);
    return { run, repository, registry, ctx, owner, active, command, context, dependencies };
};

it("commits all seven peer bindings before factories and publishes only after all activations", async () => {
    const f = await fixture();
    try {
        expect(await f.run()).toMatchObject({ kind: "accepted", meetingId: "meeting" });
        const recovery = await f.repository.recover();
        expect(recovery.bootstrap).toMatchObject({
            status: "ready",
            creator: { kind: "local_user", principalId: "local-controller" }
        });
        expect(f.active.size).toBe(7);
        expect(new Set(recovery.sessionOwnership.map((o) => o.sessionId)).size).toBe(7);
        expect(
            recovery.sessionOwnership.every(
                (o) => o.lifecycleStatus === "active" && !("parentSessionId" in o)
            )
        ).toBe(true);
        const first = await f.run();
        expect(first.kind).toBe("accepted");
        expect(f.owner.create).toHaveBeenCalledTimes(7);
        expect(f.ctx.agentDefaultModel.currentSelection).toHaveBeenCalledTimes(1);
        f.command.action.objective.statement = "changed";
        await expect(f.run()).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    } finally {
        await f.repository.close();
    }
});

it.each([0, 3, 6])("revokes all bindings before cleaning failed creation at %s", async (index) => {
    const f = await fixture(index);
    try {
        await expect(f.run()).rejects.toThrow("factory failed");
        const recovery = await f.repository.recover();
        expect(recovery.bootstrap.status).toBe("creation_failed");
        expect(recovery.sessionOwnership.every((o) => o.capabilityStatus === "revoked")).toBe(true);
        expect(f.active.size).toBe(0);
        expect(recovery.pendingOutbox).toBe(0);
        expect(f.owner.resume).not.toHaveBeenCalled();
    } finally {
        await f.repository.close();
    }
});

it("keeps committed ready state when delivery scope restoration fails", async () => {
    const f = await fixture();
    f.owner.resume.mockRejectedValue(new Error("restore failed"));
    try {
        await expect(f.run()).rejects.toThrow("restore failed");
        expect((await f.repository.recover()).bootstrap.status).toBe("ready");
        expect(f.owner.stop).not.toHaveBeenCalled();
    } finally {
        await f.repository.close();
    }
});

it("does not persist any binding when one role preflight fails", async () => {
    const f = await fixture();
    f.ctx.agentPresets.standingKeyFor.mockRejectedValueOnce(new Error("missing Preset"));
    try {
        expect(await f.run()).toMatchObject({
            kind: "rejected",
            error: { code: "PRECONDITION_FAILED" }
        });
        expect(f.owner.create).not.toHaveBeenCalled();
        expect(
            f.registry.openMeeting.mock.calls.every(([input]) => input.create === undefined)
        ).toBe(true);
    } finally {
        await f.repository.close();
    }
});
it("serializes concurrent identical creates without duplicate factories", async () => {
    const f = await fixture();
    try {
        const results = await Promise.all([f.run(), f.run()]);
        expect(results[0]).toEqual(results[1]);
        expect(f.owner.create).toHaveBeenCalledTimes(7);
    } finally {
        await f.repository.close();
    }
});
