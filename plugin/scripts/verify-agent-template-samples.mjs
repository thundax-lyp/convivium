#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(process.cwd(), "examples/agent-templates");
const expectedRoles = new Set([
    "meeting_manager",
    "domain_architect",
    "runtime_engineer",
    "protocol_ui_engineer",
    "verification_reviewer",
    "github_research_analyst",
    "arxiv_research_analyst",
    "web_research_analyst",
    "meeting_scribe"
]);
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const hashPattern = /^[a-f0-9]{64}$/;
const failures = [];
const templateIds = new Set();
const roleIds = new Set();

function validateRef(ref, location) {
    if (
        ref === null ||
        typeof ref !== "object" ||
        !tokenPattern.test(ref.id ?? "") ||
        !tokenPattern.test(ref.version ?? "")
    ) {
        failures.push(`${location} must be a versioned resource reference`);
    }
}

function validateRefList(value, location) {
    if (!Array.isArray(value) || value.length === 0) {
        failures.push(`${location} must contain at least one resource reference`);
        return;
    }
    value.forEach((ref, index) => validateRef(ref, `${location}[${index}]`));
}

const entries = await readdir(root, { withFileTypes: true });
const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

for (const directory of directories) {
    const packageRoot = join(root, directory);
    let manifest;
    let roleText;
    try {
        manifest = JSON.parse(await readFile(join(packageRoot, "agent-template.json"), "utf8"));
        roleText = await readFile(join(packageRoot, "ROLE.md"), "utf8");
    } catch (error) {
        failures.push(`${directory} is not a readable Template package: ${error.message}`);
        continue;
    }

    const location = `${directory}/agent-template.json`;
    if (manifest.schemaVersion !== 1) failures.push(`${location} schemaVersion must be 1`);
    if (!tokenPattern.test(manifest.templateId ?? "")) {
        failures.push(`${location} has an invalid templateId`);
    } else if (templateIds.has(manifest.templateId)) {
        failures.push(`${location} duplicates templateId ${manifest.templateId}`);
    } else {
        templateIds.add(manifest.templateId);
    }
    if (!tokenPattern.test(manifest.templateVersion ?? "")) {
        failures.push(`${location} has an invalid templateVersion`);
    }
    if (!expectedRoles.has(manifest.roleDefinitionId)) {
        failures.push(`${location} has an unsupported roleDefinitionId`);
    } else if (roleIds.has(manifest.roleDefinitionId)) {
        failures.push(`${location} duplicates roleDefinitionId ${manifest.roleDefinitionId}`);
    } else {
        roleIds.add(manifest.roleDefinitionId);
    }

    if (manifest.roleInstructions?.path !== "ROLE.md") {
        failures.push(`${location} must reference the package-local ROLE.md`);
    }
    const actualRoleHash = createHash("sha256").update(roleText).digest("hex");
    if (!hashPattern.test(manifest.roleInstructions?.sha256 ?? "")) {
        failures.push(`${location} has an invalid ROLE.md sha256`);
    } else if (manifest.roleInstructions.sha256 !== actualRoleHash) {
        failures.push(`${location} ROLE.md sha256 does not match its content`);
    }

    validateRefList(manifest.baseInstructionSetRefs, `${location} baseInstructionSetRefs`);
    validateRefList(manifest.skillSetRefs, `${location} skillSetRefs`);
    validateRefList(manifest.toolSetRefs, `${location} toolSetRefs`);
    validateRefList(manifest.mcpSetRefs, `${location} mcpSetRefs`);
    validateRef(manifest.permissionProfileRef, `${location} permissionProfileRef`);
    validateRef(manifest.outputContractRef, `${location} outputContractRef`);

    if (manifest.modelPolicy !== undefined) {
        const fields = Object.keys(manifest.modelPolicy);
        const unsupported = fields.filter(
            (field) => !["provider", "model", "maxTokens"].includes(field)
        );
        if (unsupported.length > 0) {
            failures.push(
                `${location} modelPolicy has unsupported fields: ${unsupported.join(", ")}`
            );
        }
        if (
            manifest.modelPolicy.maxTokens !== undefined &&
            (!Number.isInteger(manifest.modelPolicy.maxTokens) ||
                manifest.modelPolicy.maxTokens <= 0)
        ) {
            failures.push(`${location} modelPolicy.maxTokens must be a positive integer`);
        }
    }
}

for (const roleId of expectedRoles) {
    if (!roleIds.has(roleId)) failures.push(`missing sample for roleDefinitionId ${roleId}`);
}

if (directories.length !== expectedRoles.size) {
    failures.push(
        `expected ${expectedRoles.size} Template package directories, found ${directories.length}`
    );
}

if (failures.length > 0) {
    failures.forEach((failure) => console.error(`FAIL ${failure}`));
    process.exitCode = 1;
} else {
    console.log(`PASS ${directories.length} DSH Agent Template samples`);
}
