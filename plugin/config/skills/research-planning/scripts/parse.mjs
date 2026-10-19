import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const parsePlan = (question, draft) => {
    const fail = (message) => {
        throw new Error(message);
    };
    if (typeof question !== "string" || typeof draft !== "string") {
        fail("question and draft must be strings");
    }
    const blocks = [];
    let block;
    for (const raw of draft.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) {
            continue;
        }
        const header = /^\[(问题|要求 R[1-9]\d*|对象 O[1-9]\d*|横贯要求|未决前提|下一步)\]$/.exec(
            line
        );
        if (header) {
            block = { header: header[1], lines: [] };
            blocks.push(block);
        } else if (!block || line.startsWith("[")) {
            fail(`Unknown section or text: ${line}`);
        } else {
            block.lines.push(line);
        }
    }
    const one = (name) => {
        const matches = blocks.filter((b) => b.header === name);
        if (matches.length !== 1) {
            fail(`Expected one section: ${name}`);
        }
        return matches[0];
    };
    const text = (lines) => {
        if (lines.length !== 1 || !lines[0]) {
            fail("Expected one nonempty text line");
        }
        return lines[0];
    };
    const list = (lines) =>
        lines.map((line) => {
            if (!line.startsWith("- ") || !line.slice(2).trim()) {
                fail(`Expected list item: ${line}`);
            }
            return line.slice(2).trim();
        });
    const ids = (value, prefix) => {
        const values = value.split(",").map((v) => v.trim());
        if (
            values.some((v) => !new RegExp(`^${prefix}[1-9]\\d*$`).test(v)) ||
            new Set(values).size !== values.length
        ) {
            fail("Invalid or duplicate IDs");
        }
        return values;
    };
    const fields = (b, names) => {
        const found = new Map();
        let current;
        for (const line of b.lines) {
            const match = /^([^：]+)：(.*)$/.exec(line);
            if (match && !line.startsWith("- ")) {
                current = match[1];
                if (!names.includes(current) || found.has(current)) {
                    fail(`Unknown or duplicate field: ${current}`);
                }
                found.set(current, match[2].trim() ? [match[2].trim()] : []);
            } else if (current) {
                found.get(current).push(line);
            } else {
                fail(`Text outside field: ${line}`);
            }
        }
        if (found.size !== names.length) {
            fail(`Missing fields in ${b.header}`);
        }
        return Object.fromEntries(found);
    };
    if (text(one("问题").lines) !== question) {
        fail("Original question changed");
    }
    const requirements = blocks
        .filter((b) => b.header.startsWith("要求 "))
        .map((b) => ({ id: b.header.slice(3), text: text(b.lines) }));
    const researchObjects = blocks
        .filter((b) => b.header.startsWith("对象 "))
        .map((b) => {
            const f = fields(b, ["名称", "目标", "包含", "排除", "覆盖", "依赖", "边界"]);
            const includes = list(f["包含"]);
            if (!includes.length) {
                fail("Object must include a research question");
            }
            const dependencyInputs = list(f["依赖"]).map((line) => {
                const match = /^(O[1-9]\d*) \| (.+)$/.exec(line);
                if (!match) {
                    fail("Dependency must be O<number> | required result");
                }
                return { objectId: match[1], requiredResult: match[2] };
            });
            return {
                id: b.header.slice(3),
                name: text(f["名称"]),
                discussionGoal: text(f["目标"]),
                includes,
                excludes: list(f["排除"]),
                coversRequirementIds: ids(text(f["覆盖"]), "R"),
                dependencyInputs,
                boundaryWithOthers: text(f["边界"])
            };
        });
    if (!requirements.length || !researchObjects.length) {
        fail("Requirements and objects are required");
    }
    const req = new Set(requirements.map((r) => r.id));
    const obj = new Set(researchObjects.map((o) => o.id));
    if (req.size !== requirements.length || obj.size !== researchObjects.length) {
        fail("Duplicate IDs");
    }
    const covered = new Set();
    for (const o of researchObjects) {
        for (const id of o.coversRequirementIds) {
            if (!req.has(id)) {
                fail(`Unknown requirement: ${id}`);
            }
            covered.add(id);
        }
        const deps = o.dependencyInputs.map((d) => d.objectId);
        if (new Set(deps).size !== deps.length || deps.some((d) => !obj.has(d) || d === o.id)) {
            fail(`Invalid dependency for ${o.id}`);
        }
    }
    const visit = (id, path) => {
        if (path.has(id)) {
            fail("Dependency cycle");
        }
        for (const dep of researchObjects.find((o) => o.id === id).dependencyInputs) {
            visit(dep.objectId, new Set([...path, id]));
        }
    };
    for (const id of obj) {
        visit(id, new Set());
    }
    const missing = [...req].filter((id) => !covered.has(id));
    if (missing.length) {
        fail(`Uncovered requirements: ${missing.join(",")}`);
    }
    const n = fields(one("下一步"), ["对象", "理由"]);
    const objectIds = ids(text(n["对象"]), "O");
    if (objectIds.some((id) => !obj.has(id))) {
        fail("Unknown next-step object");
    }
    return {
        originalQuestion: question,
        requirements,
        researchObjects,
        sharedRequirements: list(one("横贯要求").lines),
        unresolvedPremises: list(one("未决前提").lines),
        nextStep: { objectIds, rationale: text(n["理由"]) },
        coverageCheck: { uncoveredRequirementIds: missing }
    };
};

export const validateReview = (review) => {
    const keys = (value, expected) =>
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).sort().join(",") === expected;
    const text = (value) => typeof value === "string" && value.trim().length > 0;
    const categories = ["coverage", "boundaries", "dependencies", "premises"];
    if (
        !keys(review, "checks,findings,status") ||
        !["PASS", "FAIL"].includes(review.status) ||
        !Array.isArray(review.checks) ||
        review.checks.length !== categories.length ||
        !Array.isArray(review.findings)
    ) {
        throw new Error("Invalid review shape");
    }
    if (
        review.checks.some(
            (c) =>
                !keys(c, "check,evidence,status") ||
                !categories.includes(c.check) ||
                !["PASS", "FAIL"].includes(c.status) ||
                !text(c.evidence)
        ) ||
        new Set(review.checks.map((c) => c.check)).size !== categories.length ||
        review.findings.some(
            (f) => !keys(f, "evidence,location,rule") || !Object.values(f).every(text)
        )
    ) {
        throw new Error("Missing review checks or evidence");
    }
    const passed = review.checks.every((c) => c.status === "PASS");
    if ((review.status === "PASS") !== passed || passed !== (review.findings.length === 0)) {
        throw new Error("Review verdict conflicts with checks or findings");
    }
    return review;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const input = JSON.parse(readFileSync(0, "utf8"));
        const output =
            process.argv[2] === "review"
                ? validateReview(input)
                : parsePlan(input.question, input.draft);
        process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}
