#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const readStdin = async () => {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
};

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const patchFiles = (patch) => {
  const files = [];
  let activeFile;

  for (const line of patch.split("\n")) {
    const fileMatch = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/);
    if (fileMatch) {
      if (activeFile) files.push(activeFile);
      activeFile = fileMatch[1].trim();
      continue;
    }

    const moveMatch = line.match(/^\*\*\* Move to: (.+)$/);
    if (moveMatch && activeFile) {
      activeFile = moveMatch[1].trim();
      continue;
    }

    if (line.startsWith("*** ") && activeFile) {
      files.push(activeFile);
      activeFile = undefined;
    }
  }

  if (activeFile) files.push(activeFile);
  return [...new Set(files)];
};

const repositoryPath = (file, cwd) => {
  const absolute = file.startsWith("/")
    ? resolve(file)
    : resolve(file.startsWith("plugin/") || file.startsWith(".codex/") ? repositoryRoot : cwd, file);
  const path = relative(repositoryRoot, absolute);
  return path.startsWith("..") ? null : path;
};

const formatterFiles = (input) => {
  const data = JSON.parse(input);
  const toolInput = data?.tool_input;
  const patch = typeof toolInput === "string" ? toolInput : toolInput?.command ?? "";
  const cwd = data?.cwd ?? process.cwd();

  return patchFiles(patch)
    .map((file) => repositoryPath(file, cwd))
    .filter((file) => file && file.startsWith("plugin/"))
    .filter((file) => [".ts", ".tsx"].includes(extname(file)))
    .map((file) => resolve(repositoryRoot, file));
};

const configuredFormatter = () => {
  const packagePath = resolve(repositoryRoot, "plugin/package.json");
  if (!existsSync(packagePath)) return null;
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const prettierVersion = packageJson.devDependencies?.prettier ?? packageJson.dependencies?.prettier;
  return typeof prettierVersion === "string" && prettierVersion.trim() ? prettierVersion : null;
};

const emit = (payload) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const main = async () => {
  const files = formatterFiles(await readStdin());
  if (files.length === 0) {
    emit({ continue: true });
    return;
  }

  const prettierVersion = configuredFormatter();
  if (!prettierVersion) {
    emit({
      continue: true,
      systemMessage: "Skipped Convivium plugin formatting because Prettier is not configured in plugin/package.json.",
    });
    return;
  }

  try {
    execFileSync("pnpm", ["exec", "prettier", "--write", ...files.map((file) => relative(resolve(repositoryRoot, "plugin"), file))], {
      cwd: resolve(repositoryRoot, "plugin"),
      stdio: ["ignore", "pipe", "inherit"],
    });
    emit({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Prettier formatted ${files.length} modified Convivium plugin file(s).`,
      },
    });
  } catch (error) {
    const reason = `Convivium plugin formatting failed: ${error.message}`;
    emit({ decision: "block", reason });
    console.error(reason);
    process.exitCode = 2;
  }
};

main().catch((error) => {
  const reason = `Convivium format hook failed: ${error.message}`;
  emit({ decision: "block", reason });
  console.error(reason);
  process.exitCode = 2;
});
