import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    inspectOwnedSessions,
    type ContinuableInspectionRuntime,
    type OwnedSessionInspection
} from "../dsh/index.js";
import type { MeetingRepository, RecoveryResult } from "../repository/index.js";

export interface MeetingRecoveryDependencies {
    readonly repository: Pick<MeetingRepository, "recover">;
    readonly inspection?: ContinuableInspectionRuntime;
    readonly parent?: Agent;
    readonly signal: AbortSignal;
    readonly now?: () => number;
}

export interface MeetingRecoveryResult extends RecoveryResult {
    readonly parentStatus: "bound" | "absent";
    readonly ownershipInspection?: OwnedSessionInspection;
}

export async function recoverMeetingRuntime(
    dependencies: MeetingRecoveryDependencies
): Promise<MeetingRecoveryResult> {
    const recovered = await dependencies.repository.recover({ now: dependencies.now?.() });
    if (dependencies.parent === undefined || dependencies.inspection === undefined) {
        return { ...recovered, parentStatus: "absent" };
    }
    if (recovered.snapshot === undefined) {
        return { ...recovered, parentStatus: "absent" };
    }
    const ownershipInspection = await inspectOwnedSessions({
        runtime: dependencies.inspection,
        parentSessionId: dependencies.parent.id,
        meetingId: recovered.snapshot.meetingId,
        ownerships: recovered.sessionOwnership,
        signal: dependencies.signal
    });
    return { ...recovered, parentStatus: "bound", ownershipInspection };
}
