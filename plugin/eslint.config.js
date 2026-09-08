import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

// These top-level modules expose index.ts (or index.tsx) as their public entry.
const publicModules = [
    "client",
    "domain",
    "dsh",
    "http",
    "projection",
    "protocol",
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
            "no-console": "error",
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
    prettier
);
