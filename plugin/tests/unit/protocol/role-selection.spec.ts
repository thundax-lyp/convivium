import { describe, expect, it } from "vitest";
import { CreateMeetingInputSchema } from "@/protocol/commands.js";
import { serializeValidatedRequestV1 } from "@/protocol/request-idempotency.js";
import { createOfflineMeetingProtocolFixture } from "../../fixtures/offline-meeting-protocol.js";

describe("initial role definition selection", () => {
    it("preserves legacy requests without default definition IDs", () => {
        const input = createOfflineMeetingProtocolFixture().createInput;
        input.agenda = input.agenda.map((item) => ({ ...item, relatedTaskIds: [] }));
        expect(CreateMeetingInputSchema(structuredClone(input))).toEqual(input);
        expect(CreateMeetingInputSchema(input).managerAgentDefinitionId).toBeUndefined();
    });
    it("retains explicit IDs in request serialization and distinguishes changes", () => {
        const input = createOfflineMeetingProtocolFixture().createInput;
        input.agenda = input.agenda.map((item) => ({ ...item, relatedTaskIds: [] }));
        const selected = {
            ...input,
            managerAgentDefinitionId: "manager",
            participants: input.participants.map((p) => ({
                ...p,
                agentDefinitionId: "participant"
            }))
        };
        const parsed = CreateMeetingInputSchema(structuredClone(selected));
        expect(parsed).toEqual(selected);
        const hashInput = serializeValidatedRequestV1(parsed);
        expect(hashInput).toContain('"agentDefinitionId":"participant"');
        expect(hashInput).not.toEqual(
            serializeValidatedRequestV1(
                CreateMeetingInputSchema({ ...selected, managerAgentDefinitionId: "other" })
            )
        );
        expect(hashInput).not.toEqual(
            serializeValidatedRequestV1(
                CreateMeetingInputSchema({
                    ...selected,
                    participants: selected.participants.map((p) => ({
                        ...p,
                        agentDefinitionId: "other"
                    }))
                })
            )
        );
    });
    it.each(["", "  ", null, 1, {}, []])(
        "rejects invalid optional ID %j at either position",
        (id) => {
            const input = createOfflineMeetingProtocolFixture().createInput;
            input.agenda = input.agenda.map((item) => ({ ...item, relatedTaskIds: [] }));
            expect(() =>
                CreateMeetingInputSchema({ ...input, managerAgentDefinitionId: id })
            ).toThrow();
            expect(() =>
                CreateMeetingInputSchema({
                    ...input,
                    participants: input.participants.map((p) => ({ ...p, agentDefinitionId: id }))
                })
            ).toThrow();
        }
    );
});
