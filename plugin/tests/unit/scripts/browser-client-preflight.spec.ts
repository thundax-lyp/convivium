import { describe, expect, it } from "vitest";

import {
    assertBrowserClientPreflight,
    createAuthenticatedBrowserFetch,
    parseBrowserLaunchUrl,
    redactBrowserCredentials
} from "../../../scripts/smoke-profile/browser-client-preflight.mjs";

const rootUrl = "http://127.0.0.1:4567/";
const bundleUrl =
    "http://127.0.0.1:4567/plugins/??@convivium/dsh-plugin/client.js&rev=0123456789ab";
const bootGraph = {
    rev: "abcdef012345",
    entries: [
        {
            id: "@convivium/dsh-plugin",
            url: "/plugins/??@convivium/dsh-plugin/client.js&rev=0123456789ab",
            rev: "0123456789ab"
        }
    ]
};
const bootHtml = `<script>globalThis["__DSH_BOOT__"] = ${JSON.stringify(bootGraph, null, 2)};</script>`;
const bundleText =
    'window.__ModuleLoader__.load({ id: "@convivium/dsh-plugin" }); convivium-meetings conversation.view';
const timeoutMs = 100;

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

function rejectOnAbort(signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
}

describe("Browser client bundle preflight", () => {
    it("accepts the unique boot entry and bundle markers", async () => {
        const sequence = fetchSequence(
            { status: 200, body: bootHtml },
            { status: 200, body: bundleText }
        );
        await expect(
            assertBrowserClientPreflight(rootUrl, sequence.fetchImpl, timeoutMs)
        ).resolves.toBeUndefined();
        expect(sequence.calls).toEqual([rootUrl, bundleUrl]);
    });

    it("fails closed when the root fetch is non-2xx", async () => {
        const sequence = fetchSequence({ status: 503, body: "unavailable" });
        await expect(
            assertBrowserClientPreflight(rootUrl, sequence.fetchImpl, timeoutMs)
        ).rejects.toThrow("browser client preflight: root returned HTTP 503.");
        expect(sequence.calls).toEqual([rootUrl]);
    });

    it("fails closed when the bundle fetch is non-2xx", async () => {
        const sequence = fetchSequence(
            { status: 200, body: bootHtml },
            { status: 502, body: "bad gateway" }
        );
        await expect(
            assertBrowserClientPreflight(rootUrl, sequence.fetchImpl, timeoutMs)
        ).rejects.toThrow("browser client preflight: bundle returned HTTP 502.");
        expect(sequence.calls).toEqual([rootUrl, bundleUrl]);
    });

    it.each([
        ["missing", []],
        [
            "duplicate",
            [
                {
                    id: "@convivium/dsh-plugin",
                    url: "/plugins/??@convivium/dsh-plugin/client.js&rev=0123456789ab",
                    rev: "0123456789ab"
                },
                {
                    id: "@convivium/dsh-plugin",
                    url: "/plugins/??@convivium/dsh-plugin/client.js&rev=0123456789ab",
                    rev: "0123456789ab"
                }
            ]
        ]
    ])("rejects %s boot entry", async (_label, entries) => {
        const sequence = fetchSequence(
            {
                status: 200,
                body: `<script>globalThis["__DSH_BOOT__"] = ${JSON.stringify({ ...bootGraph, entries })}; @convivium/dsh-plugin</script>`
            },
            { status: 200, body: bundleText }
        );
        await expect(
            assertBrowserClientPreflight(rootUrl, sequence.fetchImpl, timeoutMs)
        ).rejects.toThrow("browser client preflight: expected one Convivium boot entry.");
        expect(sequence.calls).toEqual([rootUrl]);
    });

    it("rejects a malformed bundle URL and missing marker", async () => {
        const invalidUrl = `<script>globalThis["__DSH_BOOT__"] = ${JSON.stringify({
            rev: "abcdef012345",
            entries: [
                {
                    id: "@convivium/dsh-plugin",
                    url: "/plugins/??wrong.js&rev=0123456789ab",
                    rev: "0123456789ab"
                }
            ]
        })};</script>`;
        const sequence = fetchSequence({ status: 200, body: invalidUrl });
        await expect(
            assertBrowserClientPreflight(rootUrl, sequence.fetchImpl, timeoutMs)
        ).rejects.toThrow("browser client preflight: Convivium boot entry URL is invalid.");
        expect(sequence.calls).toEqual([rootUrl]);
    });

    it.each([
        [
            "missing graph revision",
            { entries: bootGraph.entries },
            "browser client preflight: DSH boot revision is invalid."
        ],
        [
            "missing entry revision",
            {
                ...bootGraph,
                entries: [
                    {
                        id: bootGraph.entries[0].id,
                        url: bootGraph.entries[0].url
                    }
                ]
            },
            "browser client preflight: Convivium boot entry URL is invalid."
        ],
        [
            "mismatched entry revision",
            {
                ...bootGraph,
                entries: [{ ...bootGraph.entries[0], rev: "fedcba987654" }]
            },
            "browser client preflight: Convivium boot entry URL is invalid."
        ]
    ])("rejects %s", async (_label, boot, message) => {
        const sequence = fetchSequence({
            status: 200,
            body: `<script>globalThis["__DSH_BOOT__"] = ${JSON.stringify(boot)}; @convivium/dsh-plugin</script>`
        });
        await expect(
            assertBrowserClientPreflight(rootUrl, sequence.fetchImpl, timeoutMs)
        ).rejects.toThrow(message);
        expect(sequence.calls).toEqual([rootUrl]);
    });

    it("rejects the legacy window boot property", async () => {
        const sequence = fetchSequence({
            status: 200,
            body: `<script>window.__DSH_BOOT__ = ${JSON.stringify({ entries: [] })}; @convivium/dsh-plugin</script>`
        });
        await expect(
            assertBrowserClientPreflight(rootUrl, sequence.fetchImpl, timeoutMs)
        ).rejects.toThrow("browser client preflight: expected one DSH boot assignment.");
        expect(sequence.calls).toEqual([rootUrl]);
    });

    it("times out a stalled root fetch", async () => {
        const fetchImpl = (_url: string, init: { signal: AbortSignal }) =>
            rejectOnAbort(init.signal);

        await expect(assertBrowserClientPreflight(rootUrl, fetchImpl, 10)).rejects.toThrow(
            "browser client preflight: root fetch timed out."
        );
    });

    it("times out a stalled bundle body read", async () => {
        let call = 0;
        const fetchImpl = async (_url: string, init: { signal: AbortSignal }) => {
            call += 1;
            if (call === 1) return response(200, bootHtml);
            return { status: 200, text: () => rejectOnAbort(init.signal) };
        };

        await expect(assertBrowserClientPreflight(rootUrl, fetchImpl, 10)).rejects.toThrow(
            "browser client preflight: bundle body read timed out."
        );
    });
});

