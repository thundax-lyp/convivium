import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ModuleName =
    | "protocol"
    | "domain"
    | "repository"
    | "runtime"
    | "dsh"
    | "tools"
    | "http"
    | "projection"
    | "client";

interface ModuleBoundary {
    name: ModuleName;
    mayImport: readonly ModuleName[];
    forbiddenRuntimeImports: readonly string[];
}

const moduleBoundaries: readonly ModuleBoundary[] = [
    {
        name: "protocol",
        mayImport: [],
        forbiddenRuntimeImports: ["node:", "react", "sqlite", "@deepseek-ai/dsh-"]
    },
    {
        name: "domain",
        mayImport: [],
        forbiddenRuntimeImports: ["node:", "react", "sqlite", "@deepseek-ai/dsh-"]
    },
    {
        name: "repository",
        mayImport: ["domain"],
        forbiddenRuntimeImports: ["@deepseek-ai/dsh-", "react", "http"]
    },
    {
        name: "runtime",
        mayImport: ["protocol", "domain", "repository", "dsh", "projection"],
        forbiddenRuntimeImports: ["node:sqlite", "react", "http"]
    },
    {
        name: "dsh",
        mayImport: ["domain"],
        forbiddenRuntimeImports: ["repository", "react"]
    },
    {
        name: "projection",
        mayImport: ["protocol", "domain"],
        forbiddenRuntimeImports: ["@deepseek-ai/dsh-", "react", "node:", "sqlite"]
    },
    {
        name: "tools",
        mayImport: ["protocol", "runtime"],
        forbiddenRuntimeImports: ["repository", "client"]
    },
    {
        name: "http",
        mayImport: ["protocol", "runtime"],
        forbiddenRuntimeImports: ["repository", "client"]
    },
    {
        name: "client",
        mayImport: ["protocol"],
        forbiddenRuntimeImports: [
            "node:",
            "sqlite",
            "repository",
            "runtime",
            "dsh",
            "tools",
            "http",
            "@deepseek-ai/dsh-"
        ]
    }
];

const sourceRoot = resolve(import.meta.dirname, "../../src");
const sourceExtensions = new Set([".ts", ".tsx"]);

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
            ? sourceFiles(path)
            : sourceExtensions.has(extname(path))
              ? [path]
              : [];
    });
}

function moduleForFile(file: string): ModuleName | undefined {
    const topLevel = relative(sourceRoot, file).split("/")[0];
    return moduleBoundaries.some(({ name }) => name === topLevel)
        ? (topLevel as ModuleName)
        : undefined;
}

function importsOf(source: string): string[] {
    const runtimeSource = source.replace(
        /import\s+type\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+(['"])[^'"]+\1\s*;?/g,
        ""
    );
    return [...runtimeSource.matchAll(/(?:from\s+|import\s*\()(['"])(.*?)\1/g)].map(
        (match) => match[2]
    );
}

function importedModule(file: string, specifier: string): ModuleName | undefined {
    if (!specifier.startsWith(".")) return undefined;
    const candidate = resolve(dirname(file), specifier);
    const candidateWithoutExtension = candidate.replace(/\.(?:m?js|tsx?)$/, "");
    const path = sourceFiles(sourceRoot).find((sourceFile) => {
        const withoutExtension = sourceFile.replace(/\.(?:m?js|tsx?)$/, "");
        return sourceFile === candidate || withoutExtension === candidateWithoutExtension;
    });
    return path ? moduleForFile(path) : undefined;
}

function violations(module: ModuleName, specifiers: readonly string[]): string[] {
    const boundary = moduleBoundaries.find((item) => item.name === module);
    if (!boundary) return [`unknown module ${module}`];
    return specifiers.flatMap((specifier) => {
        const imported = importedModule(join(sourceRoot, module, "index.ts"), specifier);
        if (imported && imported !== module && !boundary.mayImport.includes(imported))
            return [`${module} may not import ${imported}`];
        if (boundary.forbiddenRuntimeImports.some((forbidden) => specifier.includes(forbidden))) {
            return [`${module} may not import ${specifier}`];
        }
        return [];
    });
}

describe("plugin module boundaries", () => {
    it("accepts the current source import graph", () => {
        const errors = sourceFiles(sourceRoot).flatMap((file) => {
            const module = moduleForFile(file);
            return module ? violations(module, importsOf(readFileSync(file, "utf8"))) : [];
        });
        expect(errors).toEqual([]);
    });

    it("rejects a temporary Client-to-Host import", () => {
        expect(violations("client", ["../runtime/index.js"])).toEqual([
            "client may not import runtime"
        ]);
    });
});
