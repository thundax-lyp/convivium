#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import process from "node:process";

export const agentDefinitionSampleErrorCodes = Object.freeze([
    "ROOT_NOT_READABLE",
    "ROOT_ENTRY_INVALID",
    "SAMPLE_DIRECTORY_SET_MISMATCH",
    "SAMPLE_FILE_SET_MISMATCH",
    "SYMLINK_FORBIDDEN",
    "JSON_INVALID",
    "DEFINITION_FIELD_SET_MISMATCH",
    "SAMPLE_MATRIX_MISMATCH",
    "PERSONA_PATH_INVALID",
    "PERSONA_HASH_INVALID",
    "PERSONA_HASH_MISMATCH",
    "DUPLICATE_AGENT_DEFINITION_ID",
    "DUPLICATE_ROLE_DEFINITION_ID"
]);
const rootNames = [
    "README.md",
    "arxiv-research-analyst",
    "domain-architect",
    "github-research-analyst",
    "meeting-manager",
    "meeting-scribe",
    "protocol-ui-engineer",
    "runtime-engineer",
    "verification-reviewer",
    "web-research-analyst"
];
const matrix = {
    "meeting-manager": [
        "meeting_manager",
        ["meeting-management"],
        [],
        ["meeting-planning", "scope-control", "attendance-recommendation"],
        ["convivium_meeting_status", "convivium_submit_manager_plan"]
    ],
    "domain-architect": [
        "domain_architect",
        ["domain-architecture"],
        ["repository"],
        ["domain-model", "requirements", "architecture"]
    ],
    "runtime-engineer": [
        "runtime_engineer",
        ["dsh-runtime-engineering"],
        ["repository"],
        ["dsh-runtime", "transactions", "recovery"]
    ],
    "protocol-ui-engineer": [
        "protocol_ui_engineer",
        ["protocol-ui-engineering"],
        ["repository"],
        ["protocol", "tools", "client-ui"]
    ],
    "verification-reviewer": [
        "verification_reviewer",
        ["verification-review"],
        ["repository"],
        ["verification", "regression", "readiness"]
    ],
    "github-research-analyst": [
        "github_research_analyst",
        ["github-source-research"],
        ["github"],
        ["github", "source-analysis", "release-evidence"]
    ],
    "arxiv-research-analyst": [
        "arxiv_research_analyst",
        ["arxiv-paper-analysis"],
        ["arxiv"],
        ["arxiv", "paper-analysis", "research-evidence"]
    ],
    "web-research-analyst": [
        "web_research_analyst",
        ["web-source-research"],
        ["web"],
        ["web", "official-documentation", "current-information"]
    ],
    "meeting-scribe": [
        "meeting_scribe",
        ["referenced-minutes"],
        [],
        ["minutes", "fact-tracing", "decision-recording"],
        ["convivium_meeting_status", "convivium_submit_turn"]
    ]
};
const display = {
    meeting_manager: "Meeting Manager",
    domain_architect: "Domain Architect",
    runtime_engineer: "Runtime Engineer",
    protocol_ui_engineer: "Protocol and UI Engineer",
    verification_reviewer: "Verification Reviewer",
    github_research_analyst: "GitHub Research Analyst",
    arxiv_research_analyst: "arXiv Research Analyst",
    web_research_analyst: "Web Research Analyst",
    meeting_scribe: "Meeting Scribe"
};
const summary = {
    meeting_manager: "围绕当前议题形成有界发言计划，并在存在职责或证据缺口时提出参会推荐。",
    domain_architect: "审核领域状态、不变量、需求与设计一致性以及 completion/termination 语义。",
    runtime_engineer: "分析 DSH runtime、事务、outbox、恢复和 AgentSession 生命周期。",
    protocol_ui_engineer: "分析 Protocol Schema、Tools、HTTP、projection 与 Client UI 边界。",
    verification_reviewer: "建立测试矩阵、反例、回归和 readiness 证据。",
    github_research_analyst: "搜索并分析官方 repository、源码、commit、issue、PR 与 release。",
    arxiv_research_analyst: "搜索并分析论文版本、方法、实验结论与局限。",
    web_research_analyst: "搜索并分析官方文档、标准、发布说明、安全公告与时效信息。",
    meeting_scribe: "从正式 transcript、事实、决议与任务结果形成带 canonical 引用的纪要草稿。"
};
const hashes = {
    "meeting-manager": "a0fa07824aec671bd7b292674ea1233108151b1baf9b06ef09b72c7349bbf173",
    "domain-architect": "38d1ade66ef1f0cbf5893df0d440653c25955215de99cf2ba0a4981fc7dab9d0",
    "runtime-engineer": "62b383eceac31c79edd40ea9ba1aa0207c21c74954f1e31b533c55b23b1ec88b",
    "protocol-ui-engineer": "876247158afdd8e918873223581ea3ec2372d95d86d0031a2987132c9866d5d9",
    "verification-reviewer": "ce8987f755e9cb646813e5bfcfdcf48649700fd4ac82080ccaf0ab48962a5e3e",
    "github-research-analyst": "f612ea1ed2828b4581def3139d6823932d2a774224698dacf32f29e19cb9d8d2",
    "arxiv-research-analyst": "caddeeb95806dd9a477bb5ac222424ba8fc8add7e1416b111285d447c0ab4302",
    "web-research-analyst": "92fe78e64311ef4b244a65a15dcdf3a5a3138e76155d45ca1c80bb5d6a3c5113",
    "meeting-scribe": "9612249b8a6fd1a7e1cf50030f590beccb0f0b615bcb7f39a1e7ec8d5456a2e8"
};
function same(a, b) {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
        return (
            Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((value, index) => same(value, b[index]))
        );
    }
    if (a && typeof a === "object" && b && typeof b === "object") {
        const ak = Object.keys(a).sort();
        const bk = Object.keys(b).sort();
        return same(ak, bk) && ak.every((key) => same(a[key], b[key]));
    }
    return false;
}
export async function verifyMeetingAgentDefinitionSamples(root) {
    const errors = [];
    const add = (code, location) => errors.push({ code, location });
    let entries;
    try {
        await lstat(root);
        entries = await readdir(root);
    } catch {
        return [{ code: "ROOT_NOT_READABLE", location: "." }];
    }
    if (!same([...entries].sort(), [...rootNames].sort()))
        add("SAMPLE_DIRECTORY_SET_MISMATCH", ".");
    for (const name of entries) {
        const path = join(root, name);
        let stat;
        try {
            stat = await lstat(path);
        } catch {
            add("ROOT_ENTRY_INVALID", name);
            continue;
        }
        if (stat.isSymbolicLink()) {
            add("SYMLINK_FORBIDDEN", name);
            continue;
        }
        if (name === "README.md") {
            if (!stat.isFile()) add("ROOT_ENTRY_INVALID", name);
            continue;
        }
        if (!Object.hasOwn(matrix, name)) {
            if (!stat.isDirectory()) add("ROOT_ENTRY_INVALID", name);
            continue;
        }
        if (!stat.isDirectory()) {
            add("ROOT_ENTRY_INVALID", name);
            continue;
        }
        let children;
        try {
            children = await readdir(path);
        } catch {
            add("SAMPLE_FILE_SET_MISMATCH", name);
            continue;
        }
        if (!same([...children].sort(), ["AGENT.md", "agent-definition.json"])) {
            add("SAMPLE_FILE_SET_MISMATCH", name);
            continue;
        }
        const jsonPath = join(path, "agent-definition.json");
        const personaPath = join(path, "AGENT.md");
        let doc;
        try {
            doc = JSON.parse(await readFile(jsonPath, "utf8"));
        } catch {
            add("JSON_INVALID", `${name}/agent-definition.json`);
            continue;
        }
        const required = [
            "schemaVersion",
            "agentDefinitionId",
            "definitionVersion",
            "roleDefinitionId",
            "displayName",
            "summary",
            "persona",
            "dshPresetId",
            "requiredSkillNames",
            "expertiseTags",
            "evidenceScopes"
        ];
        const wantsTool = matrix[name][4] !== undefined;
        const keys = Object.keys(doc);
        const expectedKeys = wantsTool ? [...required, "toolFilter"] : required;
        if (
            !same([...keys].sort(), [...expectedKeys].sort()) ||
            !doc.persona ||
            typeof doc.persona !== "object" ||
            Array.isArray(doc.persona) ||
            !same(Object.keys(doc.persona).sort(), ["path", "sha256"])
        ) {
            add("DEFINITION_FIELD_SET_MISMATCH", `${name}/agent-definition.json`);
            continue;
        }
        if (typeof doc.persona.path !== "string") {
            add("PERSONA_PATH_INVALID", `${name}/agent-definition.json`);
            continue;
        }
        if (typeof doc.persona.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(doc.persona.sha256)) {
            add("PERSONA_HASH_INVALID", `${name}/agent-definition.json`);
            continue;
        }
        const [role, skills, scopes, tags, tools] = matrix[name];
        const expected = {
            schemaVersion: 1,
            agentDefinitionId: `convivium.${role}`,
            definitionVersion: "1.0.0",
            roleDefinitionId: role,
            displayName: display[role],
            summary: summary[role],
            dshPresetId: `convivium-${name}`,
            requiredSkillNames: skills,
            expertiseTags: tags,
            evidenceScopes: scopes
        };
        if (wantsTool) expected.toolFilter = { allow: tools };
        const actual = { ...doc, persona: undefined };
        delete actual.persona;
        if (!same(actual, expected)) add("SAMPLE_MATRIX_MISMATCH", `${name}/agent-definition.json`);
        if (doc.persona.path !== "AGENT.md")
            add("PERSONA_PATH_INVALID", `${name}/agent-definition.json`);
        else if (doc.persona.sha256 !== hashes[name])
            add("PERSONA_HASH_MISMATCH", `${name}/agent-definition.json`);
        else {
            try {
                const text = await readFile(personaPath);
                if (createHash("sha256").update(text).digest("hex") !== doc.persona.sha256)
                    add("PERSONA_HASH_MISMATCH", `${name}/AGENT.md`);
            } catch {
                add("PERSONA_HASH_MISMATCH", `${name}/AGENT.md`);
            }
        }
    }
    const seenDef = new Map(),
        seenRole = new Map();
    for (const name of Object.keys(matrix).sort()) {
        try {
            const doc = JSON.parse(await readFile(join(root, name, "agent-definition.json")));
            for (const [key, code] of [
                ["agentDefinitionId", "DUPLICATE_AGENT_DEFINITION_ID"],
                ["roleDefinitionId", "DUPLICATE_ROLE_DEFINITION_ID"]
            ]) {
                const seen = key === "agentDefinitionId" ? seenDef : seenRole;
                if (seen.has(doc[key])) add(code, `${name}/agent-definition.json`);
                else seen.set(doc[key], name);
            }
        } catch {
            continue;
        }
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
const defaultRoot = fileURLToPath(
    new URL("../examples/meeting-agent-definitions/", import.meta.url)
);
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const errors = await verifyMeetingAgentDefinitionSamples(defaultRoot);
    if (errors.length) {
        for (const e of errors) console.error(`FAIL ${e.code} ${e.location}`);
        process.exitCode = 1;
    } else console.log("PASS 9 Meeting Agent Definition samples");
}
