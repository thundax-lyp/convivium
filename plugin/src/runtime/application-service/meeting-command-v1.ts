import type { MeetingCommandRepositoryPortV1 } from "@/repository/meeting-command-repository-v1.js";
import type { CommandAuthorization, RepositoryCommand } from "@/repository/types.js";

export interface MeetingCommandApplicationV1 {
    execute<T>(command: RepositoryCommand<T>): Promise<unknown>;
}

export function createMeetingCommandApplicationV1(
    repository: MeetingCommandRepositoryPortV1
): MeetingCommandApplicationV1 {
    return { execute: (command) => repository.execute(command) };
}

export type { CommandAuthorization };
