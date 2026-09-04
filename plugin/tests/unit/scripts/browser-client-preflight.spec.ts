import { describe, expect, it } from "vitest";

import { assertBrowserClientPreflight } from "../../../scripts/smoke-profile/browser-client-preflight.mjs";

const rootUrl = "http://127.0.0.1:4567/";
const bundleUrl = "http://127.0.0.1:4567/plugins/@convivium/dsh-plugin/client.js?rev=0123456789ab";
const bootHtml = `<script>window.__DSH_BOOT__ = ${JSON.stringify(
    {
        entries: [
            {
                id: "@convivium/dsh-plugin",
                url: "/plugins/@convivium/dsh-plugin/client.js?rev=0123456789ab"
            }
        ]
    },
    null,
    2
)};</script>`;
const bundleText =
    'window.__ModuleLoader__.load({ id: "@convivium/dsh-plugin" }); convivium-meetings conversation.view';

function response(status: number, body: string) {
    return { status, text: async () => body };
}

function fetchSequence(...responses: Array<{ status: number; body: string }>) {
    const calls: string[] = [];
    let index = 0;
    return {
        calls,
        fetchImpl: async (url: string) => {
            calls.push(url);
            const current = responses[index];
            index += 1;
            return response(current.status, current.body);
        }
    };
}

describe("assertBrowserClientPreflight", () => {
    it("accepts the unique boot entry and bundle markers", async () => {
        const sequence = fetchSequence(
            { status: 200, body: bootHtml },
            { status: 200, body: bundleText }
        );
        await expect(
            assertBrowserClientPreflight(rootUrl, sequence.fetchImpl)
        ).resolves.toBeUndefined();
        expect(sequence.calls).toEqual([rootUrl, bundleUrl]);
    });

    it("fails closed when the root fetch is non-2xx", async () => {
        const sequence = fetchSequence({ status: 503, body: "unavailable" });
        await expect(assertBrowserClientPreflight(rootUrl, sequence.fetchImpl)).rejects.toThrow(
            "browser client preflight: root returned HTTP 503."
        );
        expect(sequence.calls).toEqual([rootUrl]);
    });

    it("fails closed when the bundle fetch is non-2xx", async () => {
        const sequence = fetchSequence(
            { status: 200, body: bootHtml },
            { status: 502, body: "bad gateway" }
        );
        await expect(assertBrowserClientPreflight(rootUrl, sequence.fetchImpl)).rejects.toThrow(
            "browser client preflight: bundle returned HTTP 502."
        );
        expect(sequence.calls).toEqual([rootUrl, bundleUrl]);
    });

    it.each([
        ["missing", []],
        [
            "duplicate",
            [
                {
                    id: "@convivium/dsh-plugin",
                    url: "/plugins/@convivium/dsh-plugin/client.js?rev=0123456789ab"
                },
                {
                    id: "@convivium/dsh-plugin",
                    url: "/plugins/@convivium/dsh-plugin/client.js?rev=0123456789ab"
                }
            ]
        ]
    ])("rejects %s boot entry", async (_label, entries) => {
        const sequence = fetchSequence(
            {
                status: 200,
                body: `<script>window.__DSH_BOOT__ = ${JSON.stringify({ entries })}; @convivium/dsh-plugin</script>`
            },
            { status: 200, body: bundleText }
        );
        await expect(assertBrowserClientPreflight(rootUrl, sequence.fetchImpl)).rejects.toThrow(
            "browser client preflight: expected one Convivium boot entry."
        );
        expect(sequence.calls).toEqual([rootUrl]);
    });

    it("rejects a malformed bundle URL and missing marker", async () => {
        const invalidUrl = `<script>window.__DSH_BOOT__ = ${JSON.stringify({
            entries: [{ id: "@convivium/dsh-plugin", url: "/plugins/wrong.js?rev=0123456789ab" }]
        })};</script>`;
        const sequence = fetchSequence({ status: 200, body: invalidUrl });
        await expect(assertBrowserClientPreflight(rootUrl, sequence.fetchImpl)).rejects.toThrow(
            "browser client preflight: Convivium boot entry URL is invalid."
        );
        expect(sequence.calls).toEqual([rootUrl]);
    });
});
