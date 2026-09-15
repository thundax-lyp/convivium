import { describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import { createSessionProvisioningEnvelope } from "@/dsh/provisioning.js";
import { CreateMeetingInputSchema } from "@/protocol/index.js";
import type { MeetingToolRuntime } from "@/runtime/index.js";
import { prepareMeetingCreation } from "@/runtime/meeting-runtime.js";
import { registerCreateAndStatusTools, registerSubmitAndControlTools } from "@/tools/index.js";
import { createOfflineMeetingInput } from "../fixtures/create-meeting-input.js";

function collectToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    const denied = vi.fn(async (): Promise<never> => {
        throw new Error("Unexpected offline runtime execution");
    });
    const runtime = new Proxy(
        {},
        {
            get: () => denied
        }
    ) as MeetingToolRuntime;
    const dependencies = {
        registry: {
            register: (definition: ToolDefinition) => {
                definitions.push(definition);
                return () => undefined;
            }
        },
        callers: { resolve: denied },
        runtime
    };
    registerCreateAndStatusTools(dependencies);
    registerSubmitAndControlTools(dependencies);
    expect(denied).not.toHaveBeenCalled();
    return definitions;
}

describe("current offline meeting protocol", () => {
    it("requires a fixed evidence reviewer and creates contribution state without a Turn", () => {
        const input = createOfflineMeetingInput();
        expect(CreateMeetingInputSchema(structuredClone(input))).toEqual(input);
        expect(() =>
            CreateMeetingInputSchema({ ...input, evidenceReviewerKey: undefined })
        ).toThrow();

        const state = prepareMeetingCreation(
            input,
            "offline-meeting",
            {
                callerBinding: "session:offline-captain",
                capabilityId: "captain:offline-captain"
            },
            { now: 1700000000000 }
        ).state;
        expect(state.contributions).toMatchObject({
            reviewerId: "participant-b",
            tasks: {},
            managerNoticeSeq: 0
        });
        expect(state.currentTurn).toBeUndefined();
    });

    it("provisions identities with contribution-only instructions", () => {
        const manager = createSessionProvisioningEnvelope({
            teamId: "offline-team",
            meetingId: "offline-meeting",
            role: "manager"
        });
        const participant = createSessionProvisioningEnvelope({
            teamId: "offline-team",
            meetingId: "offline-meeting",
            role: "participant",
            participantId: "participant-a"
        });
        expect(manager.capability).toBe("none");
        expect(manager.instruction).toContain("formal contribution planning notice");
        expect(manager.instruction).not.toContain("legacy");
        expect(participant.capability).toBe("none");
        expect(participant.instruction).toContain("formal contribution task");
        expect(participant.instruction).not.toContain("legacy");
    });

    it("registers the current contribution tools and documents the required reviewer", () => {
        const definitions = collectToolDefinitions();
        for (const name of ["convivium_contribution", "convivium_read_contribution"]) {
            expect(definitions.filter((definition) => definition.name === name)).toHaveLength(1);
        }
        const createMeeting = definitions.find(
            (definition) => definition.name === "convivium_create_meeting"
        );
        expect(
            (createMeeting?.parameters.properties as Record<string, { description?: string }>).input
                .description
        ).toContain("evidenceReviewerKey");
    });
});
