import type { Agent } from "@deepseek-ai/dsh-agent";
import type { OutboxItem } from "../../repository/types.js";
import type { OutboxWorkerRepository } from "../outbox-worker.js";

/**
 * The application service owns command ordering. Runtime services own the
 * operational resources used by those commands.
 */
export interface MeetingDeliveryWorkerService {
    ensure(input: {
        readonly meetingId: string;
        readonly repository: OutboxWorkerRepository;
        readonly parent?: Agent;
        readonly dispatch: (item: OutboxItem, signal: AbortSignal) => Promise<void>;
        readonly scan?: (now: number) => Promise<void>;
        readonly onTerminalFailure?: (
            item: OutboxItem,
            errorCode: string,
            failedAt: number
        ) => Promise<void>;
    }): void;
    wake(meetingId: string): void;
    dispose(): Promise<void>;
}
