import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ResolvedMeetingCaller } from "@/dsh/index.ts";
import type { MeetingCommand, MeetingCommandResult } from "@/protocol/index.ts";
import type { MeetingCommandToolDependencies } from "./register-tools.ts";

// Only an explicit rejection is safe to retry. Never replay a failed/unknown transport outcome.
export const executeHandRaise = async (
    dependencies: MeetingCommandToolDependencies,
    command: MeetingCommand,
    initialCaller: ResolvedMeetingCaller,
    agent: Agent,
    signal: AbortSignal
): Promise<MeetingCommandResult> => {
    let current = command;
    let caller = initialCaller;
    for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        const result = await dependencies.application.execute(
            current,
            {
                caller: {
                    channel: "dsh_tool",
                    principalId: caller.identityId,
                    sessionBindingId: caller.ownership.id
                }
            },
            signal
        );
        if (
            result.kind !== "rejected" ||
            result.error.code !== "VERSION_CONFLICT" ||
            attempt === 2 ||
            command.action.kind !== "raise_hand"
        ) {
            return result;
        }
        const refreshed = await dependencies.callers.resolve(agent, signal);
        if (
            !refreshed ||
            refreshed.meetingId !== command.meetingId ||
            refreshed.identityId !== initialCaller.identityId ||
            refreshed.ownership.id !== initialCaller.ownership.id
        ) {
            return {
                kind: "rejected",
                error: {
                    code: "UNAUTHORIZED",
                    message: "The hand-raise caller is no longer active."
                }
            };
        }
        const view = await dependencies.reader.read(
            { protocolVersion: 1, meetingId: command.meetingId },
            refreshed,
            signal
        );
        const roundId = command.action.roundId;
        const round = view?.rounds.find((r) => r.id === roundId);
        if (
            !view ||
            view.lifecycle.status !== "running" ||
            round?.status !== "open" ||
            round.participationResponses.some((r) => r.contributorId === refreshed.identityId)
        ) {
            return result;
        }
        caller = refreshed;
        // Same intent/requestId: only the rejected optimistic version changes.
        current = { ...command, expectedMeetingVersion: view.version };
    }
};
