import { lstat, readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { encodeCanonicalJson, sha256Hex } from "@/repository/domain/canonical-json.js";
import type { EffectiveAgentOptions, MeetingAgentDefinition, ResourceBinding } from "./model.js";
import { definitionHash } from "./resolve.js";

export const readRoleResource = async (packageRoot: string, resource: string): Promise<Buffer> => {
    const root = resolve(packageRoot, "config");
    const target = resolve(root, resource);
    const path = relative(root, target);
    if (!path || path.startsWith(`..${sep}`) || path === ".." || isAbsolute(path))
        throw new Error("Role resource escapes its root.");
    let current = root;
    for (const part of ["", ...path.split(sep)]) {
        current = join(current, part);
        if ((await lstat(current)).isSymbolicLink()) throw new Error("Role resource is a symlink.");
    }
    if (!(await lstat(target)).isFile()) throw new Error("Role resource is not a regular file.");
    return readFile(target);
};

const skillFiles = async (root: string, directory: string, prefix = ""): Promise<string[]> => {
    const files: string[] = [];
    for (const entry of await readdir(join(root, "config", directory, prefix), {
        withFileTypes: true
    })) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new Error("Skill bundle contains a symlink.");
        if (entry.isDirectory()) files.push(...(await skillFiles(root, directory, path)));
        else if (entry.isFile()) files.push(path);
        else throw new Error("Skill bundle contains a non-regular file.");
    }
    return files.sort();
};

export const resolveResourceBinding = async (input: {
    packageRoot: string;
    definition: MeetingAgentDefinition;
    agentOptions: EffectiveAgentOptions;
}): Promise<ResourceBinding> => {
    const { packageRoot, definition, agentOptions } = input;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(definition.dshPresetId))
        throw new Error("Invalid role Preset.");
    const instructions = definition.agentInstructions;
    const identity = await readRoleResource(
        packageRoot,
        `agents/${instructions.roleDefinitionId}/${instructions.version}/AGENTS.md`
    );
    if (sha256Hex(identity) !== instructions.sha256)
        throw new Error("Role identity fingerprint changed.");
    const presetFiles: Array<[string, string]> = [];
    for (const file of ["preset.yml", "agent.cordis.yml"])
        presetFiles.push([
            file,
            sha256Hex(
                await readRoleResource(packageRoot, `presets/${definition.dshPresetId}/${file}`)
            )
        ]);
    const skills: ResourceBinding["skills"] = [];
    for (const name of [...definition.requiredSkillNames].sort()) {
        const directory = `skills/${name}`;
        await readRoleResource(packageRoot, `${directory}/SKILL.md`);
        const files: Array<[string, string]> = [];
        for (const path of await skillFiles(packageRoot, directory))
            files.push([
                path,
                sha256Hex(await readRoleResource(packageRoot, `${directory}/${path}`))
            ]);
        skills.push({ name, sha256: sha256Hex(encodeCanonicalJson(files)) });
    }
    const resources = {
        instructions: { ...instructions },
        presetId: definition.dshPresetId,
        presetSha256: sha256Hex(encodeCanonicalJson(presetFiles)),
        skills
    };
    const compositionHash = sha256Hex(
        encodeCanonicalJson({
            definitionHash: definitionHash(definition),
            ...resources,
            ...(definition.toolFilter === undefined ? {} : { toolFilter: definition.toolFilter }),
            agentOptions
        })
    );
    return { ...resources, compositionHash };
};
