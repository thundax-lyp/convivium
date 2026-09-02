import { describe, expect, it } from "vitest";
import {
    catalogDomainSpec,
    createMeetingDomainSpec
} from "../../../../src/repository/domain/specs.js";
describe("domain specs", () => {
    it("declares the exact catalog and meeting domain specs", () => {
        expect(catalogDomainSpec.name).toBe("convivium_catalog");
        expect(Object.keys(catalogDomainSpec.tables)).toEqual(["meetings"]);
        expect(Object.keys(createMeetingDomainSpec("convivium_m_test").tables)).toEqual([
            "creation",
            "commits",
            "checkpoint_pages",
            "checkpoint_roots",
            "checkpoint_pointer"
        ]);
    });
});
