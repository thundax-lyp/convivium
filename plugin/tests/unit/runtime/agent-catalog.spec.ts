import { describe, expect, it } from "vitest";

import type { MeetingAgentCatalogSnapshotV1 } from "../../../src/protocol/index.js";
import {
    captureManagerCatalogBinding,
    type AgentCatalogPort,
    type AgentCatalogReadFailure
} from "../../../src/runtime/services/agent-catalog.js";
import { encodeCanonicalJson } from "../../../src/repository/domain/canonical-json.js";

const request = {
    teamId: "team-1",
    meetingId: "meeting-1",
    captainSessionId: "captain-1"
};

function snapshot(summary = "Runtime specialist"): MeetingAgentCatalogSnapshotV1 {
    return {
        protocolVersion: 1,
        catalogId: "catalog-1",
        catalogVersion: "1",
        teamId: "team-1",
        capturedAt: 1,
        roles: [
            {
                roleDefinitionId: "runtime_engineer",
                version: "1",
                displayName: "Runtime Engineer",
                summary,
                expertiseTags: ["runtime"],
                evidenceScopes: ["repository"],
                responsibilities: ["Review runtime behavior"],
                nonResponsibilities: ["Approve attendance"]
            }
        ],
        candidates: [
            {
                candidateId: "candidate-1",
                roleDefinitionId: "runtime_engineer",
                roleDefinitionVersion: "1",
                sourceMemberName: "runtime-member",
                agentDefinitionId: "agent-definition-1",
                availability: "available"
            }
        ]
    };
}

function port(result: unknown): AgentCatalogPort {
    return { readSnapshot: async () => result as never };
}

describe("Manager Catalog binding capture", () => {
    it("returns none for a missing or throwing port", async () => {
        await expect(captureManagerCatalogBinding(undefined, request)).resolves.toEqual({
            kind: "none"
        });
        await expect(
            captureManagerCatalogBinding(
                { readSnapshot: async () => Promise.reject(new Error("offline")) },
                request
            )
        ).resolves.toEqual({ kind: "none" });
    });

    it("returns none for each declared failure and malformed result", async () => {
        for (const failure of [
            "unavailable",
            "invalid",
            "unsupported",
            "oversize"
        ] satisfies AgentCatalogReadFailure[]) {
            await expect(
                captureManagerCatalogBinding(port({ ok: false, failure }), request)
            ).resolves.toEqual({ kind: "none" });
        }
        for (const result of [
            null,
            { ok: false, failure: "other" },
            { ok: false, failure: "invalid", extra: true },
            { ok: true },
            { ok: true, snapshot: snapshot(), extra: true }
        ]) {
            await expect(captureManagerCatalogBinding(port(result), request)).resolves.toEqual({
                kind: "none"
            });
        }
    });

    it("rejects invalid ownership, exact keys, uniqueness, and role joins", async () => {
        const cases: unknown[] = [
            { ...snapshot(), teamId: "team-2" },
            { ...snapshot(), extra: true },
            { ...snapshot(), candidates: [...snapshot().candidates, snapshot().candidates[0]!] },
            { ...snapshot(), roles: [...snapshot().roles, snapshot().roles[0]!] },
            {
                ...snapshot(),
                candidates: [{ ...snapshot().candidates[0]!, roleDefinitionVersion: "2" }]
            },
            {
                ...snapshot(),
                roles: [{ ...snapshot().roles[0]!, prompt: "private" }]
            }
        ];
        for (const value of cases) {
            await expect(
                captureManagerCatalogBinding(port({ ok: true, snapshot: value }), request)
            ).resolves.toEqual({ kind: "none" });
        }
    });

    it("enforces the 16 KiB Catalog subvalue limit exactly", async () => {
        const baseBytes = encodeCanonicalJson(snapshot("")).byteLength;
        const atLimit = snapshot("x".repeat(16 * 1024 - baseBytes));
        expect(encodeCanonicalJson(atLimit)).toHaveLength(16 * 1024);
        await expect(
            captureManagerCatalogBinding(port({ ok: true, snapshot: atLimit }), request)
        ).resolves.toMatchObject({ kind: "verified" });
        const overLimit = snapshot(`${atLimit.roles[0]!.summary}x`);
        await expect(
            captureManagerCatalogBinding(port({ ok: true, snapshot: overLimit }), request)
        ).resolves.toEqual({ kind: "none" });
    });

    it("returns a verified structured copy without retaining producer arrays", async () => {
        const source = snapshot();
        const binding = await captureManagerCatalogBinding(
            port({ ok: true, snapshot: source }),
            request
        );
        expect(binding).toEqual({ kind: "verified", snapshot: source });
        expect(binding.kind).toBe("verified");
        if (binding.kind !== "verified") throw new Error("expected verified binding");
        expect(binding.snapshot).not.toBe(source);
        expect(binding.snapshot.roles).not.toBe(source.roles);
        expect(binding.snapshot.roles[0]?.expertiseTags).not.toBe(source.roles[0]?.expertiseTags);
        expect(binding.snapshot.candidates).not.toBe(source.candidates);
    });
});
