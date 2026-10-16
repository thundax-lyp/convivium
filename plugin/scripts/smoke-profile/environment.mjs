import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const DEEPSEEK_API_KEY = "DEEPSEEK_API_KEY";

export function createSmokeEnvironment(baseEnvironment, overrides = {}, deepSeekApiKey) {
    const environment = { ...baseEnvironment, ...overrides };
    delete environment.DEEPSEEK_API_KEY;
    if (deepSeekApiKey !== undefined) {
        environment.DEEPSEEK_API_KEY = deepSeekApiKey;
    }
    return environment;
}

export async function loadSmokeApiKey(devEnvPath) {
    const values = parseEnv(await readFile(devEnvPath, "utf8"));
    const apiKey = values[DEEPSEEK_API_KEY];
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
        throw new Error("dev.env DEEPSEEK_API_KEY must not be empty.");
    }
    return apiKey;
}

export const createCodexSmokeEnvironment = (baseEnvironment, preflight) => {
    const require = createRequire(new URL("../../package.json", import.meta.url));
    const codexPackage = require.resolve("@openai/codex/package.json");
    const platformPackage = createRequire(codexPackage).resolve(
        `@openai/codex-darwin-${process.arch}/package.json`
    );
    const triple = process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    const binary = realpathSync(resolve(dirname(platformPackage), "vendor", triple, "bin/codex"));
    if (
        createHash("sha256").update(readFileSync(binary)).digest("hex") !==
        preflight.binarySha256.codex
    ) {
        throw new Error("ACP binary changed after preflight");
    }
    return createSmokeEnvironment(baseEnvironment, { CODEX_PATH: binary });
};
