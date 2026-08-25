#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const usage = `Usage:
  collect-review-context.mjs context [--base <ref>]
  collect-review-context.mjs snapshot [--base <ref>]
  collect-review-context.mjs diff [--base <ref>] [--module <name> ... | --path <path> ...]`;

const runGit = (root, args, binary = false) => {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: binary ? null : "utf8",
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error.stderr?.toString("utf8").trim();
    throw new Error(detail || `git ${args.join(" ")} failed`);
  }
};

const findRoot = () => resolve(runGit(process.cwd(), ["rev-parse", "--show-toplevel"]).trim());

const parseArgs = (args) => {
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    process.exit(0);
  }
  const command = args[0];
  if (!["context", "snapshot", "diff"].includes(command)) throw new Error(`unknown command: ${command}`);
  const result = { command, base: "main", modules: [], paths: [] };
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!["--base", "--module", "--path"].includes(flag) || !value || value.startsWith("-")) {
      throw new Error(`invalid argument near ${flag ?? "<end>"}`);
    }
    if (flag === "--base") result.base = value;
    if (flag === "--module") result.modules.push(value);
    if (flag === "--path") result.paths.push(value);
  }
  if (result.modules.length && result.paths.length) throw new Error("--module and --path cannot be combined");
  if (command !== "diff" && (result.modules.length || result.paths.length)) throw new Error("filters are only valid for diff");
  return result;
};

const getBase = (root, base) => ({
  baseRef: base,
  baseSha: runGit(root, ["rev-parse", "--verify", `${base}^{commit}`]).trim(),
  mergeBase: runGit(root, ["merge-base", base, "HEAD"]).trim(),
});

const moduleForPath = (rawPath) => {
  const parts = rawPath.split("/").filter(Boolean);
  const top = parts[0];
  if ([".github", ".agents", "AGENTS.md", "TODO.md", "README.md"].includes(top)) return "repo-governance";
  if (top === "docs") return "docs";
  if (top !== "plugin") return "other";
  if (parts[1] === "src") {
    const map = {
      domain: "plugin:domain",
      runtime: "plugin:runtime",
      repository: "plugin:repository",
      dsh: "plugin:dsh",
      protocol: "plugin:transport",
      http: "plugin:transport",
      tools: "plugin:transport",
      projection: "plugin:projection",
      client: "plugin:client",
    };
    return map[parts[2]] ?? "plugin:other";
  }
  if (parts[1] === "tests") return "plugin:tests";
  if (parts[1] === "scripts") return "plugin:scripts";
  return "plugin:package";
};

const changedFiles = (root, base) => {
  const fields = runGit(root, ["diff", "--name-status", "-z", "--find-renames", `${base}...HEAD`], true)
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const files = [];
  for (let index = 0; index < fields.length;) {
    const token = fields[index++];
    const status = token[0];
    const oldPath = ["R", "C"].includes(status) ? fields[index++] : undefined;
    const path = fields[index++];
    if (!path) throw new Error("truncated changed-file output");
    files.push({ status, path, module: moduleForPath(path), ...(oldPath ? { oldPath } : {}) });
  }
  return files;
};

const worktree = (root) => runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));

const commitList = (root, mergeBase) => {
  const fields = runGit(root, ["log", "--reverse", "--format=%H%x00%s%x00", `${mergeBase}..HEAD`])
    .split("\0")
    .filter(Boolean);
  const commits = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    commits.push({ sha: fields[index], subject: fields[index + 1] });
  }
  return commits;
};

const getDiff = (root, base, options) => {
  let paths = [];
  if (options.paths.length) paths = options.paths;
  if (options.modules.length) paths = changedFiles(root, base)
    .filter((file) => options.modules.includes(file.module))
    .map((file) => file.path);
  if (options.modules.length && paths.length === 0) return "";
  return runGit(root, ["diff", "--no-ext-diff", "--find-renames", `${base}...HEAD`, "--", ...paths]);
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const main = () => {
  try {
    const options = parseArgs(process.argv.slice(2));
    const root = findRoot();
    const base = getBase(root, options.base);
    const files = changedFiles(root, options.base);
    const diff = getDiff(root, options.base, options);
    if (options.command === "diff") {
      process.stdout.write(diff);
      return;
    }
    const common = {
      repository: root,
      head: runGit(root, ["rev-parse", "HEAD"]).trim(),
      ...base,
      diffHash: sha256(diff),
      changedFiles: files,
    };
    if (options.command === "snapshot") {
      console.log(JSON.stringify(common, null, 2));
      return;
    }
    console.log(JSON.stringify({
      ...common,
      worktree: worktree(root),
      commits: commitList(root, base.mergeBase),
      diffStat: runGit(root, ["diff", "--stat", `${options.base}...HEAD`]),
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
};

main();
