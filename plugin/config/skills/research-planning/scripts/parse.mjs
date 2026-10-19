import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parsePlan, validateReview } from "../../../../lib/research-planning.js";
export { parsePlan, validateReview };

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
