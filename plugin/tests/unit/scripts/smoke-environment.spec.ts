import { describe, expect, it } from "vitest";

import { createSmokeEnvironment } from "../../../scripts/smoke-environment.mjs";

describe("createSmokeEnvironment", () => {
    it("removes DeepSeek credentials inherited from the caller", () => {
        const environment = createSmokeEnvironment({
            PATH: "/bin",
            DEEPSEEK_API_KEY: "secret"
        });

        expect(environment).toEqual({ PATH: "/bin" });
    });

    it("does not allow command overrides to reintroduce DeepSeek credentials", () => {
        const environment = createSmokeEnvironment(
            { PATH: "/bin", DSH_HOME: "/old" },
            { DSH_HOME: "/smoke", DEEPSEEK_API_KEY: "secret" }
        );

        expect(environment).toEqual({ PATH: "/bin", DSH_HOME: "/smoke" });
    });
});