describe("Browser launch authentication", () => {
    const token = "a".repeat(43);
    const launchUrl = `http://127.0.0.1:4567/?token=${token}`;

    it("parses one authenticated launch URL and rejects ambiguity", () => {
        expect(parseBrowserLaunchUrl(`dsh web: ${launchUrl}\n`, rootUrl)).toBe(launchUrl);
        expect(() =>
            parseBrowserLaunchUrl(`dsh web: ${launchUrl}\ndsh web: ${launchUrl}\n`, rootUrl)
        ).toThrow("browser authentication: ambiguous launch URL");
        expect(parseBrowserLaunchUrl("other output\n", rootUrl)).toBeUndefined();
    });

    it("exchanges the launch token and carries only the cookie to same-origin requests", async () => {
        const calls: Array<[string, RequestInit | undefined]> = [];
        const fetchImpl = async (url: string, init?: RequestInit) => {
            calls.push([url, init]);
            if (calls.length === 1)
                return new Response(null, {
                    status: 303,
                    headers: {
                        location: "/",
                        "set-cookie": "dsh_session=abc; Path=/; HttpOnly; SameSite=Strict"
                    }
                });
            return new Response(bootHtml, { status: 200 });
        };
        const authenticated = await createAuthenticatedBrowserFetch(
            launchUrl,
            rootUrl,
            fetchImpl,
            timeoutMs
        );
        await authenticated(rootUrl);
        expect(calls[1][1]?.headers).toBeInstanceOf(Headers);
        expect(new Headers(calls[1][1]?.headers).get("Cookie")).toBe("dsh_session=abc");
        await expect(authenticated("http://evil.example/")).rejects.toThrow(
            "browser authentication: cross-origin request"
        );
        expect(calls).toHaveLength(2);
    });

    it("redacts token and credential headers", () => {
        expect(redactBrowserCredentials(`url=${launchUrl} Cookie: secret`)).toContain(
            "token=<redacted>"
        );
        expect(redactBrowserCredentials("Authorization: Bearer secret")).toBe(
            "Authorization: <redacted>"
        );
    });
});
