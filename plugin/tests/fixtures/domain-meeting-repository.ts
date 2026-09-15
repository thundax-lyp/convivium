import type { RepositoryAuthorizationValidator } from "@/repository/types.js";
import { createCommitRecord, createProjection } from "@/repository/domain/projection.js";
import { seqKey } from "@/repository/domain/keys.js";
import { DomainMeetingRepository } from "@/repository/domain/domain-meeting-repository.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "./domain-storage.js";

export const allow: RepositoryAuthorizationValidator = {
    validateCreate: () => undefined,
    validateCommand: () => undefined
};

export async function openReadyState(state: Record<string, unknown>) {
    const base = createProjection({
        snapshot: {
            teamId: "team-1",
            meetingId: "meeting-1",
            version: 0,
            state: { count: 0 },
            createdAt: 1,
            updatedAt: 1
        },
        bootstrap: {
            status: "ready",
            createRequestId: "create",
            requestHash: "hash",
            createdAt: 1,
            updatedAt: 1
        },
        sessionOwnership: {}
    });
    const projection = { ...base, snapshot: { ...base.snapshot!, state } };
    const commit = createCommitRecord({
        formatVersion: 1,
        seq: 1,
        previousSeq: 0,
        previousDigest: null,
        operation: "create.complete",
        patch: [{ op: "set", path: [], value: projection }],
        committedAt: 1
    });
    const meetingDomain = createFakeMeetingDomain({
        initial: {
            creation: new Map([
                [
                    "current",
                    {
                        formatVersion: 1 as const,
                        teamId: "team-1",
                        meetingId: "meeting-1",
                        status: "ready" as const,
                        requestId: "create",
                        requestHash: "hash",
                        authorization: {
                            callerBinding: "captain:1",
                            capabilityId: "capability:1"
                        },
                        initialState: {},
                        createResult: null,
                        initialOutbox: [],
                        sessionOwnership: {},
                        createdAt: 1,
                        updatedAt: 1,
                        failureCode: null
                    }
                ]
            ]),
            commits: new Map([[seqKey(1), commit]])
        }
    });
    return DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1
    });
}

export async function maintenanceFixture(initialState: Record<string, unknown> = { count: 0 }) {
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: meeting,
        teamId: "team-1",
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
