import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootFlag = process.argv.indexOf("--root");
const packageRoot = resolve(
    rootFlag >= 0 ? process.argv[rootFlag + 1] : new URL("..", import.meta.url).pathname
);

function readJson(path) {
    try {
        return JSON.parse(readFileSync(resolve(packageRoot, path), "utf8"));
    } catch {
        return undefined;
    }
}

function readText(path) {
    try {
        return readFileSync(resolve(packageRoot, path), "utf8");
    } catch {
        return "";
    }
}

const manifest = readJson("package.json");
const patch = readText("cordis.patch.yml");
const files = Array.isArray(manifest?.files) ? manifest.files : [];
const requiredArtifacts = [
    "lib/index.js",
    "lib/types/index.d.ts",
    "lib/client.js",
    "lib/types/client/index.d.ts",
    "cordis.patch.yml"
];
const expectedExports = {
    ".": { types: "./lib/types/index.d.ts", default: "./lib/index.js" },
    "./client": {
        types: "./lib/types/client/index.d.ts",
        default: "./lib/client.js"
    },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
};
const forbiddenPublishedPaths = files.filter((path) => /^(src|tests|docs)(\/|$)|\*\*/.test(path));
const missingArtifacts = requiredArtifacts.filter(
    (path) => !existsSync(resolve(packageRoot, path))
);
const packageName = typeof manifest?.name === "string" ? manifest.name : "";
const client = manifest?.dsh?.client;

const result = {
    exportsMatchArtifacts: JSON.stringify(manifest?.exports) === JSON.stringify(expectedExports),
    filesAllowlistIsClosed:
        JSON.stringify(files) === JSON.stringify(["lib", "cordis.patch.yml", "README.md"]),
    bundlePatchMatchesPackageName: Boolean(packageName && patch.includes(packageName)),
    clientManifestIsComplete:
        client?.platform === "web" && Array.isArray(client.inject) && client.inject.length > 0,
    forbiddenPublishedPaths,
    missingArtifacts
};

console.log(JSON.stringify(result, null, 2));

if (
    !result.exportsMatchArtifacts ||
    !result.filesAllowlistIsClosed ||
    !result.bundlePatchMatchesPackageName ||
    !result.clientManifestIsComplete ||
    result.forbiddenPublishedPaths.length > 0 ||
    result.missingArtifacts.length > 0
) {
    process.exitCode = 1;
}
