import { describe, expect, it } from "vitest";

import { Config } from "@/config.ts";

const validConfig = {
    provider: "spawn",
    initialContributorRoleIds: ["github_research_analyst", "arxiv_research_analyst"]
};

describe("Convivium runtime config", () => {
    it("requires an explicit provider and supplies bounded runtime defaults", () => {
        expect(Config(validConfig)).toEqual({
            provider: "spawn",
            initialContributorRoleIds: ["github_research_analyst", "arxiv_research_analyst"],
            maxParticipants: 3,
            speakerTimeoutMs: 10 * 60_000,
            outboxPollMs: 1_000
        });
        expect(() =>
            Config({ initialContributorRoleIds: validConfig.initialContributorRoleIds })
        ).toThrow(/provider/);
        expect(() => Config({ ...validConfig, provider: "   " })).toThrow(/provider/);
    });

    it("requires distinct configured contributor roles from the packaged catalog", () => {
        expect(() => Config({ provider: "spawn" })).toThrow();
        for (const roles of [
            [],
            ["meeting_manager"],
            ["github_research_analyst", "github_research_analyst"]
        ]) {
            expect(() => Config({ ...validConfig, initialContributorRoleIds: roles })).toThrow();
        }
        expect(
            Config({ ...validConfig, initialContributorRoleIds: ["runtime_engineer"] })
        ).toMatchObject({ initialContributorRoleIds: ["runtime_engineer"] });
    });

    it("accepts the deployed GitHub/arXiv/Web contributor selection", () => {
        expect(
            Config({
                ...validConfig,
                maxParticipants: 8,
                initialContributorRoleIds: [
                    "github_research_analyst",
                    "arxiv_research_analyst",
                    "web_research_analyst"
                ]
            })
        ).toMatchObject({
            maxParticipants: 8,
            initialContributorRoleIds: [
                "github_research_analyst",
                "arxiv_research_analyst",
                "web_research_analyst"
            ]
        });
    });

    it("validates inline definitions and keeps configuration errors safe", () => {
        const definition = {
            agentDefinitionId: "a",

            roleDefinitionId: "meeting_manager",
            displayName: "A",
            summary: "A",
            agentInstructions: {
                roleDefinitionId: "meeting_manager",
                sha256: "a".repeat(64)
            },
            dshPresetId: "minimal",
            requiredSkillNames: ["meeting-facilitation"],
            expertiseTags: ["tag"],
            evidenceScopes: []
        };
        const config = Config({ ...validConfig, agentDefinitions: [definition] });
        const selection = { provider: "acp-codex", model: "model-a" };
        const bound = Config({
            ...validConfig,
            agentDefinitions: [{ ...definition, agentOptions: selection }]
        });
        selection.model = "changed";
        expect(bound.agentDefinitions?.[0].agentOptions).toEqual({
            provider: "acp-codex",
            model: "model-a"
        });
        expect(Object.isFrozen(bound.agentDefinitions?.[0].agentOptions)).toBe(true);
        expect(Object.isFrozen(bound)).toBe(true);
        definition.agentInstructions.sha256 = "b".repeat(64);
        expect(config.agentDefinitions?.[0].agentInstructions.sha256).toBe("a".repeat(64));
        expect(Object.isFrozen(config.agentDefinitions)).toBe(true);
        expect(() =>
            Config({ ...validConfig, agentDefinitions: [{ ...definition, extra: true }] })
        ).toThrow(expect.objectContaining({ message: "Invalid meeting agent definitions." }));
        expect(() => Config({ ...validConfig, agentDefinitions: null })).toThrow(
            expect.objectContaining({ message: "Invalid meeting agent definitions." })
        );
    });

    it("validates and freezes explicit ACP launch configuration and rejects unknown fields", () => {
        const args = ["--flag"];
        const result = Config({ ...validConfig, acpCodex: { command: process.execPath, args } });
        args.push("changed");
        expect(result.acpCodex).toEqual({ command: process.execPath, args: ["--flag"] });
        expect(Object.isFrozen(result.acpCodex)).toBe(true);
        expect(Object.isFrozen(result.acpCodex?.args)).toBe(true);
        expect(
            Config({ ...validConfig, acpCodex: { command: process.execPath, args: [] } }).acpCodex
                ?.args
        ).toEqual([]);
        for (const acpCodex of [
            { command: "relative", args: [] },
            { command: process.execPath },
            { command: process.execPath, args: [], env: {} },
            { command: "/missing-convivium-command", args: [] }
        ]) {
            expect(() => Config({ ...validConfig, acpCodex })).toThrow();
        }
        expect(() => Config({ ...validConfig, unexpected: true })).toThrow();
    });

    it("accepts a non-empty Developer Markdown workspace id", () => {
        expect(
            Config({ ...validConfig, developerMarkdownWorkspaceId: "workspace-1" })
        ).toMatchObject({ developerMarkdownWorkspaceId: "workspace-1" });
        expect(() => Config({ ...validConfig, developerMarkdownWorkspaceId: "   " })).toThrow(
            /developerMarkdownWorkspaceId/
        );
    });

    it("rejects participant and polling values outside their safe integer bounds", () => {
        for (const invalid of [2, 33, 3.5, Number.POSITIVE_INFINITY]) {
            expect(() => Config({ ...validConfig, maxParticipants: invalid })).toThrow(
                /maxParticipants/
            );
        }

        for (const key of ["speakerTimeoutMs", "outboxPollMs"] as const) {
            expect(() => Config({ ...validConfig, [key]: 0 })).toThrow(new RegExp(key));
            expect(() => Config({ ...validConfig, [key]: 1.5 })).toThrow(new RegExp(key));
            expect(() => Config({ ...validConfig, [key]: Number.POSITIVE_INFINITY })).toThrow(
                new RegExp(key)
            );
        }

        expect(Config({ ...validConfig, speakerTimeoutMs: 10 * 60_000 })).toMatchObject({
            speakerTimeoutMs: 10 * 60_000
        });
        expect(() => Config({ ...validConfig, speakerTimeoutMs: 60 * 60_000 + 1 })).toThrow(
            /speakerTimeoutMs/
        );
    });
});
