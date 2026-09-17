import type { RepositoryAuthorizationValidator } from "@/repository/types.js";
import { DomainMeetingRepository } from "@/repository/domain/domain-meeting-repository.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "./domain-storage.js";

export const allow: RepositoryAuthorizationValidator = {
    validateCreate: () => undefined,
    validateCommand: () => undefined
};

export async function maintenanceFixture(initialState: Record<string, unknown> = { count: 0 }) {
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: meeting,
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1000
    });
    const authorization = { callerBinding: "captain:1", capabilityId: "capability:1" };
    const input = {
        requestId: "create",
        authorization,
        requestHash: "create-hash",
        initialState,
        createdAt: 1
    };
    await repository.create(input);
    await repository.completeCreate(input);
    return { meeting, repository, authorization };
}

export async function appendVersion(
    repository: DomainMeetingRepository,
    authorization: { callerBinding: string; capabilityId: string },
    expectedMeetingVersion: number
) {
    const nextVersion = expectedMeetingVersion + 1;
    return repository.execute({
        requestId: `command-${nextVersion}`,
        commandKind: "increment",
        authorization,
        requestHash: `hash-${nextVersion}`,
        expectedMeetingVersion,
        transition: () => ({
            state: { count: nextVersion },
            result: { count: nextVersion },
            events: [{ type: "message.added" as const, payload: { count: nextVersion } }],
            outbox: []
        })
    });
}
