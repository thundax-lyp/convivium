import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";
import { existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const versionSuffix = /(?:^|[_a-zA-Z])(?:V|v)[1-9][0-9]*$/;
const versionedPathSegment = /(?:^|[._-])v[1-9][0-9]*(?:[._-]|$)/i;
const noVersionSuffix = {
    meta: {
        type: "problem",
        docs: { description: "Disallow version suffixes in unpublished contracts and methods" },
        messages: {
            symbol: "未发布的契约和方法禁止版本后缀；直接维护当前名称。",
            path: "未发布的源码文件禁止版本后缀；直接维护当前路径。"
        },
        schema: []
    },
    create: (context) => ({
        Identifier: (node) => {
            if (versionSuffix.test(node.name)) {
                context.report({ node, messageId: "symbol" });
            }
        },
        Literal: (node) => {
            if (
                typeof node.value === "string" &&
                node.value.startsWith("convivium_") &&
                versionSuffix.test(node.value)
            ) {
                context.report({ node, messageId: "symbol" });
            }
        },
        Program: (node) => {
            const segments = context.filename.split(/[\\/]/);
            const sourceIndex = segments.lastIndexOf("src");
            if (
                segments
                    .slice(sourceIndex + 1)
                    .some((segment) => versionedPathSegment.test(segment))
            ) {
                context.report({ node, messageId: "path" });
            }
        }
    })
};

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "src");
const sourceParts = (path) => relative(sourceRoot, path).split(sep).filter(Boolean);
const sourceFile = (path) => {
    const base = existsSync(path) && statSync(path).isDirectory() ? join(path, "index.js") : path;
    return [".ts", ".tsx"]
        .map((extension) => base.replace(/\.js$/, extension))
        .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
};

const directoryBoundary = {
    meta: {
        type: "problem",
        docs: {
            description: "Require directory entrypoints and imports through the nearest boundary"
        },
        messages: {
            missingIndex: "源码目录必须提供 index.ts 或 index.tsx。",
            parentRelative: "禁止父级相对导入；跨父目录使用 @/。",
            entry: "目录 {{directory}} 对外只能通过 {{expected}} 引用。"
        },
        schema: []
    },
    create: (context) => {
        const importer = context.filename;
        const importerDir = dirname(importer);
        const check = (node, specifier) => {
            if (typeof specifier !== "string") {
                return;
            }
            if (specifier.split("/").includes("..")) {
                context.report({ node, messageId: "parentRelative" });
                return;
            }
            if (!specifier.startsWith("@/") && !specifier.startsWith("./")) {
                return;
            }
            const unresolved = specifier.startsWith("@/")
                ? resolve(sourceRoot, specifier.slice(2))
                : resolve(importerDir, specifier);
            const target = sourceFile(unresolved);
            if (!target || !target.startsWith(`${sourceRoot}${sep}`)) {
                return;
            }
            const from = sourceParts(importerDir);
            const to = sourceParts(dirname(target));
            const common = from.findIndex((part, index) => part !== to[index]);
            const shared = common === -1 ? Math.min(from.length, to.length) : common;
            if (shared === to.length) {
                return;
            }
            const boundary = to.slice(0, shared + 1);
            const directory = boundary.join("/");
            const expected =
                shared === from.length
                    ? `./${boundary.at(-1)}/index.js`
                    : `@/${directory}/index.js`;
            if (specifier !== expected) {
                context.report({ node, messageId: "entry", data: { directory, expected } });
            }
        };
        return {
            Program: (node) => {
                if (
                    !existsSync(join(importerDir, "index.ts")) &&
                    !existsSync(join(importerDir, "index.tsx"))
                ) {
                    context.report({ node, messageId: "missingIndex" });
                }
            },
            ImportDeclaration: (node) => check(node.source, node.source.value),
            ExportNamedDeclaration: (node) => check(node.source, node.source?.value),
            ExportAllDeclaration: (node) => check(node.source, node.source.value),
            ImportExpression: (node) => check(node.source, node.source.value),
            TSImportType: (node) => check(node.source, node.source?.value)
        };
    }
};

function importRules(patterns) {
    return {
        "no-restricted-imports": ["error", { patterns }],
        "no-restricted-syntax": [
            "error",
            ...patterns.map(({ regex, message }) => {
                const selectorPattern = regex.replaceAll("/", "\\u002F");
                return {
                    selector: `ImportExpression[source.value=/${selectorPattern}/], TSImportType[source.value=/${selectorPattern}/]`,
                    message
                };
            })
        ]
    };
}

export default tseslint.config(
    {
        ignores: ["dist", "lib", "node_modules"]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{js,mjs,cjs,ts,tsx}"],
        languageOptions: {
            ecmaVersion: 2022,
            globals: {
                ...globals.node,
                ...globals.browser,
                ...globals.vitest
            }
        },
        rules: {
            "no-console": "off",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-empty-object-type": [
                "error",
                {
                    allowInterfaces: "always"
                }
            ],
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_"
                }
            ]
        }
    },
    {
        files: ["src/**/*.{ts,tsx}"],
        rules: {
            "max-lines": [
                "warn",
                {
                    max: 1000,
                    skipBlankLines: true,
                    skipComments: true
                }
            ],
            "max-lines-per-function": [
                "warn",
                {
                    max: 300,
                    skipBlankLines: true,
                    skipComments: true
                }
            ],
            complexity: ["warn", 40]
        }
    },
    {
        files: ["tests/**/*.{ts,tsx}"],
        rules: {
            "max-lines": [
                "warn",
                {
                    max: 1200,
                    skipBlankLines: true,
                    skipComments: true
                }
            ],
            "max-lines-per-function": [
                "warn",
                {
                    max: 300,
                    skipBlankLines: true,
                    skipComments: true
                }
            ],
            complexity: ["warn", 15]
        }
    },
    {
        files: ["src/**/*.{ts,tsx}"],
        plugins: {
            convivium: {
                rules: {
                    "no-version-suffix": noVersionSuffix,
                    "directory-boundary": directoryBoundary
                }
            }
        },
        rules: {
            "no-console": "error",
            "convivium/no-version-suffix": "error",
            "convivium/directory-boundary": "error"
        }
    },
    {
        files: ["tests/**/*.{ts,tsx}"],
        rules: importRules([
            {
                regex: "^(?:\\.\\./)+src(?:/|$)",
                message: "测试导入 src 必须使用 @/；测试 fixture 之间可保留相对路径。"
            }
        ])
    },
    prettier,
    {
        rules: {
            curly: ["error", "all"]
        }
    }
);
