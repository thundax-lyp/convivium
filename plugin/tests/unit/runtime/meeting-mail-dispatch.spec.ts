import { describe, expect, it, vi } from "vitest";
import { scanMeetingMailTimeouts } from "../../../src/runtime/services/meeting-dispatch-service.js";
import type { MeetingRepositoryRuntime } from "../../../src/runtime/meeting-runtime.js";
import { RepositoryError } from "../../../src/repository/index.js";

describe("meeting mail recovery dispatch", () => {
    it("commits timed_out before best-effort interrupt", async () => {
        const finish = vi.fn().mockResolvedValue(undefined);
        const interrupt = vi.fn(() => {
            throw new Error("session already stopped");
        });
        const repository = {
            listOverduePrivateMeetingMail: vi.fn().mockResolvedValue([
                {
                    mailId: "mail-1",
                    handlingAttemptId: "attempt-1",
                    recipientParticipantId: "p1",
                    deliveryId: "delivery-1",
                    deadlineAt: 10
                }
            ]),
            read: vi.fn().mockResolvedValue({ version: 3 }),
            finishPrivateMeetingMail: finish,
            recover: vi.fn().mockResolvedValue({
                sessionOwnership: [
                    {
                        role: "participant",
                        participantId: "p1",
                        parentSessionId: "parent-1",
                        sessionId: "child-1"
                    }
                ]
            })
        } as unknown as MeetingRepositoryRuntime;
        const count = await scanMeetingMailTimeouts({
            repository,
            parent: { id: "parent-1" } as never,
            continuable: { interrupt } as never,
            now: 10
        });
        expect(count).toBe(1);
        expect(finish).toHaveBeenCalledWith(
            expect.objectContaining({ status: "timed_out", mailId: "mail-1", now: 10 })
        );
        expect(interrupt).toHaveBeenCalledWith("child-1", expect.anything());
    });

    it("does not let a stale timeout overwrite a finished mail", async () => {
        const repository = {
            listOverduePrivateMeetingMail: vi.fn().mockResolvedValue([
                {
                    mailId: "mail-1",
                    handlingAttemptId: "attempt-1",
                    recipientParticipantId: "p1",
                    deliveryId: "delivery-1",
                    deadlineAt: 10
                }
            ]),
            read: vi.fn().mockResolvedValue({ version: 4 }),
            finishPrivateMeetingMail: vi
                .fn()
                .mockRejectedValue(
                    new RepositoryError("INVALID_STATE", false, "meeting-1", "stale")
                ),
            recover: vi.fn()
        } as unknown as MeetingRepositoryRuntime;
        await expect(
            scanMeetingMailTimeouts({
                repository,
                parent: { id: "parent-1" } as never,
                continuable: {} as never,
                now: 10
            })
        ).resolves.toBe(0);
        expect(repository.recover).not.toHaveBeenCalled();
    });
});
