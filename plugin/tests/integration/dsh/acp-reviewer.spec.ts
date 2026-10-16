import { cp, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Context } from "@deepseek-ai/cordis";
import Loader from "@deepseek-ai/cordis-plugin-loader";
import {
    mountAgentLoopTestDependencies,
    mountAgentLoopTestHarness
} from "@deepseek-ai/dsh-agent-loop-testkit";
import SessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import AgentPresetRegistry from "@deepseek-ai/dsh-agent-preset-registry";
import AgentPreset from "@deepseek-ai/dsh-agent-preset";
import Subagents from "@deepseek-ai/dsh-subagent";
import * as Spawn from "@deepseek-ai/dsh-subagent-spawn-in-process";
import Skills from "@deepseek-ai/dsh-skill";
import LocalSubprocess from "@deepseek-ai/dsh-subprocess-local";
import Storage from "@deepseek-ai/dsh-storage";
import * as Domains from "@deepseek-ai/dsh-storage-domain";
import * as Sqlite from "@deepseek-ai/dsh-storage-sqlite";
import { SessionId } from "@deepseek-ai/dsh-session";
import { expect, it, vi } from "vitest";
import { createCodexAcpProvider } from "@/dsh/acp-codex/provider.ts";
import CodexCompactionBoundary from "@/dsh/acp-codex/compaction.ts";
import { runAcpReviewWorker } from "@/dsh/acp-review-worker.ts";
import { createMeetingAgentOwner } from "@/dsh/meeting-agent-owner.ts";
import { resolveMeetingCaller } from "@/dsh/caller-resolver.ts";
import { encodeMeetingIdentitySessionLabel } from "@/dsh/labels.ts";
import { parseAgentDefinitions } from "@/role-composition/model.ts";
import { definitionHash } from "@/role-composition/resolve.ts";
import { preflightMeetingIdentity } from "@/role-composition/dsh-capabilities.ts";
import { registerMeetingTools } from "@/tools/register-tools.ts";
import type { SessionOwnership } from "@/repository/index.ts";

