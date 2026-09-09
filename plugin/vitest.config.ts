import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
                    environment: "jsdom",
                    server: { deps: { inline: [/@deepseek-ai\/dsh-client-ui-primitives/] } }
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
