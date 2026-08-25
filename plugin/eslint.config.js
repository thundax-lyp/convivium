import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

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
            "no-console": "error"
        }
    },
    prettier
);
