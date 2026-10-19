import { readFileSync } from "node:fs";
import { parseWebEvidence } from "../../../../lib/web-evidence.js";
try {
    const draft = readFileSync(process.argv[2] ?? 0, "utf8");
    process.stdout.write(JSON.stringify(parseWebEvidence(draft), null, 2) + "\n");
} catch (error) {
    console.error(error.message);
    process.exitCode = 2;
}
