import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const DEEPSEEK_API_KEY = "DEEPSEEK_API_KEY";

export function createSmokeEnvironment(baseEnvironment, overrides = {}, deepSeekApiKey) {
    const environment = { ...baseEnvironment, ...overrides };
    delete environment.DEEPSEEK_API_KEY;
    if (deepSeekApiKey !== undefined) environment.DEEPSEEK_API_KEY = deepSeekApiKey;
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
