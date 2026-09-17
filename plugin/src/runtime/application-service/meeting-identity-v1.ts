import type { MeetingState } from "@/domain/index.js";
import type { RoleCatalogPortV1 } from "@/dsh/index.js";
import type { MeetingAgentDefinitionV1 } from "@/role-composition/model.js";
import type { MeetingRepositoryPort } from "@/repository/meeting-repository-port.js";

/** @deprecated Retained only for the pre-T15a identity provisioner. */
export interface VerifiedIdentitySessionScopeV1 {
    teamId: string;
    managerId: string;
    managerSessionId: string;
    captainParentSessionId: string;
    captainParentAgent: unknown;
}
/** @deprecated Retained only for the pre-T15a identity provisioner. */
export interface MeetingIdentityApplicationDepsV1 {
    repository: MeetingRepositoryPort<MeetingState>;
    catalog?: RoleCatalogPortV1;
    definitions: readonly MeetingAgentDefinitionV1[];
    ids: {
        nextId(
            kind: "identity_recommendation" | "meeting_identity" | "fact" | "receipt" | "outbox"
        ): string;
    };
    clock: { now(): number };
    readVerifiedSessionScope(
        meetingId: string
    ): Promise<VerifiedIdentitySessionScopeV1 | undefined>;
}
