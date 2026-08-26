import type { Agent } from "@deepseek-ai/dsh-agent";
import {
    inspectOwnedSessions,
    interruptAndDrainOwnedSessions,
    type ContinuableLifecycleRuntime,
    type ContinuableInspectionRuntime,
    type OwnedSessionInspection
} from "../dsh/index.js";
import { transitionMeeting, type MeetingState } from "../domain/index.js";
import type {
    CommandAuthorization,
    JsonObject,
    MeetingRepository,
    RecoveryResult,
    SessionOwnership
} from "../repository/index.js";

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

export interface PauseRecoveryDependencies {
    readonly repository: Pick<MeetingRepository, "execute" | "recordSessionOwnership">;
    readonly authorization: CommandAuthorization;
    readonly requestId: string;
    readonly expectedMeetingVersion: number;
    readonly reason: string;
    readonly parent?: Agent;
    readonly lifecycle?: ContinuableLifecycleRuntime;
    readonly ownerships: readonly SessionOwnership[];
    readonly signal: AbortSignal;
    readonly now?: () => number;
}

export interface ResumeRecoveryDependencies {
    readonly repository: Pick<MeetingRepository, "execute">;
    readonly authorization: CommandAuthorization;
    readonly requestId: string;
    readonly expectedMeetingVersion: number;
    readonly signal: AbortSignal;
    readonly now?: () => number;
}

export interface CaptainRebindDependencies {
    readonly parent: Agent;
    readonly expectedParentSessionId: string;
    readonly meetingId: string;
    readonly ownerships: RecoveryResult["sessionOwnership"];
    readonly inspection: ContinuableInspectionRuntime;
    readonly signal: AbortSignal;
}

export async function rebindCaptainParent(
    dependencies: CaptainRebindDependencies
): Promise<OwnedSessionInspection> {
    if (String(dependencies.parent.id) !== dependencies.expectedParentSessionId) {
        throw new Error("Captain parent rebind requires the exact persisted parent Session.");
    }
    return inspectOwnedSessions({
        runtime: dependencies.inspection,
        parentSessionId: dependencies.expectedParentSessionId as never,
        meetingId: dependencies.meetingId,
        ownerships: dependencies.ownerships,
        signal: dependencies.signal
    });
}

function ownershipForRevocation(ownership: SessionOwnership): SessionOwnership {
    return { ...ownership, capabilityStatus: "revoked" };
}

export async function pauseMeetingRuntime(
    dependencies: PauseRecoveryDependencies
): Promise<unknown> {
    const now = dependencies.now?.() ?? Date.now();
    const committed = await dependencies.repository.execute({
        requestId: dependencies.requestId,
        commandKind: "pause_meeting",
        authorization: dependencies.authorization,
        requestHash: JSON.stringify({
            requestId: dependencies.requestId,
            expectedMeetingVersion: dependencies.expectedMeetingVersion,
            reason: dependencies.reason
        }),
        expectedMeetingVersion: dependencies.expectedMeetingVersion,
        transition: (snapshot) => {
            const transition = transitionMeeting(
                snapshot.state as unknown as MeetingState,
                "paused",
                {
                    now,
                    reason: dependencies.reason,
                    pause: {
                        at: now,
                        by: { kind: "captain", actorId: dependencies.authorization.callerBinding }
                    }
                }
            );
            return {
                state: transition.state as unknown as JsonObject,
                result: { status: "paused", changed: true },
                events: transition.effect.events as never,
                outbox: []
            };
        }
    });
    const active = dependencies.ownerships.filter(
        (ownership) =>
            ownership.lifecycleStatus === "active" && ownership.capabilityStatus === "active"
    );
    for (const ownership of active) {
        await dependencies.repository.recordSessionOwnership(
            ownershipForRevocation(ownership),
            now
        );
    }
    if (
        dependencies.parent !== undefined &&
        dependencies.lifecycle !== undefined &&
        active.length > 0
    ) {
        await interruptAndDrainOwnedSessions({
            runtime: dependencies.lifecycle,
            parent: dependencies.parent,
            ownerships: active
        });
        for (const ownership of active) {
            await dependencies.repository.recordSessionOwnership(
                { ...ownershipForRevocation(ownership), lifecycleStatus: "closed" },
                now
            );
        }
    }
    return { committed, revokedOwnerships: active.length };
}

export async function resumeMeetingRuntime(
    dependencies: ResumeRecoveryDependencies
): Promise<unknown> {
    const now = dependencies.now?.() ?? Date.now();
    return dependencies.repository.execute({
        requestId: dependencies.requestId,
        commandKind: "resume_meeting",
        authorization: dependencies.authorization,
        requestHash: JSON.stringify({ requestId: dependencies.requestId }),
        expectedMeetingVersion: dependencies.expectedMeetingVersion,
        transition: (snapshot) => {
            const transition = transitionMeeting(
                snapshot.state as unknown as MeetingState,
                "running",
                {
                    now,
                    reason: "captain resumed meeting"
                }
            );
            return {
                state: transition.state as unknown as JsonObject,
                result: { status: "running", changed: true },
                events: transition.effect.events as never,
                outbox: []
            };
        }
    });
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
