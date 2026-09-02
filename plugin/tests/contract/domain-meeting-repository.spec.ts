import { DomainMeetingRepository } from "../../src/repository/domain/domain-meeting-repository.js";
import { createFakeCatalogDomain, createFakeMeetingDomain } from "../fixtures/domain-storage.js";
import { defineMeetingRepositoryBehaviorContract } from "./meeting-repository-behavior.js";
import type { RepositoryAuthorizationValidator } from "../../src/repository/types.js";
import { createCommitRecord, createProjection } from "../../src/repository/domain/projection.js";
import { seqKey } from "../../src/repository/domain/keys.js";
import { expect, it } from "vitest";

const allow: RepositoryAuthorizationValidator = {
    validateCreate: () => undefined,
    validateCommand: () => undefined
};

defineMeetingRepositoryBehaviorContract("DomainMeetingRepository behavior contract", {
    open: async (authorizationValidator = allow) =>
        DomainMeetingRepository.open({
            catalogDomain: createFakeCatalogDomain(),
            meetingDomain: createFakeMeetingDomain(),
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator,
            now: () => 1
        }),
    rejectCorruptedReadyState: async () => {
        const projection = createProjection({
            snapshot: null,
            bootstrap: {
                status: "ready",
                createRequestId: "create",
                requestHash: "hash",
                createdAt: 1,
                updatedAt: 1
            },
            sessionOwnership: {}
        });
        const commit = createCommitRecord({
            formatVersion: 1,
            seq: 1,
            previousSeq: 0,
            previousDigest: null,
            operation: "create.complete",
            patch: [{ op: "set", path: [], value: projection }],
            committedAt: 1
        });
        const badCommit = { ...commit, digest: "0".repeat(64) };
        const readyCreation = {
            formatVersion: 1 as const,
            teamId: "team-1",
            meetingId: "meeting-1",
            status: "ready" as const,
            requestId: "create",
            requestHash: "hash",
            authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
            initialState: {},
            createResult: null,
            initialOutbox: [],
            sessionOwnership: {},
            createdAt: 1,
            updatedAt: 1,
            failureCode: null
        };
        const domain = createFakeMeetingDomain({
            initial: {
                creation: new Map([["current", readyCreation]]),
                commits: new Map([[seqKey(1), badCommit]])
            }
        });
        const catalog = createFakeCatalogDomain();
        const repository = await DomainMeetingRepository.open({
            catalogDomain: catalog,
            meetingDomain: domain,
            teamId: "team-1",
            meetingId: "meeting-1",
            authorizationValidator: allow,
            now: () => 1
        });
        await repository.read();
        throw new Error("corrupt state was accepted");
    }
});

it("rolls back state, events and outbox when a commit put fails", async () => {
    const catalog = createFakeCatalogDomain();
    const meeting = createFakeMeetingDomain();
    const repository = await DomainMeetingRepository.open({
        catalogDomain: catalog,
        meetingDomain: meeting,
        teamId: "team-1",
        meetingId: "meeting-1",
        authorizationValidator: allow,
        now: () => 1
    });
    const input = {
        requestId: "create",
        authorization: { callerBinding: "captain:1", capabilityId: "capability:1" },
        requestHash: "hash",
        initialState: { count: 0 }
    };
    await repository.create(input);
    await repository.completeCreate(input);
    const before = await repository.read();
    meeting.failNextPut("commits", seqKey(2));
    await expect(
        repository.execute({
            requestId: "command",
            commandKind: "increment",
            authorization: input.authorization,
            requestHash: "command-hash",
            expectedMeetingVersion: 0,
            transition: (snapshot) => ({
                state: { ...snapshot.state, count: 1 },
                result: { count: 1 },
                events: [{ type: "message.added" as const, payload: { count: 1 } }],
                outbox: []
            })
        })
    ).rejects.toThrow();
    await expect(repository.read()).resolves.toEqual(before);
    await repository.close();
});
