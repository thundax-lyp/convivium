import type { ResolvedMeetingCaller } from "@/dsh/index.ts";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { expect, it, vi } from "vitest";
import { registerMeetingTools } from "@/tools/index.ts";
import { projectMeetingView } from "@/projection/index.ts";
import { makeRunningMeetingStateV1 } from "../../fixtures/meeting-state.ts";
import { peerBindings } from "../../fixtures/peer-ownership.ts";

it.each([
    "success",
    "closed",
    "responded",
    "unauthorized",
    "persistent",
    "unknown",
    "paused",
    "other-binding",
    "denied"
])("recovers a rejected hand raise with a bounded fresh read: %s", async (scenario) => {
    const state = makeRunningMeetingStateV1();
    const identity = state.identities.find((i) => i.roles.includes("contributor"))!;
    const owner = peerBindings(state.id, state.identities).initialOwnership.find(
        (o) => o.identityId === identity.id
    )!;
    const view = projectMeetingView(
        { state, meetingId: state.id, version: state.version, createdAt: 0, updatedAt: 0 },
        { kind: "captain" }
    );
    // A current open invitation is sufficient; the command application owns domain validation.
    const roundId = "round-conflict";
    view.rounds = [
        {
            id: roundId,
            status: "open",
            participationResponses: [],
            agendaId: state.agenda[0]!.id,
            planId: "plan-conflict",
            roundGoal: { question: "Question", evidenceGap: "Gap", expectedOutput: "Evidence" },
            baselinePublicationIds: [],
            openedAt: 1,
            invitedContributorIds: [identity.id],
            pendingHandRaises: [],
            contributions: []
        }
    ];
    if (scenario === "paused") {
        view.lifecycle.status = "paused";
    }
    if (scenario === "closed") {
        view.rounds[0]!.status = "published";
    }
    if (scenario === "responded") {
        view.rounds[0]!.participationResponses = [
            { contributorId: identity.id, status: "raised", recordedAt: 1 }
        ];
    }
    const conflict = {
        kind: "rejected" as const,
        error: { code: "VERSION_CONFLICT" as const, message: "stale" }
    };
    const accepted = {
        kind: "accepted" as const,
        meetingId: state.id,
        committedVersion: state.version + 2,
        receiptId: "receipt-raise",
        factIds: [],
        effects: []
    };
    const denied = {
        kind: "rejected" as const,
        error: { code: "UNAUTHORIZED" as const, message: "denied" }
    };
    const execute = vi.fn(
        async (
            ..._args: Parameters<import("@/runtime/index.ts").MeetingCommandApplication["execute"]>
        ): Promise<import("@/protocol/index.ts").MeetingCommandResult> => conflict
    );
    if (scenario === "denied") {
        execute.mockResolvedValue(denied);
    }
    if (scenario === "success") {
        execute.mockResolvedValueOnce(conflict).mockResolvedValue(accepted);
    }
    if (scenario === "unknown") {
        execute.mockRejectedValue(new Error("unknown outcome"));
    }
    let reads = 0;
    const read = vi.fn(async () => ({ ...view, version: state.version + ++reads }));
    const caller = {
        caller: {
            channel: "dsh_tool" as const,
            principalId: identity.id,
            sessionBindingId: owner.id
        },
        meetingId: state.id,
        identityId: identity.id,
        role: "participant" as const,
        ownership: owner
    };
    const resolve = vi.fn(async (): Promise<ResolvedMeetingCaller | undefined> => caller);
    if (scenario === "other-binding") {
        resolve
            .mockResolvedValueOnce(caller)
            .mockResolvedValue({ ...caller, ownership: { ...owner, id: "other" } });
    }
    if (scenario === "unauthorized") {
        resolve.mockResolvedValueOnce(caller).mockResolvedValue(undefined);
    }
    const definitions: ToolDefinition[] = [];
    registerMeetingTools({
        registry: {
            register: (d) => {
                definitions.push(d);
                return () => {};
            }
        },
        application: { execute },
        reader: { read },
        callers: { resolve },
        reviewWorkers: { start: vi.fn() },
        reviewPrompts: { resolve: vi.fn() }
    });
    const tool = definitions.find((d) => d.name === "convivium_raise_hand")!;
    const args = {
        protocolVersion: 1,
        meetingId: state.id,
        expectedMeetingVersion: state.version,
        requestId: "raise-intent",
        action: { kind: "raise_hand", roundId, purpose: "bounded evidence" }
    };
    const run = tool.execute(args, {
        agent: { id: owner.sessionId } as Agent,
        signal: new AbortController().signal
    } as ToolRunContext);
    if (scenario === "unknown") {
        await expect(run).rejects.toThrow("unknown outcome");
        expect(read).not.toHaveBeenCalled();
    } else {
        const result = await run;
        if (scenario === "denied") {
            expect(read).not.toHaveBeenCalled();
        }
        if (scenario === "success") {
            expect(result).toEqual(accepted);
        }
        expect(execute).toHaveBeenCalledTimes(
            scenario === "persistent" ? 3 : scenario === "success" ? 2 : 1
        );
        if (scenario === "success") {
            expect(execute.mock.calls[1]![0]).toMatchObject({
                ...args,
                expectedMeetingVersion: state.version + 1
            });
            expect(resolve).toHaveBeenCalledTimes(2);
        }
    }
});
