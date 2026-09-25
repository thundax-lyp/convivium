import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Context } from "@deepseek-ai/cordis";
import Loader from "@deepseek-ai/cordis-plugin-loader";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import { mountAgentLoopTestDependencies } from "@deepseek-ai/dsh-agent-loop-testkit";
import SessionProjections from "@deepseek-ai/dsh-session-projection";
import SessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import AgentPresets from "@deepseek-ai/dsh-agent-presets";
import Skills from "@deepseek-ai/dsh-skill";
import { SessionId } from "@deepseek-ai/dsh-session";
import { expect, it } from "vitest";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import { definitionHash } from "@/role-composition/resolve.js";
import { preflightMeetingIdentity } from "@/role-composition/dsh-capabilities.js";
import { createMeetingAgentOwner } from "@/dsh/meeting-agent-owner.js";

it("isolates seven role scopes through native Presets and unpublished Agent factories", async () => {
    const root = await mkdtemp(join(tmpdir(), "convivium-owner-"));
    const ctx = new Context();
    ctx.baseUrl = new URL("../../../", import.meta.url).href;
    const owner = createMeetingAgentOwner({ ctx, packageRoot: root });
    const signal = new AbortController().signal;
    try {
        await cp(fileURLToPath(new URL("../../../config", import.meta.url)), join(root, "config"), {
            recursive: true
        });
        const definitions = parseAgentDefinitions(
            JSON.parse(await readFile(join(root, "config/definitions.json"), "utf8")).definitions
        );
        // Mount only the native Skill provider here; production tools are exercised in the full profile.
        for (const definition of definitions) {
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
                    }
                ])
            );
        }
        await mountAgentLoopTestDependencies(ctx);
        const toolNames = [
            ...new Set([
                "fixture_host_tool",
                ...definitions.flatMap((d) => [
                    ...(d.toolFilter?.allow ?? []),
                    ...(d.toolFilter?.deny ?? [])
                ])
            ])
        ];
        for (const name of toolNames)
            ctx.effect(() =>
                ctx.tools.register({
                    name,
                    description: "Scope fixture",
                    parameters: { type: "object", properties: {} },
                    output: { schema: { type: "object", properties: {} }, render: () => [] },
                    execute: async () => ({})
                })
            );
        await ctx.plugin(SessionProjections);
        await ctx.plugin(Skills);
        await ctx.plugin(Loader, {
            baseUrl: pathToFileURL(fileURLToPath(new URL("../../../", import.meta.url))).href
        });
        await ctx.plugin(AgentPresets, {
            includeShippedRoot: false,
            includeUserRoot: false,
            roots: [{ path: join(root, "config/presets"), trust: "system" }],
            default: "convivium-manager"
        });
        await ctx.plugin(SessionPersistence, { root: join(root, "sessions"), compression: "none" });
        await ctx.plugin(AgentLoop, { agents: [] });
        const publications: string[] = [];
        ctx.on("agent/created", ({ agent }) => {
            publications.push(agent.id);
        });
        for (const [index, definition] of definitions.entries()) {
            const preflight = await preflightMeetingIdentity({
                ctx,
                cwd: root,
                packageRoot: root,
                meetingId: "meeting",
                identityId: `identity-${index}`,
                sessionId: `session-${index}`,
                definition,
                binding: {
                    agentDefinitionId: definition.agentDefinitionId,
                    definitionVersion: definition.definitionVersion,
                    definitionHash: definitionHash(definition)
                },
                agentOptions: { provider: "fixture", model: "fixture" },
                now: Date.now(),
                signal
            });
            expect(preflight.kind).toBe("ready");
            if (preflight.kind !== "ready") throw new Error(preflight.error.message);
            const descriptor = preflight.descriptor;
            const ownership = {
                id: `ownership-${index}`,
                meetingId: descriptor.meetingId,
                identityId: descriptor.identityId,
                sessionId: descriptor.sessionId,
                definition: descriptor.definition,
                resources: descriptor.resources,
                agentOptions: descriptor.agentOptions,
                descriptorId: descriptor.descriptorId,
                descriptorHash: descriptor.descriptorHash,
                sessionLabel: "fixture",
                role: "participant" as const,
                lifecycleStatus: "provisioning" as const,
                capabilityStatus: "active" as const,
                createdAt: 1,
                updatedAt: 1
            };
            await owner.create({ ownership, descriptor, definition, signal });
            const first = ctx.agents.get(SessionId(ownership.sessionId))!;
            expect(first.session.header.parentSession).toBeUndefined();
            expect(first.session.header.agentPreset).toBe(definition.dshPresetId);
            expect(
                (await ctx.skills.snapshot({ scope: first, cwd: root })).skills
                    .map((skill) => skill.name)
                    .sort()
            ).toEqual(definition.requiredSkillNames);
            expect(
                (await ctx.systemPrompt.assemble({ scope: first })).sections.find(
                    (section) => section.name === "convivium:role-identity"
                )?.text
            ).toBe(
                await readFile(
                    join(root, "config/agents", definition.roleDefinitionId, "2.0.0/AGENTS.md"),
                    "utf8"
                )
            );
            expect(ctx.tools.schemas(first)).toEqual([]);
            await ctx.sessions.flush(first.session);
            await owner.resume({
                ownership: { ...ownership, lifecycleStatus: "active" },
                definition,
                purpose: "delivery",
                signal
            });
            const second = ctx.agents.get(SessionId(ownership.sessionId))!;
            expect(second).not.toBe(first);
            expect(second.id).toBe(first.id);
            const expectedTools =
                definition.toolFilter?.allow ??
                toolNames.filter((name) => !definition.toolFilter?.deny?.includes(name));
            expect(
                ctx.tools
                    .schemas(second)
                    .map((tool) => tool.name)
                    .sort()
            ).toEqual([...expectedTools].sort());
            await owner.suspend({ ownership, reason: "pause" });
            expect(ctx.agents.get(SessionId(ownership.sessionId))).toBeUndefined();
        }
        expect(new Set(publications).size).toBe(7);
    } finally {
        await owner.disposeAll();
        await ctx.fiber.dispose();
        await rm(root, { recursive: true, force: true });
    }
});
