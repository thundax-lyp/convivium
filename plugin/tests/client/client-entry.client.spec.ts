import { describe, expect, it } from "vitest";
import { apply, inject, name } from "../../src/client/index.js";

describe("client entry framework", () => {
    it("loads in the browser-compatible project and has a no-op disposer shape", () => {
        expect(window).toBeDefined();
        expect(name).toBe("convivium-client");
        expect(inject).toContain("@deepseek-ai/dsh-client-runtime");
        expect(apply({} as never)).toBeUndefined();
    });
});