it("keeps the Reviewer identity and durable delivery through native host workers, warm activation and cold load", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "convivium-acp-owner-")));
    const packageRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const script = fileURLToPath(new URL("../../fixtures/scripted-acp-agent.mjs", import.meta.url));
    const signal = new AbortController().signal;
    const contexts: Context[] = [];
    const providers: Awaited<ReturnType<typeof createCodexAcpProvider>>[] = [];
    const owners: ReturnType<typeof createMeetingAgentOwner>[] = [];
    const calls: string[] = [];
    const submitted: unknown[] = [];
    const children: { provider: string; model?: string }[] = [];
    let ownership: SessionOwnership;
    try {
        await cp(join(packageRoot, "config"), join(root, "config"), { recursive: true });
        await symlink(join(packageRoot, "node_modules"), join(root, "node_modules"));
        const definition = parseAgentDefinitions(
            JSON.parse(await readFile(join(root, "config/definitions.json"), "utf8")).definitions
        ).find((entry) => entry.roleDefinitionId === "verification_reviewer")!;
        await writeFile(
            join(root, "config/presets", definition.dshPresetId, "agent.cordis.yml"),
            JSON.stringify([
                {
                    id: "skills",
                    name: "@deepseek-ai/dsh-skill-filesystem",
                    config: {
                        providerName: definition.dshPresetId,
                        includeDefaultRoots: false,
                        watch: false,
                        customSkillDirs: definition.requiredSkillNames.map((name) =>
                            join(root, "config/skills", name)
                        )
                    }
                },
                { id: "compaction", name: "cordis:acp-boundary", isolate: { compaction: true } }
            ])
        );
        vi.stubEnv("CODEX_PATH", script);
        vi.stubEnv("CODEX_HOME", root);
        const host = async () => {
            const ctx = new Context();
            contexts.push(ctx);
            ctx.baseUrl = new URL("../../../", import.meta.url).href;
            await mountAgentLoopTestDependencies(ctx);
            await mountAgentLoopTestHarness(ctx);
            ctx.provide("tokenMeter", {});
            await ctx.plugin(Skills);
            await ctx.plugin(Loader, { baseUrl: ctx.baseUrl });
            ctx.loader.builtins["acp-boundary"] = CodexCompactionBoundary;
            await ctx.plugin(AgentPresetRegistry, { default: definition.dshPresetId });
            await ctx.plugin(AgentPreset, {
                id: definition.dshPresetId,
                plugins: [
                    {
                        id: "composition",
                        name: "@deepseek-ai/cordis-plugin-include",
                        config: {
                            path: new URL(
                                `file://${join(root, "config/presets", definition.dshPresetId, "agent.cordis.yml")}`
                            ).href
                        }
                    }
                ]
            });
            await ctx.plugin(SessionPersistence, {
                root: join(root, "sessions"),
                compression: "none"
            });
            await ctx.plugin(Subagents);
            await ctx.plugin(Spawn, { providerName: "spawn" });
            await ctx.plugin(LocalSubprocess);
            await ctx.plugin(Storage);
            await ctx.plugin(Sqlite, { path: join(root, "storage.sqlite") });
            await ctx.plugin(Domains, { backend: "sqlite" });
            const provider = await createCodexAcpProvider(ctx, {
                command: process.execPath,
                args: [script, "provider"]
            });
            providers.push(provider);
            // The Skill tool name participates in the packaged filter; this scenario never calls it.
            ctx.tools.register({
                name: "skill",
                description: "Unused Skill tool",
                parameters: { type: "object", properties: {} },
                output: { schema: { type: "object", properties: {} }, render: () => [] },
                execute: async () => {
                    throw new Error("Unexpected Skill execution");
                }
            });
            registerMeetingTools({
                registry: ctx.tools,
                application: {
                    execute: async (command) => {
                        submitted.push(command.action);
                        return { kind: "accepted" };
                    }
                },
                acpCodex: provider,
                reviewWorkers: ctx.subagents,
                reviewPrompts: {
                    resolve: async () => ({
                        prompt: "Return a structured review for version-1",
                        claimId: "claim-1",
                        roundId: "round-1"
                    })
                },
                callers: {
                    resolve: (agent, signal) =>
                        resolveMeetingCaller(
                            agent,
                            {
                                findBySessionId: async (id) =>
                                    id === ownership?.sessionId
                                        ? { meetingId: ownership.meetingId, ownership }
                                        : undefined
                            },
                            signal
                        )
                },
                reader: {
                    read: async (_request, caller) => {
                        calls.push(caller.identityId);
                        return undefined;
                    }
                }
            });
            const owner = createMeetingAgentOwner({
                ctx,
                packageRoot: root,
                workspaceRoot: root,
                acpCodex: provider
            });
            ctx.on("tools/result", (exec) => {
                calls.push(exec.name);
            });
            ctx.on("agent/created", ({ agent }) => {
                agent.ctx.on("tools/result", (exec) => {
                    calls.push(exec.name);
                });
                if (agent.session.header.parentSession) {
                    children.push({ provider: agent.options.provider, model: agent.options.model });
                }
            });
            owners.push(owner);
            return { ctx, provider, owner };
        };
        const first = await host();
        const preflight = await preflightMeetingIdentity({
            ctx: first.ctx,
            cwd: root,
            packageRoot: root,
            meetingId: "meeting",
            identityId: "reviewer",
            sessionId: "reviewer-session",
            definition,
            binding: {
                agentDefinitionId: definition.agentDefinitionId,
                definitionHash: definitionHash(definition)
            },
            agentOptions: {
                provider: "acp-codex",
                model: "scripted-codex",
                reasoningEffort: "medium"
            },
            now: Date.now(),
            signal
        });
        expect(preflight.kind).toBe("ready");
        if (preflight.kind !== "ready") {
            throw new Error(preflight.error.message);
        }
        const descriptor = preflight.descriptor;
        ownership = {
            id: "reviewer-owner",
            meetingId: descriptor.meetingId,
            identityId: descriptor.identityId,
            sessionId: descriptor.sessionId,
            definition: descriptor.definition,
            resources: descriptor.resources,
            agentOptions: descriptor.agentOptions,
            descriptorId: descriptor.descriptorId,
            descriptorHash: descriptor.descriptorHash,
            sessionLabel: encodeMeetingIdentitySessionLabel({
                meetingId: "meeting",
                identityId: "reviewer",
                role: "evidence_reviewer"
            }),
            role: "evidence_reviewer",
            lifecycleStatus: "provisioning",
            capabilityStatus: "active",
            createdAt: 1,
            updatedAt: 1
        };
        await first.owner.create({ ownership, descriptor, definition, signal });
        const created = first.ctx.agents.get(SessionId(ownership.sessionId))!;
        expect(created.session.header.parentSession).toBeUndefined();
        expect(created.session.header.cwd).toBe(join(root, "meetings/meeting/agents/reviewer"));
        expect(
            (await first.ctx.systemPrompt.assemble({ scope: created })).sections.find(
                (section) => section.name === "convivium:role-identity"
            )?.text
        ).toBe(await readFile(join(root, "config/agents/verification_reviewer/AGENTS.md"), "utf8"));
        ownership = { ...ownership, lifecycleStatus: "active" };
        await first.owner.resume({ ownership, definition, purpose: "delivery", signal });
        expect(first.ctx.agents.get(SessionId(ownership.sessionId)) === created).toBe(true);
        const activationTrace = (await readFile(join(root, "scripted-rpc.jsonl"), "utf8"))
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        expect(activationTrace.filter((entry) => entry.method === "session/load")).toHaveLength(0);
        const input = {
            ownership,
            deliveryId: "first-delivery",
            text: "meeting-id=meeting",
            authorize: async () => {},
            signal
        };
        expect(await first.owner.deliverObserved(input)).toEqual({
            durable: true,
            outcome: "completed"
        });
        expect(calls).toEqual([]);
        const count = async () =>
            (await readFile(join(root, "scripted-rpc.jsonl"), "utf8"))
                .trim()
                .split("\n")
                .map((line) => JSON.parse(line));
        const prompts = (await count()).filter((entry) => entry.method === "session/prompt").length;
        expect(await first.owner.deliver(input)).toBe(true);
        await expect(first.owner.deliver({ ...input, text: "changed" })).rejects.toMatchObject({
            code: "ACP_CODEX_DELIVERY_CONFLICT"
        });
        expect((await count()).filter((entry) => entry.method === "session/prompt")).toHaveLength(
            prompts
        );
        await first.owner.disposeAll();
        await first.provider.close();
        await first.ctx.fiber.dispose();
        const second = await host();
        await second.owner.resume({ ownership, definition, purpose: "delivery", signal });
        expect(await second.owner.deliver({ ...input, deliveryId: "second-delivery" })).toBe(true);
        expect(calls).toEqual([]);
        expect(
            await second.owner.deliver({
                ...input,
                deliveryId: "review-delivery",
                text: "review-worker=version-1"
            })
        ).toBe(true);
        const nativeInput = {
            ctx: second.ctx,
            acpCodex: second.provider,
            ownership,
            versionId: "version-1",
            prompt: "Review the immutable version and fixed baseline.",
            signal
        };
        const result = await runAcpReviewWorker(nativeInput);
        expect(result).toMatchObject({
            model: "scripted-codex",
            output: { versionId: "version-1", scope: "first round" }
        });
        expect(second.ctx.agents.get(SessionId(result.workerSessionId))).toBeUndefined();
        expect(submitted).toEqual([]);
        expect(calls).toEqual([]);
        expect(children).toEqual([{ provider: "acp-codex", model: "scripted-codex" }]);
        const trace = await count();
        const ids = trace
            .filter((entry) => entry.method === "session/prompt")
            .map((entry) => entry.sessionId);
        expect(ids[0]).toBe(ids[1]);
        expect(ids[2]).toBe(ids[0]);
        expect(ids[3]).not.toBe(ids[0]);
        expect(
            trace
                .filter((entry) => ["session/new", "session/load"].includes(entry.method))
                .every((entry) => entry.mcpCount === 0)
        ).toBe(true);
        expect(
            JSON.stringify(trace.filter((entry) => entry.method === "session/prompt"))
        ).not.toContain("convivium_run_review_worker");
        await writeFile(join(root, "scripted-fault"), "native-invalid-json");
        await expect(runAcpReviewWorker(nativeInput)).rejects.toBeInstanceOf(SyntaxError);
        expect(second.provider.blockFor(ownership.sessionId)).toBeUndefined();
        await rm(join(root, "scripted-fault"));
        await expect(
            runAcpReviewWorker({
                ...nativeInput,
                ownership: { ...ownership, capabilityStatus: "revoked" }
            })
        ).rejects.toThrow("REVIEW_OWNERSHIP_INVALID");
        const control = new AbortController();
        await writeFile(join(root, "scripted-fault"), "pending");
        const cancelled = runAcpReviewWorker({ ...nativeInput, signal: control.signal });
        const rejected = expect(cancelled).rejects.toThrow();
        await vi.waitFor(async () =>
            expect(
                (await count()).filter((entry) => entry.method === "session/prompt")
            ).toHaveLength(6)
        );
        control.abort();
        await rejected;
        expect(second.provider.blockFor(ownership.sessionId)?.code).toBe(
            "ACP_CODEX_OUTCOME_UNKNOWN"
        );
        await expect(runAcpReviewWorker(nativeInput)).rejects.toMatchObject({
            code: "ACP_CODEX_OUTCOME_UNKNOWN"
        });
        await rm(join(root, "scripted-fault"));
        expect(calls).toEqual([]);
        const loads = trace.filter((entry) => entry.method === "session/load").length;
        await second.owner.stop({
            ownership: { ...ownership, capabilityStatus: "revoked", lifecycleStatus: "closing" },
            definition,
            reason: "archive",
            signal
        });
        expect((await count()).filter((entry) => entry.method === "session/load")).toHaveLength(
            loads
        );
    } finally {
        for (const owner of owners.reverse()) {
            await owner.disposeAll();
        }
        for (const provider of providers.reverse()) {
            await provider.close();
        }
        for (const ctx of contexts.reverse()) {
            await ctx.fiber.dispose();
        }
        vi.unstubAllEnvs();
        await rm(root, { recursive: true, force: true });
    }
});
