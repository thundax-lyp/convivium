import { execFileSync } from "node:child_process";
import { readFile, lstat, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { createHash } from "node:crypto";
import { zstdCompressSync } from "node:zlib";

// Offline operator repair. Never delete, reorder or reinterpret diagnostic content.
const args = process.argv.slice(2);
const file = resolve(args[args.indexOf("--session-file") + 1] ?? "");
const backupArg = args.indexOf("--backup-dir");
if (!args.includes("--session-file") || backupArg < 0 || !args[backupArg + 1]) {
    throw new Error("Usage: --session-file FILE --backup-dir DIR [--apply]; stop Host first");
}
const stat = await lstat(file);
if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Regular Session file required");
}
const original = await readFile(file);
const compressed = file.endsWith(".zstd");
const source = (
    compressed
        ? execFileSync("zstd", ["-dc", "--", file], { maxBuffer: 512 * 1024 * 1024 })
        : original
).toString("utf8");
const lines = source.trimEnd().split("\n");
let changed = 0;
const repaired = lines.map((line, index) => {
    const event = JSON.parse(line);
    if (index === 0 || event.type !== "convivium/research-planning") {
        return line;
    }
    if (
        !Number.isSafeInteger(event.seq) ||
        typeof event.time !== "number" ||
        !event.data ||
        Object.keys(event.data).sort().join(",") !== "content,name" ||
        typeof event.data.content !== "string" ||
        !/^attempt-\d+\.(list\.txt|generation\.json|review\.txt|review-call\.json|validation\.json)$/.test(
            event.data.name
        )
    ) {
        throw new Error("Unrecognized planning diagnostic; refusing repair");
    }
    if (event.ignorable === true) {
        return line;
    }
    if (event.ignorable !== undefined) {
        throw new Error("Unexpected ignorable flag");
    }
    changed++;
    return JSON.stringify({ ...event, ignorable: true });
});
const sha256 = createHash("sha256").update(original).digest("hex");
if (args.includes("--apply") && changed) {
    const backupDir = resolve(args[backupArg + 1]);
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    await writeFile(join(backupDir, `${basename(file)}.${sha256}.backup`), original, {
        flag: "wx",
        mode: 0o600
    });
    // Keep the header in its own zstd frame, as required by native Session listing.
    const header = Buffer.from(`${repaired[0]}\n`);
    const body = Buffer.from(`${repaired.slice(1).join("\n")}\n`);
    const bytes = compressed
        ? Buffer.concat([zstdCompressSync(header), zstdCompressSync(body)])
        : Buffer.concat([header, body]);
    const temporary = `${file}.repair-${process.pid}`;
    await writeFile(temporary, bytes, { flag: "wx", mode: stat.mode & 0o777 });
    await rename(temporary, file);
}
console.log(JSON.stringify({ changed, applied: args.includes("--apply"), sha256 }));
