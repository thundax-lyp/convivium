import { SubmitEvidenceActionSchema } from "@/protocol/index.ts";

type Block = { name: string; id?: string; lines: string[] };
const fail = (message: string): never => {
    throw new Error(message);
};
const text = (lines: string[]) => lines.join("\n").trim();
const fields = (block: Block, required: string[], optional: string[] = []) => {
    const result: Record<string, string[]> = {};
    let current: string | undefined;
    for (const line of block.lines) {
        if (line.startsWith("@")) {
            current = line.slice(1);
            if (![...required, ...optional].includes(current) || Object.hasOwn(result, current)) {
                fail(`${block.name} ${block.id}: unknown or duplicate field ${current}`);
            }
            result[current] = [];
        } else if (current) {
            result[current]!.push(line);
        } else if (line.trim()) {
            fail(`${block.name} ${block.id}: content outside field`);
        }
    }
    for (const key of required) {
        if (!Object.hasOwn(result, key)) {
            fail(`${block.name} ${block.id}: missing ${key}`);
        }
    }
    return result;
};
const list = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);

export const parseWebEvidence = (draft: string) => {
    const blocks: Block[] = [];
    let current: Block | undefined;
    for (const line of draft.split(/\r?\n/)) {
        if (line.startsWith("## ")) {
            const match =
                /^## (summary|observation|interpretation|method|falsifier F[1-9]\d*|uncertainty U[1-9]\d*|limitation L[1-9]\d*|claim C[1-9]\d*|material M[1-9]\d*)$/.exec(
                    line
                );
            if (!match) {
                fail(`Unknown section: ${line}`);
            }
            const [name, id] = match![1]!.split(" ");
            if (blocks.some((block) => block.name === name && block.id === id)) {
                fail(`Duplicate section: ${match![1]}`);
            }
            current = { name: name!, ...(id ? { id } : {}), lines: [] };
            blocks.push(current);
        } else if (current) {
            current.lines.push(line);
        } else if (line.trim()) {
            fail("Text outside section");
        }
    }
    const one = (name: string) => {
        const found = blocks.filter((b) => b.name === name);
        if (found.length !== 1) {
            fail(`Expected one ${name} section`);
        }
        return text(found[0]!.lines);
    };
    const notes = (name: string) =>
        blocks
            .filter((b) => b.name === name)
            .map((b) => {
                const f = fields(b, ["value", "reason"]);
                return { value: text(f.value!), reason: text(f.reason!) };
            });
    const claims = blocks
        .filter((b) => b.name === "claim")
        .map((b) => {
            const f = fields(b, ["statement", "materialIds", "qualification"]);
            return {
                id: b.id!,
                statement: text(f.statement!),
                materialIds: list(f.materialIds!),
                qualification: text(f.qualification!)
            };
        });
    const materials = blocks
        .filter((b) => b.name === "material")
        .map((b) => {
            const f = fields(
                b,
                [
                    "kind",
                    "originator",
                    "originalSource",
                    "sourcePublishedAt",
                    "acquiredAt",
                    "version",
                    "locator",
                    "location",
                    "verificationConditions",
                    "limitations",
                    "sharedDependencies"
                ],
                ["reason"]
            );
            return {
                id: b.id!,
                ...Object.fromEntries(
                    Object.entries(f).map(([k, v]) => [
                        k,
                        k === "sharedDependencies" ? list(v) : text(v)
                    ])
                )
            };
        });
    for (const claim of claims) {
        if (
            claim.materialIds.length === 0 ||
            new Set(claim.materialIds).size !== claim.materialIds.length ||
            claim.materialIds.some((id) => !materials.some((m) => m.id === id))
        ) {
            fail(`${claim.id}: invalid materialIds`);
        }
    }
    // One authoritative evidence contract; never synthesize missing content.
    return SubmitEvidenceActionSchema.shape.evidence.parse({
        summary: one("summary"),
        observation: one("observation"),
        interpretation: one("interpretation"),
        method: one("method"),
        falsifiers: notes("falsifier"),
        uncertainties: notes("uncertainty"),
        limitations: notes("limitation"),
        claims,
        materials
    });
};
