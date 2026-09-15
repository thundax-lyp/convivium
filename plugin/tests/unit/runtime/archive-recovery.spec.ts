import { recoverArchive, terminationIdentity } from "@/runtime/services/meeting-archive-service.js";
import type { LegacyMeetingState } from "@/domain/model.js";
import type { RepositoryCommand } from "@/repository/types.js";
import { describe, expect, it } from "vitest";

describe("meeting archive recovery", () => {
    it("replays terminal materialization through the termination-derived receipt", async () => {
        const terminal = {
            id: "meeting-1",
            teamId: "team-1",
            status: "completed",
            version: 4,
            termination: {
                code: "objective_satisfied",
                reason: "done",
                decisionIds: [],
                unresolvedQuestionIds: [],
                dissentingPositionIds: [],
                blockingAgendaItemIds: [],
                finalMessage: "done",
                endedAt: 3
            }
        } as LegacyMeetingState;
        let command: RepositoryCommand<{ status: "archiving" }> | undefined;
        await expect(
            recoverArchive({
                repository: {
                    recover: async () => ({
                        snapshot: { state: terminal as never },
                        sessionOwnership: [],
                        bootstrap: {} as never,
                        reclaimedOutbox: 0,
                        pendingOutbox: 0
                    }),
                    execute: async (received) => {
                        command = received;
                        return {
                            requestId: received.requestId,
                            meetingId: terminal.id,
                            meetingVersion: 5,
                            result: { status: "archiving" },
                            eventSeqs: [1]
                        };
                    },
                    recordSessionOwnership: async () => {
                        throw new Error("must not write ownership");
                    }
                },
                signal: new AbortController().signal,
                now: 12
            })
        ).resolves.toBe("begun");
        expect(command).toMatchObject({
            requestId: `internal:archive:${terminationIdentity(terminal)}`,
            commandKind: "internal_archive_begin",
            expectedMeetingVersion: 4
        });
    });

    it("keeps an archiving meeting pending when the Captain runtime is unavailable", async () => {
        await expect(
            recoverArchive({
                repository: {
                    recover: async () => ({
                        snapshot: { state: { status: "archiving" } as never },
                        sessionOwnership: [],
                        bootstrap: {} as never,
                        reclaimedOutbox: 0,
                        pendingOutbox: 0
                    }),
                    execute: async () => {
                        throw new Error("must not execute");
                    },
                    recordSessionOwnership: async () => {
                        throw new Error("must not write ownership");
                    }
                },
                signal: new AbortController().signal,
                now: 12
            })
        ).resolves.toBe("pending");
    });
});
