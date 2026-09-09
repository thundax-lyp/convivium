function fail(message) {
    throw new Error(`browser client preflight: ${message}.`);
}

function isRevision(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function redactBrowserCredentials(text) {
    return String(text)
        .replace(/([?&]token=)[^\s)]+/gi, "$1<redacted>")
        .replace(/((?:cookie|set-cookie|authorization)\s*:\s*)[^\r\n]*/gi, "$1<redacted>");
}

export function parseBrowserLaunchUrl(stdout, origin) {
    const matches = [...String(stdout).matchAll(/^dsh web: (http:\/\/[^\s]+)(?:\s|$)/gm)];
    if (matches.length === 0) return undefined;
    if (matches.length !== 1) throw new Error("browser authentication: ambiguous launch URL");
    try {
        const url = new URL(matches[0][1]);
        if (
            url.origin !== new URL(origin).origin ||
            url.pathname !== "/" ||
            url.username !== "" ||
            url.password !== "" ||
            url.hash !== "" ||
            url.searchParams.getAll("token").length !== 1 ||
            !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("token")) ||
            [...url.searchParams.keys()].some((key) => key !== "token")
        )
            throw new Error();
        return url.href;
    } catch {
        throw new Error("browser authentication: invalid launch URL");
    }
}

export async function createAuthenticatedBrowserFetch(
    launchUrl,
    origin,
    fetchImpl = globalThis.fetch,
    timeoutMs
) {
    parseBrowserLaunchUrl(`dsh web: ${launchUrl}`, origin);
    const signal = AbortSignal.timeout(timeoutMs);
    let exchange;
    try {
        exchange = await fetchImpl(launchUrl, { redirect: "manual", signal });
    } catch {
        throw new Error("browser authentication: token exchange failed");
    }
    const location = exchange.headers.get("location");
    const cookies =
        typeof exchange.headers.getSetCookie === "function" ? exchange.headers.getSetCookie() : [];
    if (exchange.status !== 303 || location !== "/" || cookies.length !== 1) {
        throw new Error("browser authentication: invalid token exchange");
    }
    const cookie = cookies[0];
    const [pair, ...attributes] = cookie.split(";");
    if (
        !/^\s*[^=;\s]+=[^;]+\s*$/.test(pair) ||
        !attributes.some((item) => /^\s*httponly\s*$/i.test(item)) ||
        !attributes.some((item) => /^\s*samesite=strict\s*$/i.test(item)) ||
        !attributes.some((item) => /^\s*path=\/\s*$/i.test(item))
    )
        throw new Error("browser authentication: invalid token exchange");
    return async (url, init = {}) => {
        let target;
        try {
            target = new URL(url, origin);
            if (target.origin !== new URL(origin).origin || target.username || target.password)
                throw new Error();
        } catch {
            throw new Error("browser authentication: cross-origin request");
        }
        const headers = new Headers(init.headers);
        headers.set("Cookie", pair.trim());
        return fetchImpl(target.href, { ...init, headers, redirect: "manual" });
    };
}

function extractBootObject(html) {
    const assignment = /globalThis\s*\[\s*(["'])__DSH_BOOT__\1\s*\]\s*=\s*/g;
    const assignments = [...html.matchAll(assignment)];
    if (assignments.length !== 1) fail("expected one DSH boot assignment");
    const start = assignments[0].index + assignments[0][0].length;
    if (html[start] !== "{") fail("DSH boot assignment is not a JSON object");
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < html.length; index += 1) {
        const character = html[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === '"') inString = false;
            continue;
        }
        if (character === '"') inString = true;
        else if (character === "{") depth += 1;
        else if (character === "}") {
            depth -= 1;
            if (depth === 0) {
                try {
                    return JSON.parse(html.slice(start, index + 1));
                } catch {
                    fail("DSH boot assignment is not valid JSON");
                }
            }
        }
    }
    fail("DSH boot assignment is incomplete");
}

async function fetchText(fetchImpl, url, label, signal) {
    let response;
    try {
        response = await fetchImpl(url, { signal });
    } catch (error) {
        if (signal.aborted) fail(`${label} fetch timed out`);
        fail(`${label} fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status < 200 || response.status >= 300) {
        fail(`${label} returned HTTP ${response.status}`);
    }
    try {
        return await response.text();
    } catch (error) {
        if (signal.aborted) fail(`${label} body read timed out`);
        fail(
            `${label} body read failed: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

export async function assertBrowserClientPreflight(
    origin,
    fetchImpl = globalThis.fetch,
    timeoutMs
) {
    const signal = AbortSignal.timeout(timeoutMs);
    const rootUrl = new URL("/", origin).href;
    const html = await fetchText(fetchImpl, rootUrl, "root", signal);
    if (!html.includes("@convivium/dsh-plugin")) {
        fail("root HTML is missing the DSH boot markers");
    }
    const boot = extractBootObject(html);
    if (!isRevision(boot.rev)) {
        fail("DSH boot revision is invalid");
    }
    if (!Array.isArray(boot.entries)) fail("DSH boot entries are missing");
    const entries = boot.entries.filter((entry) => entry?.id === "@convivium/dsh-plugin");
    if (entries.length !== 1) fail("expected one Convivium boot entry");
    const rowUrl = entries[0]?.url;
    const rowRevision = entries[0]?.rev;
    if (
        !isRevision(rowRevision) ||
        typeof rowUrl !== "string" ||
        rowUrl !== `/plugins/??@convivium/dsh-plugin/client.js&rev=${rowRevision}`
    ) {
        fail("Convivium boot entry URL is invalid");
    }
    const bundleText = await fetchText(fetchImpl, new URL(rowUrl, origin).href, "bundle", signal);
    for (const marker of [
        "window.__ModuleLoader__.load",
        'id: "@convivium/dsh-plugin"',
        "convivium-meetings",
        "conversation.view"
    ]) {
        if (!bundleText.includes(marker)) fail(`bundle is missing ${marker}`);
    }
}
