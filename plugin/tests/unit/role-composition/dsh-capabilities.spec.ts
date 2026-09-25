import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAgentDefinitions } from "@/role-composition/model.js";
import { definitionHash } from "@/role-composition/resolve.js";
import { preflightMeetingIdentity } from "@/role-composition/dsh-capabilities.js";
import { resolveResourceBinding } from "@/role-composition/resource-binding.js";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
const fixture = async (role = "domain_architect") => {
    const packageRoot = await mkdtemp(join(tmpdir(), "peer-preflight-"));
    roots.push(packageRoot);
    await cp(
        fileURLToPath(new URL("../../../config", import.meta.url)),
        join(packageRoot, "config"),
        { recursive: true }
    );
    const definitions = parseAgentDefinitions(
        JSON.parse(await readFile(join(packageRoot, "config/definitions.json"), "utf8")).definitions
    );
    const definition = definitions.find((d) => d.roleDefinitionId === role)!;
    const path = join(packageRoot, "config/skills/repository-analysis/SKILL.md");
    const content = (await readFile(path, "utf8"))
        .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
        .trim();
    const skill = {
        name: "repository-analysis",
        description: "Repository",
        content,
        provider: definition.dshPresetId,
        source: "custom",
        path,
        resourceBase: {
            kind: "directory" as const,
            path: join(packageRoot, "config/skills/repository-analysis")
        },
        invocation: { modelInvocable: true, userInvocable: true }
    };
    const scope = {};
    const skills = {
        snapshot: vi.fn(async () => ({ complete: true, skills: [skill] })),
        get: vi.fn(async (name: string) => (name === skill.name ? skill : undefined))
    };
    const ctx = { agentPresets: { standingKeyFor: vi.fn(async () => scope) }, skills };
    const input = {
        ctx,
        cwd: packageRoot,
        packageRoot,
        definition,
        binding: {
            agentDefinitionId: definition.agentDefinitionId,
            definitionVersion: definition.definitionVersion,
            definitionHash: definitionHash(definition)
        },
        agentOptions: { provider: "host", model: "model" },
        meetingId: "meeting",
        identityId: "identity",
        sessionId: "session",
        now: 100,
        signal: new AbortController().signal
    };
    return { input, skills, scope, path };
};
describe("role resource preflight", () => {
    it("binds the exact role view, immutable resources and expiring descriptor before any Session", async () => {
        const f = await fixture();
        const result = await preflightMeetingIdentity(f.input);
        expect(result.kind).toBe("ready");
        if (result.kind !== "ready") throw new Error(result.error.code);
        expect(result.descriptor).toMatchObject({
            meetingId: "meeting",
            identityId: "identity",
            sessionId: "session",
            expiresAt: 300100,
            definition: f.input.binding,
            agentOptions: f.input.agentOptions
        });
        expect(result.descriptor.resources.skills.map((s) => s.name)).toEqual([
            "repository-analysis"
        ]);
        expect(f.skills.snapshot).toHaveBeenCalledWith({
            scope: f.scope,
            cwd: f.input.cwd,
            signal: f.input.signal
        });
        expect(f.skills.get.mock.calls.map(([name]) => name).sort()).toEqual([
            "arxiv",
            "evidence-review",
            "github",
            "meeting-facilitation",
            "repository-analysis"
        ]);
    });
    it.each([
        "meeting_manager",
        "domain_architect",
        "runtime_engineer",
        "protocol_ui_engineer",
        "verification_reviewer",
        "github_research_analyst",
        "arxiv_research_analyst"
    ])("checks the exact allocation of %s", async (role) => {
        const f = await fixture(role);
        const allocated = await Promise.all(
            f.input.definition.requiredSkillNames.map(async (name) => {
                const path = join(f.input.packageRoot, "config/skills", name, "SKILL.md");
                return {
                    name,
                    description: name,
                    provider: f.input.definition.dshPresetId,
                    source: "custom",
                    path,
                    resourceBase: {
                        kind: "directory" as const,
                        path: join(f.input.packageRoot, "config/skills", name)
                    },
                    invocation: { modelInvocable: true, userInvocable: true },
                    content: (await readFile(path, "utf8"))
                        .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
                        .trim()
                };
            })
        );
        f.skills.snapshot.mockResolvedValue({ complete: true, skills: allocated });
        f.skills.get.mockImplementation(async (name) =>
            allocated.find((skill) => skill.name === name)
        );
        expect(await preflightMeetingIdentity(f.input)).toMatchObject({ kind: "ready" });
        f.skills.get.mockImplementation(async (name) => {
            const skill = allocated.find((value) => value.name === name);
            return skill
                ? { ...skill, invocation: { modelInvocable: false, userInvocable: true } }
                : undefined;
        });
        expect(await preflightMeetingIdentity(f.input)).toMatchObject({ kind: "rejected" });
    });
    it.each(["extra", "missing", "incomplete", "override", "hidden-load"])(
        "rejects %s skills without publishing a descriptor",
        async (mode) => {
            const f = await fixture();
            const snapshot = await f.skills.snapshot();
            if (mode === "extra")
                f.skills.snapshot.mockResolvedValue({
                    complete: true,
                    skills: [...snapshot.skills, { ...snapshot.skills[0], name: "extra" }]
                });
            if (mode === "missing")
                f.skills.snapshot.mockResolvedValue({ complete: true, skills: [] });
            if (mode === "incomplete")
                f.skills.snapshot.mockResolvedValue({ complete: false, skills: snapshot.skills });
            if (mode === "override")
                f.skills.get.mockResolvedValue({ ...snapshot.skills[0], content: "replaced" });
            if (mode === "hidden-load")
                f.skills.get.mockImplementation(async (name) => ({ ...snapshot.skills[0], name }));
            expect(await preflightMeetingIdentity(f.input)).toMatchObject({
                kind: "rejected",
                error: { code: "CAPABILITY_MISSING" }
            });
        }
    );
    it("fingerprints scripts and rejects symlinks and changed identity instructions", async () => {
        const f = await fixture();
        const before = await resolveResourceBinding(f.input);
        const script = join(f.input.packageRoot, "config/skills/repository-analysis/probe.sh");
        await writeFile(script, "first");
        const changed = await resolveResourceBinding(f.input);
        expect(changed.skills[0].sha256).not.toBe(before.skills[0].sha256);
        await rm(script);
        await symlink(f.path, script);
        expect(await preflightMeetingIdentity(f.input)).toMatchObject({ kind: "rejected" });
        await rm(script);
        await writeFile(
            join(f.input.packageRoot, "config/agents/domain_architect/2.0.0/AGENTS.md"),
            "changed"
        );
        expect(await preflightMeetingIdentity(f.input)).toMatchObject({ kind: "rejected" });
    });
    it("rejects stale definition bindings and propagates cancellation", async () => {
        const f = await fixture();
        expect(
            await preflightMeetingIdentity({
                ...f.input,
                binding: { ...f.input.binding, definitionHash: "f".repeat(64) }
            })
        ).toMatchObject({ kind: "rejected" });
        const controller = new AbortController();
        controller.abort(new Error("cancelled"));
        await expect(
            preflightMeetingIdentity({ ...f.input, signal: controller.signal })
        ).rejects.toThrow("cancelled");
    });
});
