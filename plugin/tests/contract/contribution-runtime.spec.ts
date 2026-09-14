import { describe, expect, it, vi } from "vitest";
import { createMeetingContributionApplication } from "@/runtime/application-service/meeting-contribution.js";
import { DomainMeetingRepository } from "@/repository/domain/domain-meeting-repository.js";
import { JsonObjectSchema } from "@/repository/domain/schemas.js";
import { loadProjection } from "@/repository/domain/projection.js";
import { createContributionState } from "@/domain/index.js";
import { contributionMeeting, contributionNow as now } from "../fixtures/contribution.js";
import {
    createFakeCatalogDomain,
    createFakeMeetingDomain,
    createFakeDomainFacility
} from "../fixtures/domain-storage.js";
import type { ContributionCommandV1 } from "@/protocol/index.js";

async function fixture() {
    const domain = createFakeMeetingDomain();
    const authorizationValidator = { validateCreate() {}, validateCommand() {} };
    const repository = await DomainMeetingRepository.open({
        catalogDomain: createFakeCatalogDomain(),
        meetingDomain: domain,
        meetingId: "meeting-1",
        teamId: "team-1",
        authorizationValidator,
        now: () => now
    });
    const state = contributionMeeting();
    delete state.termination;
    state.contributions = createContributionState("participant-2", now);
    state.meetingTasks = [];
    const create = {
        requestId: "create",
        requestHash: "create",
        authorization: { callerBinding: "captain:captain-1", capabilityId: "captain:captain-1" },
        initialState: JsonObjectSchema.parse(state)
    };
    await repository.create(create);
    await repository.completeCreate(create);
    for (const [sessionId, role, participantId] of [
        ["manager-1", "manager", undefined],
        ["author-1", "participant", "participant-1"],
        ["reviewer-1", "participant", "participant-2"]
    ] as const) {
        await repository.recordSessionOwnership(
            {
                sessionId,
                role,
                ...(participantId === undefined ? {} : { participantId }),
                parentSessionId: "captain-1",
                sessionLabel: sessionId,
                provider: "fixture",
                lifecycleStatus: "active",
                capabilityStatus: "active"
            },
            now
        );
    }
    const wake = vi.fn();
    const application = createMeetingContributionApplication({
        options: {
            storageDomain: createFakeDomainFacility(),
            provider: "fixture",
            authorizationValidator,
            now: () => now,
            continuable: {
                startContinuable: vi.fn(),
                sendMessage: vi.fn(),
                listDescendants: vi.fn()
            }
        },
        meetings: new Map([
            ["meeting-1", { captainSessionId: "captain-1", teamId: "team-1", repository }]
        ]),
        recovery: { rehydrate: async () => undefined },
        deliveryWorkers: { ensure() {}, wake, async dispose() {} }
    });
    const manager = { kind: "manager" as const, sessionId: "manager-1", meetingId: "meeting-1" };
    const author = {
        kind: "participant" as const,
        sessionId: "author-1",
        meetingId: "meeting-1",
        participantId: "participant-1"
    };
    const signal = new AbortController().signal;
    const assign = (version: number): ContributionCommandV1 => ({
        protocolVersion: 1,
        meetingId: "meeting-1",
        requestId: "assign-1",
        expectedMeetingVersion: version,
        action: "assign",
        participantId: "participant-1",
        agendaItemId: "agenda-1",
        instruction: "Research evidence",
        targetIds: [],
        requiredForCompletion: false,
        requiresEvidenceReview: false
    });
    return { application, repository, domain, wake, manager, author, signal, assign };
}

describe("contribution application transactions", () => {
    it("commits assignment and dispatch together, replays receipts, rejects CAS and mismatched caller without side effects", async () => {
        const f = await fixture();
        try {
            const initial = await f.repository.read();
            const command = f.assign(initial.version);
            const result = await f.application.applyContribution(command, f.manager, f.signal);
            expect(result).toMatchObject({
                ok: true,
                meetingVersion: initial.version + 1,
                result: { generation: 1, phase: "preparing" }
            });
            const committed = loadProjection({ domain: f.domain });
            expect(Object.values(committed.outbox)).toHaveLength(1);
            expect(Object.values(committed.outbox)[0]).toMatchObject({
                payload: {
                    role: "contribution",
                    purpose: "prepare",
                    generation: 1,
                    draftRevision: 0,
                    contextThroughSeq: 0
                }
            });
            expect(await f.application.applyContribution(command, f.manager, f.signal)).toEqual(
                result
            );
            expect(loadProjection({ domain: f.domain })).toEqual(committed);
            expect(
                await f.application.applyContribution(
                    { ...command, instruction: "different" },
                    f.manager,
                    f.signal
                )
            ).toMatchObject({ ok: false, code: "IDEMPOTENCY_CONFLICT" });
            expect(
                await f.application.applyContribution(
                    { ...command, requestId: "new" },
                    f.manager,
                    f.signal
                )
            ).toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
            expect(
                await f.application.applyContribution(
                    command,
                    { ...f.manager, sessionId: "forged" },
                    f.signal
                )
            ).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
            expect(
                await f.application.applyContribution(
                    command,
                    { ...f.author, participantId: "participant-2" },
                    f.signal
                )
            ).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
            expect(loadProjection({ domain: f.domain })).toEqual(committed);
        } finally {
            await f.repository.close();
        }
    });

    it("keeps aborted and failed commands out of state, events, receipts and outbox; reads only the bound task", async () => {
        const f = await fixture();
        try {
            const version = (await f.repository.read()).version;
            const before = loadProjection({ domain: f.domain });
            const aborted = AbortSignal.abort(new Error("cancelled"));
            expect(
                await f.application.applyContribution(f.assign(version), f.manager, aborted)
            ).toMatchObject({ ok: false });
            f.domain.failNextPut("commits", "*");
            expect(
                await f.application.applyContribution(f.assign(version), f.manager, f.signal)
            ).toMatchObject({ ok: false });
            expect(f.wake).not.toHaveBeenCalled();
            expect(loadProjection({ domain: f.domain })).toEqual(before);
            const result = await f.application.applyContribution(
                f.assign(version),
                f.manager,
                f.signal
            );
            if (!result.ok || !("contributionId" in result.result))
                throw new Error("Assignment failed");
            const input = {
                protocolVersion: 1 as const,
                meetingId: "meeting-1",
                contributionId: result.result.contributionId
            };
            const committed = loadProjection({ domain: f.domain });
            expect(await f.application.readContribution(input, f.author, f.signal)).toMatchObject({
                ok: true,
                result: { drafts: [], boundaryReviews: [], evidenceReviews: [] }
            });
            expect(
                await f.application.readContribution(
                    input,
                    {
                        kind: "participant",
                        sessionId: "reviewer-1",
                        meetingId: "meeting-1",
                        participantId: "participant-2"
                    },
                    f.signal
                )
            ).toMatchObject({ ok: false, code: "UNAUTHORIZED_CALLER" });
            expect(await f.application.readLocalContribution(input, f.signal)).toMatchObject({
                ok: true
            });
            expect(loadProjection({ domain: f.domain })).toEqual(committed);
        } finally {
            await f.repository.close();
        }
    });
});
