#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(process.cwd());
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const patch = await readFile(join(root, "cordis.patch.yml"), "utf8");
const failures = [];
const runtime = await import(join(root, "lib/index.js"));
const publicExports = Object.keys(runtime).sort();
const expectedPublicExports = [
    "Config",
    "ConviviumRemoteService",
    "apply",
    "assertContinuableProvider",
    "inject",
    "name"
];
if (JSON.stringify(publicExports) !== JSON.stringify(expectedPublicExports))
    failures.push(`public exports mismatch: ${publicExports.join(",")}`);
if (/storage-domain|storage-sqlite/.test(patch))
    failures.push("plugin bundle must not configure a storage provider or domain routing");
if (
    pkg.dependencies?.["@deepseek-ai/dsh-storage-sqlite"] ||
    pkg.peerDependencies?.["@deepseek-ai/dsh-storage-sqlite"]
)
    failures.push("SQLite provider must be installed by the Host/profile");

if (!pkg.dsh?.bundle?.patch) failures.push("package.json must declare dsh.bundle.patch");
if (!pkg.files?.includes("lib")) failures.push("package files must include lib");
if (!pkg.files?.includes("cordis.patch.yml"))
    failures.push("package files must include cordis.patch.yml");

if (!pkg.files?.includes("meeting-roles"))
    failures.push("package files must include meeting-roles");
if (pkg.exports?.["./meeting-roles/cordis.patch.yml"] !== "./meeting-roles/cordis.patch.yml")
    failures.push("meeting-roles patch export is required");
try {
    await readFile(join(root, "meeting-roles/cordis.patch.yml"), "utf8");
} catch {
    failures.push("meeting-roles patch asset is missing");
}

const patchName = patch.match(/^\s*name:\s*['"]?([^'"\s]+)['"]?\s*$/m)?.[1];
if (!patchName) failures.push("cordis.patch.yml must contain a package name");
if (patchName && patchName !== pkg.name) {
    failures.push(`patch package name ${patchName} does not match package name ${pkg.name}`);
}

if (pkg.dsh?.client) {
    if (pkg.dsh.client.platform !== "web") failures.push("dsh.client.platform must be web");
    if (!pkg.exports?.["./client"]) failures.push("client manifest requires exports[./client]");
    if (!pkg.files?.some((entry) => entry === "lib" || entry.startsWith("lib/"))) {
        failures.push("client manifest requires published lib artifacts");
    }
}

if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exitCode = 1;
} else {
    console.log(`PASS ${pkg.name} plugin contract`);
}
