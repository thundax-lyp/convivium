import type { MeetingState } from "@/domain/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";
import type { CommandAuthorization, RepositoryCommand } from "@/repository/types.js";

export interface MeetingCommandApplicationV1 {
    execute<T>(command: RepositoryCommand<T, MeetingState>): Promise<unknown>;
}

export function createMeetingCommandApplicationV1(
    repository: MeetingRepositoryPort<MeetingState>
): MeetingCommandApplicationV1 {
    return { execute: (command) => repository.execute(command) };
}

export type { CommandAuthorization };
