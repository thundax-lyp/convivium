import { expect, it } from "vitest";
import { parseWebEvidence } from "@/evidence-content/index.ts";

import { draft } from "../../fixtures/web-evidence.ts";

it("converts content to JSON without inventing fields or losing quotes and newlines", () => {
    const evidence = parseWebEvidence(draft);
    expect(evidence.summary).toBe('合规不等于语义保持：引文含 "quotes"、反斜杠 \\ 和多行。');
    expect(evidence.observation).toBe("读到原文。\n第二行保留。");
    expect(evidence.materials[0]!.sharedDependencies).toEqual([]);
    expect(evidence.claims[0]!.materialIds).toEqual(["M1"]);
    expect(JSON.parse(JSON.stringify(evidence))).toEqual(evidence);
    expect(evidence).not.toHaveProperty("protocolVersion");
});
it.each([
    draft.replace("## summary", "## unknown"),
    draft.replace("## uncertainty U1", "## limitation L2"),
    draft + "\n## summary\nduplicate",
    draft.replace("@materialIds\nM1", "@materialIds\nM2"),
    draft.replace("@version\nfixed-ref\n", ""),
    draft.replace("@version", "@unexpected")
])("rejects malformed content rather than filling or relocating fields", (invalid) => {
    expect(() => parseWebEvidence(invalid)).toThrow();
});
