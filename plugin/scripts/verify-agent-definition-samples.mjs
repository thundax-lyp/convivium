#!/usr/bin/env node
import { lstat, readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import process from "node:process";

const roles = [
    ["meeting_manager", "meeting-management"],
    ["domain_architect", "domain-architecture"],
    ["runtime_engineer", "dsh-runtime-engineering"],
    ["protocol_ui_engineer", "protocol-ui-engineering"],
    ["verification_reviewer", "verification-review"],
    ["github_research_analyst", "github-source-research"],
    ["arxiv_research_analyst", "arxiv-paper-analysis"],
    ["web_research_analyst", "web-source-research"],
    ["meeting_scribe", "referenced-minutes"]
];
const preset = "presets/convivium";
const files = [
    "README.md",
    "definitions.json",
    "cordis.patch.yml",
    `${preset}/preset.yml`,
    `${preset}/agent.cordis.yml`,
    ...roles.map(([, skill]) => `${preset}/skills/${skill}/SKILL.md`)
];
const directories = new Set(
    files.flatMap((file) => {
        const parts = file.split("/");
        return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
    })
);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fields = [
    "agentDefinitionId",
    "definitionVersion",
    "roleDefinitionId",
    "displayName",
    "summary",
    "roleDescription",
    "dshPresetId",
    "requiredSkillNames",
    "expertiseTags",
    "evidenceScopes"
];

/** Validate the closed deployment asset set without following links or loading plugins. */
export async function verifyMeetingAgentDefinitions(root) {
    const errors = [];
    const add = (code, location) => errors.push({ code, location });
    try {
        const stat = await lstat(root);
        if (stat.isSymbolicLink()) return [{ code: "SYMLINK_FORBIDDEN", location: "." }];
        if (!stat.isDirectory()) return [{ code: "ROOT_NOT_READABLE", location: "." }];
    } catch {
        return [{ code: "ROOT_NOT_READABLE", location: "." }];
    }
    const contents = new Map();
    const seen = new Set();
    async function walk(relative) {
        for (const name of await readdir(join(root, relative))) {
            const location = relative ? `${relative}/${name}` : name;
            const stat = await lstat(join(root, location));
            seen.add(location);
            if (stat.isSymbolicLink()) {
                add("SYMLINK_FORBIDDEN", location);
                continue;
            }
            if (stat.isDirectory() && directories.has(location)) await walk(location);
            else if (stat.isFile() && files.includes(location))
                contents.set(location, await readFile(join(root, location), "utf8"));
            else add("FILE_SET_MISMATCH", location);
        }
    }
    try {
        await walk("");
    } catch {
        add("ROOT_NOT_READABLE", ".");
    }
    for (const file of files) if (!seen.has(file)) add("FILE_SET_MISMATCH", file);
    if (contents.has("definitions.json")) {
        let doc;
        try {
            doc = JSON.parse(contents.get("definitions.json"));
        } catch {
            add("JSON_INVALID", "definitions.json");
        }
        if (doc !== undefined) {
            if (
                !doc ||
                !same(Object.keys(doc).sort(), ["definitions", "schemaVersion"]) ||
                doc.schemaVersion !== 1 ||
                !Array.isArray(doc.definitions) ||
                doc.definitions.length !== 9
            )
                add("DEFINITION_INVALID", "definitions.json");
            else
                doc.definitions.forEach((d, i) => {
                    const [role, skill] = roles[i];
                    const allow =
                        i === 0
                            ? ["skill", "convivium_meeting_status", "convivium_submit_manager_plan"]
                            : i === 8
                              ? ["skill", "convivium_meeting_status", "convivium_submit_turn"]
                              : undefined;
                    const expectedFields = [...fields, ...(allow ? ["toolFilter"] : [])].sort();
                    if (
                        !d ||
                        !same(Object.keys(d).sort(), expectedFields) ||
                        d.agentDefinitionId !== `convivium.${role}` ||
                        d.roleDefinitionId !== role ||
                        d.definitionVersion !== "1.0.0" ||
                        d.dshPresetId !== "convivium" ||
                        !same(d.requiredSkillNames, [skill]) ||
                        ![d.displayName, d.summary, d.roleDescription].every(nonempty) ||
                        d.roleDescription.includes("{{") ||
                        !Array.isArray(d.expertiseTags) ||
                        !d.expertiseTags.length ||
                        !d.expertiseTags.every(nonempty) ||
                        new Set(d.expertiseTags).size !== d.expertiseTags.length ||
                        !Array.isArray(d.evidenceScopes) ||
                        !d.evidenceScopes.every((s) =>
                            ["repository", "github", "arxiv", "web"].includes(s)
                        ) ||
                        new Set(d.evidenceScopes).size !== d.evidenceScopes.length ||
                        (allow && !same(d.toolFilter, { allow })) ||
                        Buffer.byteLength(JSON.stringify(d)) > 16384
                    )
                        add("DEFINITION_INVALID", `definitions.json/${i}`);
                });
        }
    }
    for (const [, skill] of roles) {
        const location = `${preset}/skills/${skill}/SKILL.md`;
        const text = contents.get(location);
        if (text === undefined) continue;
        const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
        const meta = match?.[1];
        const body = match?.[2];
        if (
            !meta ||
            !body ||
            !new RegExp(`^name: ['"]?${skill}['"]?$`, "m").test(meta) ||
            !/^description: ['"]?\S.+$/m.test(meta) ||
            !/^disable-model-invocation: false$/m.test(meta) ||
            !/^user-invocable: true$/m.test(meta) ||
            !/^# \S.+$/m.test(body) ||
            ![1, 2, 3, 4].every((n) => new RegExp(`^${n}\\. \\S.+$`, "m").test(body))
        )
            add("SKILL_INVALID", location);
    }
    return errors.sort((a, b) =>
        a.location < b.location
            ? -1
            : a.location > b.location
              ? 1
              : a.code < b.code
                ? -1
                : a.code > b.code
                  ? 1
                  : 0
    );
}
const defaultRoot = fileURLToPath(new URL("../meeting-roles/", import.meta.url));
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const errors = await verifyMeetingAgentDefinitions(defaultRoot);
    if (errors.length) {
        for (const error of errors) console.error(`FAIL ${error.code} ${error.location}`);
        process.exitCode = 1;
    } else console.log("PASS 9 Meeting Agent Definition deployment roles");
}
