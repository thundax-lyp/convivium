import { describe, expect, it } from "vitest";

import { Config } from "@/config.js";

const validConfig = {
    provider: "spawn"
};

describe("Convivium runtime config", () => {
    it("requires an explicit provider and supplies bounded runtime defaults", () => {
        expect(Config(validConfig)).toEqual({
            provider: "spawn",
            maxParticipants: 3,
            speakerTimeoutMs: 60_000,
            outboxPollMs: 1_000
        });
        expect(() => Config({})).toThrow(/provider/);
        expect(() => Config({ provider: "   " })).toThrow(/provider/);
    });

    it("validates inline definitions and keeps configuration errors safe", () => {
        const definition = {
            agentDefinitionId: "a",
            definitionVersion: "1",
            roleDefinitionId: "meeting_manager",
            displayName: "A",
            summary: "A",
            persona: "private persona",
            dshPresetId: "minimal",
            requiredSkillNames: ["skill"],
            expertiseTags: ["tag"],
            evidenceScopes: []
        };
        const config = Config({ ...validConfig, agentDefinitions: [definition] });
        definition.persona = "changed";
        expect(config.agentDefinitions?.[0].persona).toBe("private persona");
        expect(Object.isFrozen(config.agentDefinitions)).toBe(true);
        expect(() =>
            Config({ ...validConfig, agentDefinitions: [{ ...definition, extra: true }] })
        ).toThrow("Invalid meeting agent definitions.");
        expect(() => Config({ ...validConfig, agentDefinitions: null })).toThrow();
    });

    it("accepts only a controlled relative data root", () => {
        expect(Config({ ...validConfig, dataRoot: "convivium-data/meetings" }).dataRoot).toBe(
            "convivium-data/meetings"
        );

        for (const dataRoot of ["/tmp/convivium", "../outside", "data/../outside", "C:\\temp"]) {
            expect(() => Config({ ...validConfig, dataRoot })).toThrow(/dataRoot/);
        }
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
    });
});
