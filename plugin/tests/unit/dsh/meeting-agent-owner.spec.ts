import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAgentDefinitions } from "@/role-composition/model.ts";
import { preflightMeetingIdentity } from "@/role-composition/dsh-capabilities.ts";
import { definitionHash } from "@/role-composition/resolve.ts";
import { createMeetingAgentOwner } from "@/dsh/meeting-agent-owner.ts";

const directories: string[] = [];
afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
    );
});
const fixture = async (acpCodex?) => {
    const workspaceRoot = await realpath(await mkdtemp(join(tmpdir(), "convivium-owner-unit-")));
    directories.push(workspaceRoot);
    const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const definitions = parseAgentDefinitions(
        JSON.parse(
            await readFile(new URL("../../../config/definitions.json", import.meta.url), "utf8")
        ).definitions
    );
    const definition = definitions.find((d) => d.roleDefinitionId === "domain_architect")!;
    const path = `${packageRoot}config/skills/repository-analysis/SKILL.md`;
    const skill = {
        name: "repository-analysis",
        description: "Repository",
        provider: definition.dshPresetId,
        source: "custom",
        path,
        resourceBase: {
            kind: "directory",
            path: `${packageRoot}config/skills/repository-analysis`
        },
        invocation: { modelInvocable: true, userInvocable: true },
        content: (await readFile(path, "utf8")).replace(/^---\n[\s\S]*?\n---\n/, "").trim()
    };
    const restrictions = [];
    const gateDisposals = [];
    const instructions = [];
    const handles = [];
    const listeners = new Map();
    const emit = (event, payload) => {
        for (const listener of listeners.get(event) ?? []) {
            listener(payload);
        }
    };
    const header = {
        cwd: join(workspaceRoot, "meetings", "meeting", "agents", "identity"),
        agentPreset: definition.dshPresetId
    };
    await mkdir(header.cwd, { recursive: true });
    const skills = {
        snapshot: async () => ({ complete: true, skills: [skill] }),
        get: async (name) => (name === skill.name ? skill : undefined)
    };
    const agentCtx = {
        agent: { session: { header } },
        systemPrompt: { section: vi.fn((value) => instructions.push(value)) },
        tools: {
            restrict: vi.fn((value) => {
                restrictions.push(value);
                const dispose = vi.fn();
                if (value.allow?.length === 0) {
                    gateDisposals.push(dispose);
                }
                return dispose;
            })
        },
        skills
    };
    const factory = async (options) => {
        const handle = {
            agent: {
                options: options.agentOptions,
                id: options.sessionId ?? options.resumeSessionId,
                session: { id: options.sessionId ?? options.resumeSessionId, header },
                cancel: vi.fn(),
                whenIdle: vi.fn(async () => {}),
                followup: vi.fn(),
                steer: vi.fn()
            },
            dispose: vi.fn(async () => {})
        };
        await options.setup(agentCtx, handle.agent);
        handles.push(handle);
        return handle;
    };
    const ctx = {
        llm: { resolveCallConfig: async (config) => config, resolveModelInfo: async () => ({}) },
        agentPresets: {
            acquireScope: async () => ({ key: {}, [Symbol.asyncDispose]: async () => {} }),
            mount: vi.fn(async () => {})
        },
        skills,
        on: vi.fn((event, listener) => {
            const eventListeners = listeners.get(event) ?? new Set();
            eventListeners.add(listener);
            listeners.set(event, eventListeners);
            return () => eventListeners.delete(listener);
        }),
        agents: { get: vi.fn(() => undefined), create: vi.fn(factory), resume: vi.fn(factory) },
        sessions: { flush: vi.fn(async () => true) }
    };
    const signal = new AbortController().signal;
    const preflight = await preflightMeetingIdentity({
        ctx,
        cwd: packageRoot,
        packageRoot,
        definition,
        binding: {
            agentDefinitionId: definition.agentDefinitionId,

            definitionHash: definitionHash(definition)
        },
        agentOptions: { provider: acpCodex ? "acp-codex" : "host", model: "model" },
        meetingId: "meeting",
        identityId: "identity",
        sessionId: "session",
        now: Date.now(),
        signal
    });
    if (preflight.kind !== "ready") {
        throw new Error(preflight.error.message);
    }
    const d = preflight.descriptor;
    const ownership = {
        id: "ownership",
        meetingId: d.meetingId,
        identityId: d.identityId,
        sessionId: d.sessionId,
        definition: d.definition,
        resources: d.resources,
        agentOptions: d.agentOptions,
        descriptorId: d.descriptorId,
        descriptorHash: d.descriptorHash,
        sessionLabel: "role",
        role: "participant",
        lifecycleStatus: "provisioning",
        capabilityStatus: "active",
        createdAt: 1,
        updatedAt: 1
    };
    return {
        ctx,
        definition,
        descriptor: d,
        ownership,
        signal,
        restrictions,
        gateDisposals,
        instructions,
        handles,
        emit,
        header,
        workspaceRoot,
        owner: createMeetingAgentOwner({ ctx, packageRoot, workspaceRoot, acpCodex })
    };
};
describe("meeting Agent owner", () => {
    it("prepares ACP before publication and persists delivery before enqueue without wake or replay", async () => {
        let state = "unseen";
        let text: string | undefined;
        const acpCodex = {
            prepareSession: vi.fn(async () => {}),
            stopSession: vi.fn(async () => {}),
            deliveryState: vi.fn(() => state),
            beginDelivery: vi.fn(async (input) => {
                if (text !== undefined && input.text !== text) {
                    throw new Error("ACP_CODEX_DELIVERY_CONFLICT");
                }
                text = input.text;
                if (state === "unseen") {
                    state = "pending";
                }
            }),
            markDeliveryQueued: vi.fn(async () => {}),
            checkpoint: vi.fn(async () => {}),
            finishDelivery: vi.fn(async () => {
                state = "completed";
            }),
            blockFor: () => undefined
        };
        const f = await fixture(acpCodex);
        acpCodex.prepareSession.mockImplementation(async () => {
            expect(f.handles).toHaveLength(0);
        });
        await f.owner.create(f);
        expect(acpCodex.prepareSession).toHaveBeenCalledWith(
            f.handles[0].agent,
            "provisioning",
            f.signal
        );
        acpCodex.prepareSession.mockImplementation(async () => {});
        const ownership = { ...f.ownership, lifecycleStatus: "active" };
        await f.owner.resume({ ...f, ownership, purpose: "delivery" });
        expect(f.handles).toHaveLength(1);
        expect(f.ctx.agents.resume).not.toHaveBeenCalled();
        expect(acpCodex.stopSession).not.toHaveBeenCalled();
        expect(f.gateDisposals[0]).toHaveBeenCalledOnce();
        expect(acpCodex.prepareSession).toHaveBeenLastCalledWith(
            f.handles[0].agent,
            "delivery",
            f.signal
        );
        const agent = f.handles[0].agent;
        agent.followup.mockImplementation(() => {
            expect(state).toBe("pending");
        });
        const input = {
            ownership,
            deliveryId: "effect",
            text: "Read meeting",
            authorize: async () => {},
            signal: f.signal
        };
        expect(await f.owner.deliver(input)).toBe(true);
        expect(acpCodex.markDeliveryQueued).toHaveBeenCalledWith("session", "effect");
        expect(acpCodex.checkpoint).toHaveBeenCalledWith("session", f.signal);
        expect(acpCodex.finishDelivery).toHaveBeenCalledWith("session", "effect", f.signal);
        expect(agent.whenIdle).toHaveBeenCalled();
        expect(agent.steer).not.toHaveBeenCalled();
        expect(await f.owner.deliverObserved(input)).toEqual({
            durable: true,
            outcome: "completed"
        });
        expect(agent.followup).toHaveBeenCalledTimes(1);
        await expect(f.owner.deliver({ ...input, text: "changed" })).rejects.toThrow(
            "ACP_CODEX_DELIVERY_CONFLICT"
        );
        await f.owner.disposeAll();
        expect(acpCodex.stopSession).toHaveBeenLastCalledWith("session");
        expect(acpCodex.stopSession.mock.invocationCallOrder.at(-1)).toBeLessThan(
            f.handles[0].dispose.mock.invocationCallOrder[0]
        );
    });

    it("cancels active ACP delivery before waiting for owner shutdown", async () => {
        let idle!: () => void;
        const waiting = new Promise<void>((resolve) => {
            idle = resolve;
        });
        const acpCodex = {
            prepareSession: vi.fn(async () => {}),
            stopSession: vi.fn(async () => {}),
            deliveryState: () => "unseen",
            beginDelivery: vi.fn(async () => {}),
            markDeliveryQueued: vi.fn(async () => {}),
            checkpoint: vi.fn(async () => {}),
            finishDelivery: vi.fn(async () => {}),
            reconcileSession: vi.fn(async () => {})
        };
        const f = await fixture(acpCodex);
        const ownership = { ...f.ownership, lifecycleStatus: "active" };
        await f.owner.resume({ ...f, ownership, purpose: "delivery" });
        f.handles[0].agent.whenIdle.mockImplementation(() => waiting);
        const delivery = f.owner.deliver({
            ownership,
            deliveryId: "active",
            text: "Read",
            authorize: async () => {},
            signal: f.signal
        });
        await vi.waitFor(() => expect(f.handles[0].agent.whenIdle).toHaveBeenCalled());
        const shutdown = f.owner.disposeAll();
        try {
            await vi.waitFor(() => expect(f.handles[0].agent.cancel).toHaveBeenCalled());
            expect(acpCodex.stopSession).toHaveBeenCalledWith("session");
        } finally {
            idle();
            await delivery;
            await shutdown;
        }
    });

    it("does not enqueue a pending ACP delivery whose original process task is unavailable", async () => {
        const acpCodex = {
            prepareSession: vi.fn(async () => {}),
            stopSession: vi.fn(async () => {}),
            deliveryState: () => "pending",
            beginDelivery: vi.fn(async () => {}),
            reconcileSession: vi.fn(async () => {
                throw new Error("ACP_CODEX_RECOVERY_REQUIRED");
            }),
            blockFor: () => undefined
        };
        const f = await fixture(acpCodex);
        const ownership = { ...f.ownership, lifecycleStatus: "active" };
        await f.owner.resume({ ...f, ownership, purpose: "delivery" });
        await expect(
            f.owner.deliver({
                ownership,
                deliveryId: "old",
                text: "Read",
                authorize: async () => {},
                signal: f.signal
            })
        ).rejects.toThrow("ACP_CODEX_RECOVERY_REQUIRED");
        expect(acpCodex.beginDelivery).toHaveBeenCalled();
        expect(f.handles[0].agent.followup).not.toHaveBeenCalled();
        expect(f.handles[0].agent.steer).not.toHaveBeenCalled();
        await f.owner.disposeAll();
    });

    it("rejects a resumed Session whose cwd differs without rewriting its header", async () => {
        const f = await fixture();
        await f.owner.create(f);
        await f.owner.suspend({ ownership: f.ownership, reason: "pause" });
        f.header.cwd = join(f.workspaceRoot, "other");
        await expect(f.owner.resume({ ...f, purpose: "provisioning" })).rejects.toThrow(
            "Session header differs"
        );
        expect(f.header.cwd).toBe(join(f.workspaceRoot, "other"));
    });
    it("refuses a symlink in the managed directory without writing into its target", async () => {
        const f = await fixture();
        const foreign = join(f.workspaceRoot, "foreign");
        await mkdir(foreign);
        await rm(join(f.workspaceRoot, "meetings"), { recursive: true });
        await symlink(foreign, join(f.workspaceRoot, "meetings"));
        await expect(f.owner.create(f)).rejects.toThrow("Agent directory unavailable");
        expect(f.ctx.agents.create).not.toHaveBeenCalled();
        expect(await readdir(foreign)).toEqual([]);
    });

    it("creates a restricted peer then replaces its scope for active delivery", async () => {
        const f = await fixture();
        await f.owner.create(f);
        expect(f.ctx.agents.create).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: "session",
                meta: { agentPreset: f.definition.dshPresetId, cwd: f.header.cwd },
                agentOptions: f.ownership.agentOptions
            })
        );
        expect(f.restrictions.at(-1)).toEqual({ allow: [] });
        expect(f.instructions[0]).toMatchObject({ name: "convivium:role-identity" });
        const active = { ...f.ownership, lifecycleStatus: "active" };
        await f.owner.resume({ ...f, ownership: active, purpose: "delivery" });
        expect(f.handles[0].dispose).toHaveBeenCalledTimes(1);
        expect(f.ctx.agents.resume).toHaveBeenCalledTimes(1);
        const authorize = vi.fn(async () => {});
        expect(
            await f.owner.deliver({
                ownership: active,
                deliveryId: "effect",
                text: "Read meeting",
                authorize,
                signal: f.signal
            })
        ).toBe(true);
        expect(authorize).toHaveBeenCalledTimes(2);
        expect(f.handles[1].agent.followup).toHaveBeenCalledWith({
            id: "effect",
            role: "user",
            content: [{ type: "text", text: "Read meeting" }],
            source: { kind: "convivium" }
        });
        await f.owner.disposeAll();
    });
    it("preserves retry on false flush and rejects failed post-authorization", async () => {
        const f = await fixture();
        const active = { ...f.ownership, lifecycleStatus: "active" };
        await f.owner.resume({ ...f, ownership: active, purpose: "delivery" });
        f.ctx.sessions.flush.mockResolvedValue(false);
        expect(
            await f.owner.deliver({
                ownership: active,
                deliveryId: "effect",
                text: "Read",
                authorize: async () => {},
                signal: f.signal
            })
        ).toBe(false);
        f.ctx.sessions.flush.mockResolvedValue(true);
        const authorize = vi
            .fn(async () => {})
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("revoked"));
        await expect(
            f.owner.deliver({
                ownership: active,
                deliveryId: "effect",
                text: "Read",
                authorize,
                signal: f.signal
            })
        ).rejects.toThrow("revoked");
        await f.owner.disposeAll();
    });
    it("observes the terminal failure of the turn that claimed a delivery", async () => {
        const f = await fixture();
        const active = { ...f.ownership, lifecycleStatus: "active" };
        await f.owner.resume({ ...f, ownership: active, purpose: "delivery" });
        const agent = f.handles[0].agent;
        agent.followup.mockImplementation((message) => {
            f.emit("agent/inbox/claimed", { agent, message, turn: 7 });
            const error = Object.assign(new Error("tool input is invalid JSON"), {
                code: "MALFORMED_RESPONSE"
            });
            f.emit("agent/error", { agent, turn: 7, error });
        });

        await expect(
            f.owner.deliverObserved({
                ownership: active,
                deliveryId: "effect",
                text: "Contribute",
                authorize: async () => {},
                signal: f.signal
            })
        ).resolves.toEqual({
            durable: true,
            outcome: "failed",
            failureCode: "MALFORMED_RESPONSE",
            failureSummary: "tool input is invalid JSON"
        });
        await f.owner.disposeAll();
    });
    it("wakes a delivery left queued behind an earlier failed turn", async () => {
        const f = await fixture();
        const active = { ...f.ownership, lifecycleStatus: "active" };
        await f.owner.resume({ ...f, ownership: active, purpose: "delivery" });
        const agent = f.handles[0].agent;
        let queuedMessage;
        agent.followup.mockImplementation((message) => {
            queuedMessage = message;
        });
        agent.steer.mockImplementation(() => {
            f.emit("agent/inbox/claimed", { agent, message: queuedMessage, turn: 8 });
        });

        await expect(
            f.owner.deliverObserved({
                ownership: active,
                deliveryId: "effect",
                text: "Contribute",
                authorize: async () => {},
                signal: f.signal
            })
        ).resolves.toEqual({ durable: true, outcome: "completed" });
        expect(agent.steer).toHaveBeenCalledWith(
            expect.objectContaining({ id: "effect:wake", source: { kind: "convivium" } })
        );
        expect(agent.whenIdle).toHaveBeenCalledTimes(2);
        await f.owner.disposeAll();
    });
    it("rejects an observed delivery that remains unclaimed after the wake", async () => {
        const f = await fixture();
        const active = { ...f.ownership, lifecycleStatus: "active" };
        await f.owner.resume({ ...f, ownership: active, purpose: "delivery" });

        await expect(
            f.owner.deliverObserved({
                ownership: active,
                deliveryId: "effect",
                text: "Contribute",
                authorize: async () => {},
                signal: f.signal
            })
        ).rejects.toThrow("DELIVERY_NOT_CLAIMED");
        expect(f.handles[0].agent.steer).toHaveBeenCalledOnce();
        await f.owner.disposeAll();
    });
    it("refuses unowned live Agents and expired creation without allocation", async () => {
        const f = await fixture();
        await expect(
            f.owner.create({ ...f, descriptor: { ...f.descriptor, expiresAt: 0 } })
        ).rejects.toThrow();
        expect(f.ctx.agents.create).not.toHaveBeenCalled();
        f.ctx.agents.get.mockReturnValue({ id: "session" });
        await expect(
            f.owner.resume({
                ...f,
                ownership: { ...f.ownership, lifecycleStatus: "active" },
                purpose: "delivery"
            })
        ).rejects.toThrow("RECOVERY_UNAVAILABLE");
        expect(f.ctx.agents.resume).not.toHaveBeenCalled();
        await f.owner.disposeAll();
    });
    it("rejects a parent-bound Session during unpublished setup", async () => {
        const f = await fixture();
        Object.assign(f.header, { parentSession: "old-captain" });
        await expect(
            f.owner.resume({
                ...f,
                ownership: { ...f.ownership, lifecycleStatus: "active" },
                purpose: "delivery"
            })
        ).rejects.toThrow("RECOVERY_UNAVAILABLE");
        expect(f.handles).toHaveLength(0);
        await f.owner.disposeAll();
    });
    it("suspends without recovery and requires revocation before stop", async () => {
        const f = await fixture();
        await f.owner.suspend({ ownership: f.ownership, reason: "pause" });
        expect(f.ctx.agents.resume).not.toHaveBeenCalled();
        await f.owner.create(f);
        await expect(f.owner.stop({ ...f, reason: "archive" })).rejects.toThrow();
        await f.owner.stop({
            ...f,
            ownership: { ...f.ownership, capabilityStatus: "revoked" },
            reason: "archive"
        });
        expect(f.handles[0].agent.cancel).toHaveBeenCalled();
        expect(f.handles[0].dispose).toHaveBeenCalledTimes(1);
        await f.owner.disposeAll();
    });
});

