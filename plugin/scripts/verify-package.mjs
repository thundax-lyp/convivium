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
const clientBundle = readText("lib/client.js");
const files = Array.isArray(manifest?.files) ? manifest.files : [];
const requiredArtifacts = [
    "lib/index.js",
    "lib/types/index.d.ts",
    "lib/client.js",
    "lib/types/client/index.d.ts",
    "lib/typert.host.js",
    "lib/typert.host.d.ts",
    "lib/typert.remote-client.js",
    "lib/typert.remote-client.d.ts",
    "lib/remote/types.js",
    "lib/types/remote/types.d.ts",
    "lib/protocol/types.js",
    "lib/types/protocol/types.d.ts",
    "cordis.patch.yml",
    "meeting-roles/definitions.json",
    "meeting-roles/README.md",
    "meeting-roles/cordis.patch.yml",
    "scripts/install.sh",
    "scripts/start.sh",
    "meeting-roles/presets/convivium/preset.yml",
    "meeting-roles/presets/convivium/agent.cordis.yml",
    "meeting-roles/presets/convivium/skills/meeting-management/SKILL.md",
    "meeting-roles/presets/convivium/skills/domain-architecture/SKILL.md",
    "meeting-roles/presets/convivium/skills/dsh-runtime-engineering/SKILL.md",
    "meeting-roles/presets/convivium/skills/protocol-ui-engineering/SKILL.md",
    "meeting-roles/presets/convivium/skills/verification-review/SKILL.md",
    "meeting-roles/presets/convivium/skills/github-source-research/SKILL.md",
    "meeting-roles/presets/convivium/skills/arxiv-paper-analysis/SKILL.md",
    "meeting-roles/presets/convivium/skills/web-source-research/SKILL.md",
    "meeting-roles/presets/convivium/skills/referenced-minutes/SKILL.md"
];
const expectedExports = {
    ".": { types: "./lib/types/index.d.ts", default: "./lib/index.js" },
    "./client": {
        types: "./lib/types/client/index.d.ts",
        default: "./lib/client.js"
    },
    "./typert": {
        types: "./lib/typert.host.d.ts",
        default: "./lib/typert.host.js"
    },
    "./remote": {
        types: "./lib/typert.remote-client.d.ts",
        default: "./lib/typert.remote-client.js"
    },
    "./remote-types": {
        types: "./lib/types/remote/types.d.ts",
        default: "./lib/remote/types.js"
    },
    "./protocol-types": {
        types: "./lib/types/protocol/types.d.ts",
        default: "./lib/protocol/types.js"
    },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json",
    "./meeting-roles/cordis.patch.yml": "./meeting-roles/cordis.patch.yml"
};
const forbiddenPublishedPaths = files.filter((path) => /^(src|tests|docs)(\/|$)|\*\*/.test(path));
if (existsSync(resolve(packageRoot, "storage-plugin")))
    forbiddenPublishedPaths.push("storage-plugin");
const missingArtifacts = requiredArtifacts.filter(
    (path) => !existsSync(resolve(packageRoot, path))
);
const packageName = typeof manifest?.name === "string" ? manifest.name : "";
const installBinIsPublished = manifest?.bin?.["convivium-install"] === "scripts/install.sh";
const client = manifest?.dsh?.client;
const bundledClientRequires = ["@deepseek-ai/schemastery", "@deepseek-ai/cosmokit"].flatMap(
    (packageName) => [`require("${packageName}")`, `require('${packageName}')`]
);

const result = {
    exportsMatchArtifacts: JSON.stringify(manifest?.exports) === JSON.stringify(expectedExports),
    filesAllowlistIsClosed:
        JSON.stringify(files) ===
        JSON.stringify([
            "lib",
            "cordis.patch.yml",
            "meeting-roles",
            "scripts/install.sh",
            "scripts/start.sh",
            "lib/typert.host.js",
            "lib/typert.host.d.ts",
            "lib/typert.remote-client.js",
            "lib/typert.remote-client.d.ts"
        ]),
    bundlePatchMatchesPackageName: Boolean(packageName && patch.includes(packageName)),
    installBinIsPublished,
    clientManifestIsComplete:
        client?.platform === "web" && Array.isArray(client.inject) && client.inject.length > 0,
    clientBundleIsSelfContained: bundledClientRequires.every(
        (specifier) => !clientBundle.includes(specifier)
    ),
    forbiddenPublishedPaths,
    missingArtifacts
};

console.log(JSON.stringify(result, null, 2));

if (
    !result.exportsMatchArtifacts ||
    !result.filesAllowlistIsClosed ||
    !result.bundlePatchMatchesPackageName ||
    !result.installBinIsPublished ||
    !result.clientManifestIsComplete ||
    !result.clientBundleIsSelfContained ||
    result.forbiddenPublishedPaths.length > 0 ||
    result.missingArtifacts.length > 0
) {
    process.exitCode = 1;
}
