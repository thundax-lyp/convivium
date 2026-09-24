import {
    readMeetingRoleCatalog,
    type ResolvedMeetingCaller,
    type RoleCatalogPort
} from "@/dsh/index.js";
import { projectMeetingView } from "@/projection/index.js";
import type { ReadMeetingRequest, MeetingReadResult } from "@/protocol/index.js";
import type { MeetingState } from "@/domain/index.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";

export interface MeetingIdentityReaderDependencies {
    readonly registry: {
        openMeeting(input: {
            readonly meetingId: string;
        }): Promise<Pick<MeetingRepositoryPort<MeetingState>, "recover">>;
    };
    readonly catalog?: RoleCatalogPort;
}

export interface MeetingIdentityReader {
    read(
        request: ReadMeetingRequest,
        caller: ResolvedMeetingCaller,
        signal: AbortSignal
    ): Promise<MeetingReadResult | undefined>;
}

const expectedMeetingRole = (
    role: ResolvedMeetingCaller["role"]
): "manager" | "evidence_reviewer" | "contributor" =>
    role === "participant" ? "contributor" : role;

export const createMeetingIdentityReader = (
    dependencies: MeetingIdentityReaderDependencies
): MeetingIdentityReader => ({
    async read(request, caller, signal) {
        signal.throwIfAborted();
        if (
            request.meetingId !== caller.meetingId ||
            caller.ownership.meetingId !== caller.meetingId ||
            caller.ownership.identityId !== caller.identityId ||
            caller.ownership.lifecycleStatus !== "active" ||
            caller.ownership.capabilityStatus !== "active"
        )
            return undefined;
        const repository = await dependencies.registry.openMeeting({
            meetingId: request.meetingId
        });
        const recovered = await repository.recover();
        const snapshot = recovered.snapshot;
        if (snapshot === undefined || snapshot.meetingId !== request.meetingId) return undefined;
        const identity = snapshot.state.identities.find(
            (candidate) => candidate.id === caller.identityId
        );
        if (
            identity === undefined ||
            identity.sessionOwnershipId !== caller.ownership.id ||
            identity.roles.length !== 1 ||
            identity.roles[0] !== expectedMeetingRole(caller.role)
        )
            return undefined;
        const catalog =
            caller.role === "manager" && dependencies.catalog !== undefined
                ? await readMeetingRoleCatalog(
                      dependencies.catalog,
                      request.meetingId,
                      caller.ownership.parentSessionId,
                      caller.ownership.sessionId
                  )
                : undefined;
        return projectMeetingView(
            snapshot,
            {
                kind: "identity",
                identityId: identity.id,
                roles: identity.roles
            },
            catalog?.kind === "available" ? catalog.snapshot : undefined
        );
    }
});
