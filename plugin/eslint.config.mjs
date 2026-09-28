import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

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

// These top-level modules expose index.ts (or index.tsx) as their public entry.
const publicModules = [
    "client",
    "domain",
    "dsh",
    "projection",
    "protocol",
    "remote",
    "runtime",
    "tools"
];

function sourceImportRules(owner, root = false) {
    const externalModules = publicModules.filter((name) => name !== owner).join("|");
    const patterns = [
        {
            regex: "(?:^|/)\\.\\.(?:/|$)",
            message: "禁止父级相对导入。请使用 @/，跨模块通过公开 index.js，并保留 .js 扩展名。"
        },
        {
            regex: `^@/(?:${externalModules})(?:/(?!index\\.js$)|$)`,
            message: "禁止跨模块引用内部文件；请从 @/<module>/index.js 导入已有公开符号。"
        }
    ];
    if (root) {
        patterns.push({
            regex: `^(?:\\./)+(?:${externalModules})(?:/(?!index\\.js$)|$)`,
            message: "插件装配必须通过 ./<module>/index.js 使用模块公开入口。"
        });
    }
    return importRules(patterns);
}

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
        plugins: { convivium: { rules: { "no-version-suffix": noVersionSuffix } } },
        rules: {
            "no-console": "error",
            "convivium/no-version-suffix": "error",
            ...sourceImportRules()
        }
    },
    ...publicModules.map((name) => ({
        files: [`src/${name}/**/*.{ts,tsx}`],
        rules: sourceImportRules(name)
    })),
    {
        files: ["src/*.{ts,tsx}"],
        rules: sourceImportRules(undefined, true)
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
