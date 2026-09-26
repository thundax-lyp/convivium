#!/usr/bin/env node
import { lstat, readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

const roles = [
    ["meeting_manager", "manager", ["meeting-facilitation"]],
    ["domain_architect", "domain-architect", ["repository-analysis"]],
    ["runtime_engineer", "runtime-engineer", ["repository-analysis"]],
    ["protocol_ui_engineer", "protocol-ui-engineer", ["repository-analysis"]],
    [
        "verification_reviewer",
        "verification-reviewer",
        ["arxiv", "evidence-review", "github", "repository-analysis"]
    ],
    ["github_research_analyst", "github-research-analyst", ["github"]],
    ["arxiv_research_analyst", "arxiv-research-analyst", ["arxiv"]]
];
const skills = [...new Set(roles.flatMap(([, , assigned]) => assigned))].sort();
export const definitionAssetFiles = [
    "README.md",
    "definitions.json",
    "cordis.patch.yml",
    "skills/convivium/SKILL.md",
    ...roles.flatMap(([role, preset]) => [
        `agents/${role}/2.0.0/AGENTS.md`,
        `presets/convivium-${preset}/preset.yml`,
        `presets/convivium-${preset}/agent.cordis.yml`
    ]),
    ...skills.map((skill) => `skills/${skill}/SKILL.md`)
];
const files = definitionAssetFiles;
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
    "agentInstructions",
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
                doc.definitions.length !== 7
            )
                add("DEFINITION_INVALID", "definitions.json");
            else
                doc.definitions.forEach((d, i) => {
                    const [role, preset, assigned] = roles[i];
                    const contributorDeny = [
                        "convivium_submit_manager_plan",
                        "convivium_open_round",
                        "convivium_dispose_hand_raise",
                        "convivium_publish_round",
                        "convivium_run_review_worker",
                        "convivium_submit_evidence_review",
                        "convivium_recommend_identity"
                    ];
                    const toolFilter =
                        role === "meeting_manager"
                            ? {
                                  allow: [
                                      "skill",
                                      "convivium_read_meeting",
                                      "convivium_submit_manager_plan",
                                      "convivium_open_round",
                                      "convivium_dispose_hand_raise",
                                      "convivium_publish_round",
                                      "convivium_recommend_identity"
                                  ]
                              }
                            : role === "verification_reviewer"
                              ? {
                                    allow: [
                                        "skill",
                                        "convivium_read_meeting",
                                        "convivium_run_review_worker",
                                        "convivium_submit_evidence_review"
                                    ]
                                }
                              : { deny: contributorDeny };
                    const expectedFields = [...fields, "toolFilter"].sort();
                    if (
                        !d ||
                        !same(Object.keys(d).sort(), expectedFields) ||
                        d.agentDefinitionId !== `convivium.${role}` ||
                        d.roleDefinitionId !== role ||
                        d.definitionVersion !== "2.0.0" ||
                        d.dshPresetId !== `convivium-${preset}` ||
                        !same(d.requiredSkillNames, assigned) ||
                        ![d.displayName, d.summary].every(nonempty) ||
                        !same(d.agentInstructions, {
                            roleDefinitionId: role,
                            version: "2.0.0",
                            sha256: createHash("sha256")
                                .update(contents.get(`agents/${role}/2.0.0/AGENTS.md`) ?? "")
                                .digest("hex")
                        }) ||
                        !Array.isArray(d.expertiseTags) ||
                        !d.expertiseTags.length ||
                        !d.expertiseTags.every(nonempty) ||
                        new Set(d.expertiseTags).size !== d.expertiseTags.length ||
                        !Array.isArray(d.evidenceScopes) ||
                        !d.evidenceScopes.every((s) =>
                            ["repository", "github", "arxiv", "web"].includes(s)
                        ) ||
                        new Set(d.evidenceScopes).size !== d.evidenceScopes.length ||
                        !same(d.toolFilter, toolFilter) ||
                        Buffer.byteLength(JSON.stringify(d)) > 16384
                    )
                        add("DEFINITION_INVALID", `definitions.json/${i}`);
                });
        }
    }
    for (const skill of skills) {
        const location = `skills/${skill}/SKILL.md`;
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
            !/^# \S.+$/m.test(body) ||
            ![1, 2, 3, 4].every((n) => new RegExp(`^${n}\\. \\S.+$`, "m").test(body))
        )
            add("SKILL_INVALID", location);
    }
    const userSkill = contents.get("skills/convivium/SKILL.md") ?? "";
    if (
        !/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(userSkill) ||
        !/^name: convivium$/m.test(userSkill) ||
        !/^disable-model-invocation: true$/m.test(userSkill) ||
        !/^user-invocable: true$/m.test(userSkill) ||
        !userSkill.includes("convivium_start_meeting")
    )
        add("SKILL_INVALID", "skills/convivium/SKILL.md");
    for (const [role, preset, assigned] of roles) {
        const path = `presets/convivium-${preset}/agent.cordis.yml`;
        const config = contents.get(path) ?? "";
        const visible = [...config.matchAll(/skills\/([a-z-]+)\//g)]
            .map((match) => match[1])
            .sort();
        if (
            !same(visible, assigned) ||
            !config.includes("includeDefaultRoots: false") ||
            !config.includes(`providerName: convivium-${preset}`)
        )
            add("PRESET_INVALID", path);
        if (!nonempty(contents.get(`agents/${role}/2.0.0/AGENTS.md`)))
            add("DEFINITION_INVALID", `agents/${role}/2.0.0/AGENTS.md`);
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
const defaultRoot = fileURLToPath(new URL("../config/", import.meta.url));
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const errors = await verifyMeetingAgentDefinitions(defaultRoot);
    if (errors.length) {
        for (const error of errors) console.error(`FAIL ${error.code} ${error.location}`);
        process.exitCode = 1;
    } else console.log("PASS 7 enabled Meeting Agent Definition deployment roles");
}
