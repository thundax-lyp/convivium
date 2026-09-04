import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    createDeveloperMarkdownService,
    type DeveloperMarkdownWarning
} from "../../../src/runtime/services/developer-markdown-service.js";
import type { MeetingRepositoryPort } from "../../../src/repository/meeting-repository-port.js";
import type { MeetingSnapshot } from "../../../src/repository/types.js";
import { archivePackage, meeting, now } from "../domain/transitions/fixtures.js";

const roots: string[] = [];

function snapshot(version: number): MeetingSnapshot {
    const state = meeting("running");
    state.version = version;
    state.meetingTasks = [];
    return {
        teamId: state.teamId,
        meetingId: state.id,
        version,
        state,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt
    };
}

function repository(current: MeetingSnapshot): MeetingRepositoryPort {
    return {
        teamId: current.teamId,
        meetingId: current.meetingId,
        read: async () => current
    } as MeetingRepositoryPort;
}

async function workspace(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "convivium-developer-markdown-"));
    roots.push(root);
    return root;
}

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Developer Markdown service", () => {
    it("coalesces versions and atomically writes current and archive files", async () => {
        const root = await workspace();
        const current = snapshot(2);
        current.state.archive = { package: archivePackage() };
        const warnings: DeveloperMarkdownWarning[] = [];
        const service = createDeveloperMarkdownService({
            workspaceRoot: root,
            openRepository: async () => repository(current),
            now: () => now,
            warn: (value) => warnings.push(value)
        });

        service.schedule(current);
        await service.dispose();
        const directory = join(root, ".convivium", "meetings", "dGVhbS0x", "bWVldGluZy0x");
        expect(await readFile(join(directory, "current.md"), "utf8")).toContain(
            "sourceMeetingVersion: 2"
        );
        expect(await readFile(join(directory, "current.md"), "utf8")).toContain(
            `generatedAt: ${JSON.stringify(new Date(now).toISOString())}`
        );
        expect(await readFile(join(directory, "archive.md"), "utf8")).toContain(
            "# Archived Meeting Projection"
        );
        expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
        expect(warnings).toEqual([]);
    });

    it("skips an older task when the repository has a newer version", async () => {
        const root = await workspace();
        const warnings: DeveloperMarkdownWarning[] = [];
        const service = createDeveloperMarkdownService({
            workspaceRoot: root,
            openRepository: async () => repository(snapshot(3)),
            warn: (value) => warnings.push(value)
        });

        service.schedule(snapshot(2));
        await service.dispose();

        await expect(readdir(root, { recursive: true })).resolves.toEqual([]);
        expect(warnings).toEqual([]);
    });

    it("contains workspace and warning failures without throwing", async () => {
        const root = await workspace();
        const warnings: DeveloperMarkdownWarning[] = [];
        const service = createDeveloperMarkdownService({
            workspaceRoot: join(root, "missing-root"),
            openRepository: async () => repository(snapshot(1)),
            warn: (value) => warnings.push(value)
        });

        expect(() => service.schedule(snapshot(1))).not.toThrow();
        await service.dispose();

        expect(warnings[0]).toMatchObject({ operation: "resolve_directory" });
    });
});
