import { defineConfig } from "tsdown";

const sharedExternal = [/^@deepseek-ai\//, "react", "react-dom"] as const;
const clientExternal = [
    /^@deepseek-ai\/(?!(?:schemastery|cosmokit)(?:\/|$))/,
    "react",
    "react-dom"
] as const;
const clientAlwaysBundle = ["@deepseek-ai/schemastery", "@deepseek-ai/cosmokit"] as const;

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
        format: "cjs",
        target: "es2022",
        clean: false,
        dts: false,
        deps: { neverBundle: clientExternal, alwaysBundle: clientAlwaysBundle },
        tsconfig: "tsconfig.client.json",
        outExtensions: () => ({ js: ".js" }),
        outputOptions: {
            banner: 'window.__ModuleLoader__.load({ id: "@convivium/dsh-plugin", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
            footer: "return module.exports; } });"
        }
    }
]);
