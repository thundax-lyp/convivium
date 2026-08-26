import { defineConfig } from "tsdown";

const sharedExternal = [/^@deepseek-ai\//, "react", "react-dom"] as const;

export default defineConfig([
    {
        entry: { index: "src/index.ts" },
        outDir: "lib",
        platform: "node",
        target: "node22.19.0",
        clean: false,
        dts: false,
        fixedExtension: false,
        deps: { neverBundle: sharedExternal },
        tsconfig: "tsconfig.json"
    },
    {
        entry: { client: "src/client/index.tsx" },
        outDir: "lib",
        platform: "browser",
        target: "es2022",
        clean: false,
        dts: false,
        deps: { neverBundle: sharedExternal },
        tsconfig: "tsconfig.client.json"
    }
]);
