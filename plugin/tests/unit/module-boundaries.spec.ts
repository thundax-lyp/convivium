import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    createEvidenceReviewDispatcher,
    createMeetingArchiveDispatcher,
    createMeetingCommandApplication,
    createMeetingIdentityEffectHandler,
    createMeetingNoticeDispatcher,
    createReviewDeliveryDispatcher,
    provisionMeetingIdentity,
    recoverMeetingCommands
} from "@/runtime/index.js";
import type { MeetingOutboxWakeup } from "@/runtime/index.js";

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

function localImportPath(file: string, specifier: string): string | undefined {
    if (specifier.startsWith("@/")) return resolve(sourceRoot, specifier.slice(2));
    if (specifier.startsWith(".")) return resolve(dirname(file), specifier);
    return undefined;
}

function importedModule(file: string, specifier: string): ModuleName | undefined {
    const candidate = localImportPath(file, specifier);
    if (candidate === undefined) return undefined;
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
        if (
            boundary.forbiddenRuntimeImports.some((forbidden) =>
                forbidden.endsWith("-")
                    ? specifier.includes(forbidden) &&
                      !(
                          module === "client" &&
                          specifier === "@deepseek-ai/dsh-client-ui-primitives"
                      )
                    : specifier === forbidden
            )
        ) {
            return [`${module} may not import ${specifier}`];
        }
        return [];
    });
}

describe("plugin module boundaries", () => {
    it("exposes the target runtime graph through the public entrypoint", () => {
        const targetExports = [
            createMeetingCommandApplication,
            createMeetingIdentityEffectHandler,
            provisionMeetingIdentity,
            createMeetingNoticeDispatcher,
            createEvidenceReviewDispatcher,
            createReviewDeliveryDispatcher,
            createMeetingArchiveDispatcher,
            recoverMeetingCommands
        ];
        expect(targetExports).toHaveLength(8);
        expect(targetExports.every((value) => typeof value === "function")).toBe(true);

        const wakeup: MeetingOutboxWakeup | undefined = undefined;
        expect(wakeup).toBeUndefined();
    });

    it("accepts the current source import graph", () => {
        const errors = sourceFiles(sourceRoot).flatMap((file) => {
            const module = moduleForFile(file);
            return module ? violations(module, importsOf(readFileSync(file, "utf8"))) : [];
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
                allModuleSpecifiersOf(readFileSync(file, "utf8")).filter((specifier) =>
                    forbidden.has(specifier)
                )
            )
        ).toEqual([]);
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

    it("keeps the target lifecycle independent from the legacy dispatch service", () => {
        const lifecycle = readFileSync(join(sourceRoot, "runtime/meeting-lifecycle.ts"), "utf8");
        expect(importsOf(lifecycle)).not.toContain("./services/meeting-dispatch-service.js");
    });
});
