import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../../src");
const storageRoot = resolve(sourceRoot, "storage");

function staticSpecifiers(file: string): string[] {
    const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const specifiers: string[] = [];
    source.forEachChild((node) => {
        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier !== undefined &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            specifiers.push(node.moduleSpecifier.text);
        }
    });
    return specifiers;
}

function resolveLocal(importer: string, specifier: string): string | undefined {
    if (!specifier.startsWith(".")) return undefined;
    const base = resolve(dirname(importer), specifier.replace(/\.(?:m?js|tsx?)$/, ""));
    for (const candidate of [
        `${base}.ts`,
        `${base}.tsx`,
        resolve(base, "index.ts"),
        resolve(base, "index.tsx")
    ]) {
        if (existsSync(candidate)) return candidate;
    }
    throw new Error(`Unresolved source import ${specifier} from ${relative(sourceRoot, importer)}`);
}

function importGraph(entries: readonly string[]) {
    const reached = new Set<string>();
    const externals = new Set<string>();
    const pending = entries.map((entry) => resolve(sourceRoot, entry));
    while (pending.length > 0) {
        const file = pending.pop()!;
        if (reached.has(file)) continue;
        reached.add(file);
        for (const specifier of staticSpecifiers(file)) {
            const local = resolveLocal(file, specifier);
            if (local === undefined) externals.add(specifier);
            else pending.push(local);
        }
    }
    return {
        files: [...reached].map((file) => relative(sourceRoot, file)).sort(),
        externals: [...externals].sort()
    };
}

describe("production import graph", () => {
    it("reaches the package-private backend without reaching legacy SQLite", () => {
        const graph = importGraph(["index.ts"]);
        expect(graph.files).toContain("storage/index.ts");
        expect(graph.files).toContain("storage/backend.ts");
        expect(graph.files).not.toEqual(
            expect.arrayContaining([
                "repository/sqlite-meeting-repository.ts",
                "repository/schema.ts",
                "repository/migrations.ts",
                "runtime/services/meeting-repository-locator.ts"
            ])
        );
        expect(graph.externals).not.toContain("node:sqlite");
    });

    it("keeps Meeting code on Storage Domain and away from backend paths", () => {
        const graph = importGraph([
            "repository/domain/domain-meeting-repository.ts",
            "repository/domain/domain-repository-registry.ts",
            "runtime/index.ts"
        ]);
        expect(graph.files.some((file) => resolve(sourceRoot, file).startsWith(storageRoot))).toBe(
            false
        );
        expect(graph.externals).toContain("@deepseek-ai/dsh-storage-domain");
        expect(graph.externals).not.toContain("@deepseek-ai/dsh-storage");
        expect(graph.externals.filter((specifier) => specifier.startsWith("node:fs"))).toEqual([]);
        expect(graph.externals).not.toContain("node:path");
    });
});
