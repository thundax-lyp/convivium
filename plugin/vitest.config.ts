import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { typertPlugin } from "@deepseek-ai/dsh-typert-generator/tsdown";

const decoratorPlugin = typertPlugin({ mode: "package", faces: ["host"] });

export default defineConfig({
    plugins: [
        {
            name: decoratorPlugin.name,
            enforce: "pre",
            transform: decoratorPlugin.transform
        }
    ],
    resolve: {
        alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: "host",
                    include: ["tests/unit/**/*.spec.ts"],
                    environment: "node"
                }
            },
            {
                extends: true,
                test: {
                    name: "client",
                    include: ["tests/client/**/*.spec.ts", "tests/client/**/*.spec.tsx"],
                    environment: "jsdom"
                }
            },
            {
                extends: true,
                test: {
                    name: "contract",
                    include: ["tests/contract/**/*.spec.ts"],
                    environment: "node"
                }
            },
            {
                extends: true,
                test: {
                    name: "integration",
                    include: ["tests/integration/**/*.spec.ts"],
                    environment: "node"
                }
            },
            {
                extends: true,
                test: {
                    name: "recovery",
                    include: ["tests/recovery/**/*.spec.ts"],
                    environment: "node"
                }
            }
        ]
    }
});
