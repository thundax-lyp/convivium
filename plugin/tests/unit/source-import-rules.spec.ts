import { ESLint } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();
const importer = resolve(import.meta.dirname, "../../src/domain/transitions/meeting-create.ts");

const ruleIds = async (source: string): Promise<string[]> => {
    const [result] = await eslint.lintText(source, { filePath: importer });
    return result.messages.map(({ ruleId }) => ruleId ?? "");
};

describe("source import rules", () => {
    it("requires the ancestor directory entry for an import from a nested directory", async () => {
        expect(
            await ruleIds('import type { MeetingState } from "@/domain/meeting-state.ts";')
        ).toContain("convivium/directory-boundary");
    });

    it.each(["@/domain/index", "./index", "@/domain/meeting-state.js"])(
        "requires the TypeScript extension for %s",
        async (specifier) => {
            expect(await ruleIds(`import type { MeetingState } from "${specifier}";`)).toContain(
                "convivium/typescript-import-extension"
            );
        }
    );

    it("checks type-only import expressions against both entry and extension rules", async () => {
        const ids = await ruleIds('type State = import("@/domain/meeting-state.js").MeetingState;');
        expect(ids).toContain("convivium/directory-boundary");
        expect(ids).toContain("convivium/typescript-import-extension");
    });

    it("checks parent-relative type-only import expressions", async () => {
        expect(await ruleIds('type State = import("../meeting-state.ts").MeetingState;')).toContain(
            "convivium/directory-boundary"
        );
    });

    it("checks static template dynamic imports against both entry and extension rules", async () => {
        const ids = await ruleIds("void import(`@/domain/meeting-state.js`);");
        expect(ids).toContain("convivium/directory-boundary");
        expect(ids).toContain("convivium/typescript-import-extension");
    });

    it.each([
        'void import("@/domain/" + "meeting-state.js");',
        'void import(`@/domain/${"meeting-state.js"}`);'
    ])("rejects a computed dynamic import path: %s", async (source) => {
        expect(await ruleIds(source)).toContain("convivium/directory-boundary");
    });
});
