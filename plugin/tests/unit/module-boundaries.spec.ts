import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
        forbiddenRuntimeImports: ["@deepseek-ai/dsh-storage", "react", "http"]
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

function reexportsOf(source: string): string[] {
    return [
        ...source.matchAll(/export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+(['"])(.*?)\1\s*;?/g)
    ].map((match) => match[2]);
}

function allModuleSpecifiersOf(source: string): string[] {
    const typeOnlyImports = [
        ...source.matchAll(
            /import\s+type\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+(["'])([^"']+)\1\s*;?/g
        )
    ].map((match) => match[2]!);
    return [...new Set([...importsOf(source), ...reexportsOf(source), ...typeOnlyImports])];
}

function isWithin(root: string, candidate: string): boolean {
    const path = relative(root, candidate);
    return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

const storageRoot = join(sourceRoot, "storage");
function storageBoundaryViolations(file: string, specifiers: readonly string[]): string[] {
    return specifiers.flatMap((specifier) => {
        const allowed =
            specifier.startsWith("node:") ||
            specifier === "@deepseek-ai/cordis" ||
            specifier === "@deepseek-ai/dsh-storage" ||
            (specifier.startsWith(".") && isWithin(storageRoot, resolve(dirname(file), specifier)));
        return allowed ? [] : [`${relative(sourceRoot, file)} may not import ${specifier}`];
    });
}

function repositoryDomainBoundaryViolations(file: string, specifiers: readonly string[]): string[] {
    return specifiers.flatMap((specifier) => {
        const forbidden =
            specifier === "@deepseek-ai/dsh-storage" ||
            (specifier.startsWith(".") && isWithin(storageRoot, resolve(dirname(file), specifier)));
        return forbidden ? [`${relative(sourceRoot, file)} may not import ${specifier}`] : [];
    });
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

function resolvesTo(file: string, specifier: string, target: string): boolean {
    if (!specifier.startsWith(".")) return false;
    const candidate = resolve(dirname(file), specifier).replace(/\.(?:m?js|tsx?)$/, "");
    return candidate === target.replace(/\.(?:m?js|tsx?)$/, "");
}

function violations(module: ModuleName, specifiers: readonly string[]): string[] {
    const boundary = moduleBoundaries.find((item) => item.name === module);
    if (!boundary) return [`unknown module ${module}`];
    return specifiers.flatMap((specifier) => {
        const imported = importedModule(join(sourceRoot, module, "index.ts"), specifier);
        if (imported && imported !== module && !boundary.mayImport.includes(imported))
            return [`${module} may not import ${imported}`];
        if (
            boundary.forbiddenRuntimeImports.some((forbidden) =>
                forbidden.endsWith("-") ? specifier.includes(forbidden) : specifier === forbidden
            )
        ) {
            return [`${module} may not import ${specifier}`];
        }
        return [];
    });
}

describe("plugin module boundaries", () => {
    it("keeps package-private storage and repository-domain boundaries explicit", () => {
        const storageFiles = sourceFiles(storageRoot);
        expect(storageFiles.length).toBeGreaterThan(0);
        expect(
            storageFiles.flatMap((file) =>
                storageBoundaryViolations(file, allModuleSpecifiersOf(readFileSync(file, "utf8")))
            )
        ).toEqual([]);
        const domainRoot = join(sourceRoot, "repository", "domain");
        const domainFiles = existsSync(domainRoot) ? sourceFiles(domainRoot) : [];
        expect(domainFiles.length).toBeGreaterThan(0);
        expect(
            domainFiles.flatMap((file) =>
                repositoryDomainBoundaryViolations(
                    file,
                    allModuleSpecifiersOf(readFileSync(file, "utf8"))
                )
            )
        ).toEqual([]);
        expect(
            storageBoundaryViolations(join(storageRoot, "unit.ts"), [
                "node:fs",
                "@deepseek-ai/cordis",
                "@deepseek-ai/dsh-storage",
                "./format.js"
            ])
        ).toEqual([]);
        expect(
            storageBoundaryViolations(join(storageRoot, "unit.ts"), [
                "../domain/model.js",
                "@deepseek-ai/dsh-storage-domain",
                "zod"
            ])
        ).toEqual([
            "storage/unit.ts may not import ../domain/model.js",
            "storage/unit.ts may not import @deepseek-ai/dsh-storage-domain",
            "storage/unit.ts may not import zod"
        ]);
        expect(
            repositoryDomainBoundaryViolations(join(domainRoot, "model.ts"), [
                "../../storage/index.js",
                "@deepseek-ai/dsh-storage"
            ])
        ).toEqual([
            "repository/domain/model.ts may not import ../../storage/index.js",
            "repository/domain/model.ts may not import @deepseek-ai/dsh-storage"
        ]);
        expect(
            repositoryDomainBoundaryViolations(join(domainRoot, "model.ts"), [
                "@deepseek-ai/dsh-storage-domain"
            ])
        ).toEqual([]);
    });
    it("accepts the current source import graph", () => {
        const errors = sourceFiles(sourceRoot).flatMap((file) => {
            const module = moduleForFile(file);
            return module ? violations(module, importsOf(readFileSync(file, "utf8"))) : [];
        });
        expect(errors).toEqual([]);
    });

    it("keeps storage composition at the package root", () => {
        const storageEntry = join(storageRoot, "index.ts");
        const importers = sourceFiles(sourceRoot).flatMap((file) =>
            allModuleSpecifiersOf(readFileSync(file, "utf8")).some((specifier) =>
                resolvesTo(file, specifier, storageEntry)
            )
                ? [relative(sourceRoot, file)]
                : []
        );
        expect(importers).toEqual(["index.ts"]);
    });

    it("rejects a temporary Client-to-Host import", () => {
        expect(violations("client", ["../runtime/index.js"])).toEqual([
            "client may not import runtime"
        ]);
    });

    it("keeps repository recovery free of archive lifecycle orchestration", () => {
        const recoverySource = readFileSync(
            join(sourceRoot, "runtime/services/meeting-recovery-service.ts"),
            "utf8"
        );
        expect(importsOf(recoverySource)).not.toContain("./meeting-archive-service.js");
    });

    it("keeps internal application use cases and services out of runtime facades", () => {
        const runtimeFacade = readFileSync(join(sourceRoot, "runtime/index.ts"), "utf8");
        expect(reexportsOf(runtimeFacade)).not.toEqual(
            expect.arrayContaining([
                "./services/meeting-dispatch-service.js",
                "./services/types.js",
                "./services/command-result-service.js",
                "./services/meeting-session-service.js"
            ])
        );

        const applicationFacade = readFileSync(
            join(sourceRoot, "runtime/application-service/index.ts"),
            "utf8"
        );
        expect(reexportsOf(applicationFacade)).not.toContain("./meeting-control.js");
    });
});
