import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolRegistration = readFileSync(
    new URL("../../src/tools/register-tools.ts", import.meta.url),
    "utf8"
);
const projection = readFileSync(new URL("../../src/projection/status.ts", import.meta.url), "utf8");

describe("T5 HTTP boundary", () => {
    it("provides the DSH tools without importing or registering a Meeting HTTP surface", () => {
        expect(toolRegistration.match(/name: "convivium_[^"]+"/g)).toEqual([
            'name: "convivium_create_meeting"',
            'name: "convivium_meeting_status"',
            'name: "convivium_create_meeting_task"',
            'name: "convivium_meeting_task_status"',
            'name: "convivium_start_meeting_task"',
            'name: "convivium_finish_meeting_task"',
            'name: "convivium_raise_hand"',
            'name: "convivium_submit_manager_plan"',
            'name: "convivium_submit_turn"',
            'name: "convivium_pause_meeting"',
            'name: "convivium_resume_meeting"',
            'name: "convivium_end_meeting"'
        ]);
        expect(`${toolRegistration}\n${projection}`).not.toMatch(
            /dsh-host-webserver|ctx\.router|registerRoute|WebRoute/
        );
    });
});
