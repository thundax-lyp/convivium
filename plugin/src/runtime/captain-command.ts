import {
    MeetingCommandResultSchema,
    MeetingCommandSchema,
    type CaptainMeetingCommand,
    type MeetingCommand,
    type MeetingCommandResult
} from "@/protocol/index.ts";
import type { MeetingAgentDefinition } from "@/role-composition/index.ts";

export const resolveCaptainCommand = (
    command: CaptainMeetingCommand,
    definitions: readonly MeetingAgentDefinition[]
):
    | { readonly kind: "command"; readonly command: MeetingCommand }
    | { readonly kind: "rejected"; readonly result: MeetingCommandResult } => {
    if (command.action.kind !== "create_meeting") {
        return { kind: "command", command: MeetingCommandSchema.parse(command) };
    }
    const reject = (): {
        readonly kind: "rejected";
        readonly result: MeetingCommandResult;
    } => ({
        kind: "rejected",
        result: MeetingCommandResultSchema.parse({
            kind: "rejected",
            error: {
                code: "PRECONDITION_FAILED",
                message: "Selected Meeting role is unavailable"
            }
        })
    });
    const findSystemRole = (roleDefinitionId: string): MeetingAgentDefinition | undefined => {
        const matches = definitions.filter(
            (definition) => definition.roleDefinitionId === roleDefinitionId
        );
        return matches.length === 1 ? matches[0] : undefined;
    };
    const manager = findSystemRole("meeting_manager");
    const reviewer = findSystemRole("verification_reviewer");
    if (!manager || !reviewer) {
        return reject();
    }
    const participants: MeetingAgentDefinition[] = [];
    for (const name of command.action.participantRoleNames) {
        const definition = definitions.find((item) => item.displayName === name);
        if (
            !definition ||
            definition.roleDefinitionId === "meeting_manager" ||
            definition.roleDefinitionId === "verification_reviewer"
        ) {
            return reject();
        }
        participants.push(definition);
    }
    const selected = [manager, ...participants, reviewer];
    const selectedByName = new Map(
        selected.map((definition) => [definition.displayName, definition])
    );
    const agendaIds = command.action.initialAgenda.map((agenda) => agenda.id);
    const toIdentity = (
        definition: MeetingAgentDefinition,
        role: "manager" | "contributor" | "evidence_reviewer"
    ) => ({
        identityKey: definition.roleDefinitionId,
        definitionId: definition.agentDefinitionId,
        displayName: definition.displayName,
        roles: [role],
        agendaResponsibilityIds: agendaIds,
        riskAuthority: false,
        required: true
    });
    const initialAgenda = [];
    for (const agenda of command.action.initialAgenda) {
        const owner =
            agenda.ownerRoleName === undefined
                ? undefined
                : selectedByName.get(agenda.ownerRoleName);
        if (agenda.ownerRoleName !== undefined && !owner) {
            return reject();
        }
        initialAgenda.push({
            id: agenda.id,
            title: agenda.title,
            question: agenda.question,
            requiredOutputIds: agenda.requiredOutputIds,
            ...(owner === undefined ? {} : { ownerIdentityKey: owner.roleDefinitionId })
        });
    }
    return {
        kind: "command",
        command: MeetingCommandSchema.parse({
            ...command,
            action: {
                kind: "create_meeting",
                objective: command.action.objective,
                identities: [
                    toIdentity(manager, "manager"),
                    ...participants.map((participant) => toIdentity(participant, "contributor")),
                    toIdentity(reviewer, "evidence_reviewer")
                ],
                managerIdentityKey: manager.roleDefinitionId,
                evidenceReviewerIdentityKey: reviewer.roleDefinitionId,
                initialAgenda,
                initialActiveAgendaId: command.action.initialActiveAgendaId,
                limits: command.action.limits,
                ...(command.action.continuation === undefined
                    ? {}
                    : { continuation: command.action.continuation })
            }
        })
    };
};
