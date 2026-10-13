import {
    same,
    ownershipInput,
    matchesPendingAdmission,
    validateDescriptor,
    isOwnershipUpdateAllowed
} from "./session-ownership-validation.ts";
import type { PreparedDescriptor } from "@/role-composition/index.ts";
import {
    SessionOwnershipSchema,
    PreparedDescriptorSchema,
    PersistenceProjectionSchema
} from "@/repository/storage-domain/format/index.ts";
import type { JsonObject, SessionOwnership, SessionOwnershipInput } from "@/repository/index.ts";
import { RepositoryError } from "@/repository/index.ts";
import { MeetingPersistenceState } from "./meeting-persistence-state.ts";

export class MeetingOwnership<TState = JsonObject> {
    constructor(private readonly state: MeetingPersistenceState<TState>) {}
    async recordSessionOwnership(
        input: SessionOwnershipInput,
        suppliedNow?: number,
        descriptor?: PreparedDescriptor
    ): Promise<SessionOwnership> {
        this.state.ensureOpen();
        return this.state.enqueueMutation(async () => {
            const now = suppliedNow ?? this.state.now();
            const parsed = SessionOwnershipSchema.safeParse({
                ...input,
                createdAt: now,
                updatedAt: now
            });
            if (!parsed.success || input.meetingId !== this.state.meetingId) {
                throw new RepositoryError(
                    "INVALID_INPUT",
                    false,
                    this.state.meetingId,
                    "Invalid peer ownership."
                );
            }
            const creation = this.state.meetingDomain.table("creation").get("current");
            if (!creation) {
                throw new RepositoryError(
                    "CORRUPT_DATABASE",
                    false,
                    this.state.meetingId,
                    "Missing creation record."
                );
            }
            const source = this.state.projection ?? creation;
            const existing = source.sessionOwnership[input.sessionId];
            const proof = source.preparedDescriptors.find(
                (d) => d.descriptorId === input.descriptorId
            );
            const admissionMatches =
                creation.status === "ready" &&
                matchesPendingAdmission(this.state.projection?.snapshot?.state, input);
            if (existing) {
                const previous = ownershipInput(existing);
                if (!isOwnershipUpdateAllowed(previous, input, descriptor, proof)) {
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        this.state.meetingId,
                        "Peer ownership is immutable and cannot move backward."
                    );
                }
                if (same(previous, input)) {
                    return structuredClone(existing);
                }
                if (
                    input.lifecycleStatus === "active" &&
                    previous.lifecycleStatus === "provisioning" &&
                    (!proof ||
                        now >= proof.expiresAt ||
                        creation.status === "creation_failed" ||
                        (input.admissionId !== undefined && !admissionMatches) ||
                        input.capabilityStatus !== "active")
                ) {
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        this.state.meetingId,
                        "Peer preflight expired or activation was revoked."
                    );
                }
            } else {
                if (
                    creation.status !== "ready" ||
                    input.lifecycleStatus !== "provisioning" ||
                    input.capabilityStatus !== "active" ||
                    !input.admissionId ||
                    !descriptor ||
                    !validateDescriptor(input, descriptor) ||
                    now >= descriptor.expiresAt ||
                    !admissionMatches ||
                    Object.values(source.sessionOwnership).some(
                        (o) => o.id === input.id || o.identityId === input.identityId
                    )
                ) {
                    throw new RepositoryError(
                        "INVALID_STATE",
                        false,
                        this.state.meetingId,
                        "Peer admission does not match a pending intent."
                    );
                }
            }
            const ownership = { ...input, createdAt: existing?.createdAt ?? now, updatedAt: now };
            const descriptors = existing
                ? source.preparedDescriptors
                : [...source.preparedDescriptors, PreparedDescriptorSchema.parse(descriptor)];
            if (!this.state.projection) {
                await this.state.meetingDomain.table("creation").put("current", {
                    ...creation,
                    sessionOwnership: {
                        ...creation.sessionOwnership,
                        [input.sessionId]: ownership
                    },
                    preparedDescriptors: descriptors,
                    updatedAt: now
                });
                return ownership;
            }
            return this.state.commit({
                operation: "session.ownership",
                now,
                mutate: (current) => ({
                    next: PersistenceProjectionSchema.parse({
                        ...current,
                        sessionOwnership: {
                            ...current.sessionOwnership,
                            [input.sessionId]: ownership
                        },
                        preparedDescriptors: descriptors
                    }),
                    result: ownership
                })
            });
        });
    }
}
