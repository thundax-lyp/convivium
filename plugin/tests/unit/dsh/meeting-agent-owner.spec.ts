import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parseAgentDefinitions } from "@/role-composition/model.ts";
import { preflightMeetingIdentity } from "@/role-composition/dsh-capabilities.ts";
import { definitionHash } from "@/role-composition/resolve.ts";
import { createMeetingAgentOwner } from "@/dsh/meeting-agent-owner.ts";

const fixture = async () => {
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
    const instructions = [];
    const handles = [];
    const listeners = new Map();
    const emit = (event, payload) => {
        for (const listener of listeners.get(event) ?? []) {
            listener(payload);
        }
    };
    const header = { cwd: packageRoot, agentPreset: definition.dshPresetId };
    const skills = {
        snapshot: async () => ({ complete: true, skills: [skill] }),
        get: async (name) => (name === skill.name ? skill : undefined)
    };
    const agentCtx = {
        agent: { session: { header } },
        systemPrompt: { section: vi.fn((value) => instructions.push(value)) },
        tools: { restrict: vi.fn((value) => restrictions.push(value)) },
        skills
    };
    const factory = async (options) => {
        const handle = {
            agent: {
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
        llm: { resolveCallConfig: async (config) => config },
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
        agentOptions: { provider: "host", model: "model" },
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
        instructions,
        handles,
        emit,
        header,
        owner: createMeetingAgentOwner({ ctx, packageRoot })
    };
};
describe("meeting Agent owner", () => {
    it("creates a restricted peer then replaces its scope for active delivery", async () => {
        const f = await fixture();
        await f.owner.create(f);
        expect(f.ctx.agents.create).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: "session",
                meta: { agentPreset: f.definition.dshPresetId },
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
