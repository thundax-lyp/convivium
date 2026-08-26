import type { Agent } from "@deepseek-ai/dsh-agent";
import { SessionId } from "@deepseek-ai/dsh-session";
import { describe, expect, it } from "vitest";

import { bindCaptainParent } from "../../../src/dsh/caller-resolver.js";

function agent(id: string): Agent {
    return { id: SessionId(id) } as Agent;
}

describe("meeting caller resolver", () => {
    it("binds the exact DSH caller as the Captain direct parent", () => {
        expect(bindCaptainParent(agent("captain-session"))).toEqual({
            kind: "captain",
            sessionId: "captain-session"
        });
    });
});