it("keeps ACP provisioning restricted if ownership is not active or provider preparation fails", async () => {
    const acpCodex = { prepareSession: vi.fn(async () => {}), stopSession: vi.fn(async () => {}) };
    const f = await fixture(acpCodex);
    await f.owner.create(f);
    await expect(f.owner.resume({ ...f, purpose: "delivery" })).rejects.toThrow(
        "invalid ownership purpose"
    );
    expect(f.gateDisposals[0]).not.toHaveBeenCalled();
    acpCodex.prepareSession.mockRejectedValue(new Error("ACP_CODEX_RECOVERY_REQUIRED"));
    await expect(
        f.owner.resume({
            ...f,
            ownership: { ...f.ownership, lifecycleStatus: "active" },
            purpose: "delivery"
        })
    ).rejects.toThrow("ACP_CODEX_RECOVERY_REQUIRED");
    expect(f.gateDisposals[0]).not.toHaveBeenCalled();
    expect(f.ctx.agents.resume).not.toHaveBeenCalled();
    expect(acpCodex.stopSession).not.toHaveBeenCalled();
    await f.owner.disposeAll();
});

it("releases the Agent handle even when ACP stop fails", async () => {
    const failure = new Error("stop failed");
    const acpCodex = {
        prepareSession: vi.fn(async () => {}),
        stopSession: vi.fn(async () => {
            throw failure;
        })
    };
    const f = await fixture(acpCodex);
    await f.owner.create(f);
    await expect(f.owner.disposeAll()).rejects.toBeInstanceOf(AggregateError);
    expect(f.handles[0].agent.whenIdle).toHaveBeenCalled();
    expect(f.handles[0].dispose).toHaveBeenCalledOnce();
});

it("drains non-ACP delivery before cancelling its handle on shutdown", async () => {
    const f = await fixture();
    const ownership = { ...f.ownership, lifecycleStatus: "active" };
    await f.owner.resume({ ...f, ownership, purpose: "delivery" });
    const idle = Promise.withResolvers();
    f.ctx.sessions.flush.mockImplementation(async () => {
        await idle.promise;
        return true;
    });
    f.ctx.sessions.flush.mockClear();
    const delivery = f.owner.deliver({
        ownership,
        deliveryId: "active",
        text: "Read",
        authorize: async () => {},
        signal: f.signal
    });
    await vi.waitFor(() => expect(f.ctx.sessions.flush).toHaveBeenCalled());
    const shutdown = f.owner.disposeAll();
    try {
        expect(f.handles[0].agent.cancel).not.toHaveBeenCalled();
    } finally {
        idle.resolve(undefined);
        await delivery;
        await shutdown;
    }
    expect(f.handles[0].agent.cancel).toHaveBeenCalledOnce();
    expect(f.handles[0].dispose).toHaveBeenCalledOnce();
});
