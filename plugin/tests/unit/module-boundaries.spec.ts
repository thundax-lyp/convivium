import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type ModuleName =
    | "protocol"
    | "domain"
    | "repository"
    | "runtime"
    | "dsh"
    | "tools"
    | "remote"
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
        forbiddenRuntimeImports: ["@deepseek-ai/dsh-storage", "react", "http", "remote"]
    },
    {
        name: "runtime",
        mayImport: ["protocol", "domain", "repository", "dsh", "projection"],
        forbiddenRuntimeImports: ["node:sqlite", "react", "http", "remote"]
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
        name: "remote",
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
            "remote",
            "@deepseek-ai/dsh-"
        ]
    }
];

const sourceRoot = resolve(import.meta.dirname, "../../src");
const sourceExtensions = new Set([".ts", ".tsx"]);

const sourceFiles = (directory: string): string[] => {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
            ? sourceFiles(path)
            : sourceExtensions.has(extname(path))
              ? [path]
              : [];
    });
};

const moduleForFile = (file: string): ModuleName | undefined => {
    const topLevel = relative(sourceRoot, file).split("/")[0];
    return moduleBoundaries.some(({ name }) => name === topLevel)
        ? (topLevel as ModuleName)
        : undefined;
};

const typeOnlyImport = (clause: ts.ImportClause | undefined): boolean => {
    const bindings = clause?.namedBindings;
    return Boolean(
        clause?.isTypeOnly ||
        (!clause?.name &&
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.length > 0 &&
            bindings.elements.every((element) => element.isTypeOnly))
    );
};
const typeOnlyExport = (node: ts.ExportDeclaration): boolean => {
    const clause = node.exportClause;
    return Boolean(
        node.isTypeOnly ||
        (clause &&
            ts.isNamedExports(clause) &&
            clause.elements.length > 0 &&
            clause.elements.every((element) => element.isTypeOnly))
    );
};
const literalSpecifier = (node: ts.Node | undefined): string | undefined =>
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        ? node.text
        : undefined;
const moduleSpecifier = (node: ts.Node, includeTypes: boolean): string | undefined => {
    if (ts.isImportDeclaration(node)) {
        return includeTypes || !typeOnlyImport(node.importClause)
            ? literalSpecifier(node.moduleSpecifier)
            : undefined;
    }
    if (ts.isExportDeclaration(node)) {
        return includeTypes || !typeOnlyExport(node)
            ? literalSpecifier(node.moduleSpecifier)
            : undefined;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return literalSpecifier(node.arguments[0]);
    }
    if (includeTypes && ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        return literalSpecifier(node.argument.literal);
    }
    return undefined;
};
const importsOf = (file: string, includeTypes = false): string[] => {
    const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true
    );
    const specifiers: string[] = [];
    const visit = (node: ts.Node): void => {
        const specifier = moduleSpecifier(node, includeTypes);
        if (specifier !== undefined) {
            specifiers.push(specifier);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return [...new Set(specifiers)];
};

const localImportPath = (file: string, specifier: string): string | undefined => {
    if (specifier.startsWith("@/")) {
        return resolve(sourceRoot, specifier.slice(2));
    }
    if (specifier.startsWith(".")) {
        return resolve(dirname(file), specifier);
    }
    return undefined;
};

const importedModule = (file: string, specifier: string): ModuleName | undefined => {
    const candidate = localImportPath(file, specifier);
    if (candidate === undefined) {
        return undefined;
    }
    const candidateWithoutExtension = candidate.replace(/\.(?:m?js|tsx?)$/, "");
    const path = sourceFiles(sourceRoot).find((sourceFile) => {
        const withoutExtension = sourceFile.replace(/\.(?:m?js|tsx?)$/, "");
        return sourceFile === candidate || withoutExtension === candidateWithoutExtension;
    });
    return path ? moduleForFile(path) : undefined;
};

const violations = (file: string, module: ModuleName, specifiers: readonly string[]): string[] => {
    const boundary = moduleBoundaries.find((item) => item.name === module);
    if (!boundary) {
        return [`unknown module ${module}`];
    }
    return specifiers.flatMap((specifier) => {
        const imported = importedModule(file, specifier);
        if (imported && imported !== module && !boundary.mayImport.includes(imported)) {
            return [`${module} may not import ${imported}`];
        }
        if (
            // The stable Captain ID uses synchronous SHA-256 only in this module.
            !(
                relative(sourceRoot, file) === "domain/control-actor.ts" &&
                specifier === "node:crypto"
            ) &&
            !(module === "client" && specifier === "@deepseek-ai/dsh-client-ui-primitives") &&
            boundary.forbiddenRuntimeImports.some((forbidden) =>
                forbidden.endsWith("-") || forbidden.endsWith(":")
                    ? specifier.startsWith(forbidden)
                    : specifier === forbidden
            )
        ) {
            return [`${module} may not import ${specifier}`];
        }
        return [];
    });
};

describe("plugin module boundaries", () => {
    it("accepts the current source import graph", () => {
        const errors = sourceFiles(sourceRoot).flatMap((file) => {
            const module = moduleForFile(file);
            return module ? violations(file, module, importsOf(file)) : [];
        });
        expect(errors).toEqual([]);
    });

    it("leaves physical storage composition to the Host profile", () => {
        const forbidden = new Set([
            "@deepseek-ai/dsh-storage",
            "@deepseek-ai/dsh-storage-sqlite",
            "@deepseek-ai/dsh-storage-json",
            "node:sqlite"
        ]);
        expect(
            sourceFiles(sourceRoot).flatMap((file) =>
                importsOf(file, true).filter((specifier) => forbidden.has(specifier))
            )
        ).toEqual([]);
    });
});
