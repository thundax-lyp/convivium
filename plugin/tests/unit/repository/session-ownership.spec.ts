import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
    MeetingRepository,
    RepositoryError,
    type RepositoryAuthorizationValidator,
    type SessionOwnershipInput
} from "../../../src/repository/index.js";

const roots: string[] = [];
const authorizationValidator: RepositoryAuthorizationValidator = {
    validateCreate: () => undefined,
    validateCommand: () => undefined
};

async function openRepository(): Promise<MeetingRepository> {
    const root = await mkdtemp(join(tmpdir(), "convivium-ownership-"));
    roots.push(root);
    const repository = await MeetingRepository.open({
        databasePath: join(root, "meeting.sqlite"),
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator
    });
    await repository.create({
        requestId: "create-1",
        authorization: { callerBinding: "captain-1", capabilityId: "captain-capability" },
        requestHash: "create-hash",
        initialState: { status: "created" }
    });
    return repository;
}

function ownership(overrides: Partial<SessionOwnershipInput> = {}): SessionOwnershipInput {
    return {
        sessionId: "session-1",
        parentSessionId: "captain-session-1",
        sessionLabel: "convivium:meeting-manager:team-1:meeting-1",
        provider: "continuable-provider",
        role: "manager",
        lifecycleStatus: "provisioning",
        capabilityStatus: "active",
        ...overrides
    };
}

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("session ownership", () => {
    it("persists immutable parent/provider and permits one initial-message write", async () => {
        const repository = await openRepository();
        await expect(repository.recordSessionOwnership(ownership())).resolves.toMatchObject({
            parentSessionId: "captain-session-1",
            provider: "continuable-provider",
            lifecycleStatus: "provisioning"
        });

        await expect(
            repository.recordSessionOwnership(
                ownership({ lifecycleStatus: "active", initialMessageId: "message-1" })
            )
        ).resolves.toMatchObject({ initialMessageId: "message-1", lifecycleStatus: "active" });
        await expect(
            repository.recordSessionOwnership(
                ownership({ lifecycleStatus: "closed", capabilityStatus: "revoked" })
            )
        ).resolves.toMatchObject({ initialMessageId: "message-1", lifecycleStatus: "closed" });

        await expect(
            repository.recordSessionOwnership(
                ownership({
                    lifecycleStatus: "closed",
                    capabilityStatus: "revoked",
                    initialMessageId: "message-2"
                })
            )
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
        await repository.close();
    });

    it("rejects immutable ownership rewrites and active sessions without an initial message", async () => {
        const repository = await openRepository();
        await repository.recordSessionOwnership(ownership());

        await expect(
            repository.recordSessionOwnership(ownership({ parentSessionId: "other-captain" }))
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
        await expect(
            repository.recordSessionOwnership(ownership({ provider: "other-provider" }))
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
        await expect(
            repository.recordSessionOwnership(ownership({ lifecycleStatus: "active" }))
        ).rejects.toMatchObject<RepositoryError>({ code: "INVALID_STATE" });
        await repository.close();
    });
});
