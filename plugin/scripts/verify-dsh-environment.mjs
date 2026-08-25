#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(process.cwd());
const packagePath = join(root, "package.json");
const required = ["package.json", "pnpm-lock.yaml", "tsconfig.json"];

for (const file of required) {
    await access(join(root, file), constants.F_OK);
}

const pkg = JSON.parse(await readFile(packagePath, "utf8"));
const dshPackages = Object.keys({ ...pkg.peerDependencies, ...pkg.devDependencies }).filter(
    (name) => name.startsWith("@deepseek-ai/")
);

const missing = [];
for (const name of dshPackages) {
    try {
        await access(join(root, "node_modules", name, "package.json"), constants.F_OK);
    } catch {
        missing.push(name);
    }
}

console.log(`project: ${pkg.name ?? "unknown"}`);
console.log(`node: ${process.version}`);
console.log(`dsh packages declared: ${dshPackages.length}`);

if (missing.length > 0) {
    console.error(`missing installed DSH packages: ${missing.join(", ")}`);
    process.exitCode = 1;
} else {
    console.log("all declared DSH packages are installed");
}
