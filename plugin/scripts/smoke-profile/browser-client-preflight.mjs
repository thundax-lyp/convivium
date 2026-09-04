function fail(message) {
    throw new Error(`browser client preflight: ${message}.`);
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

async function fetchText(fetchImpl, url, label) {
    let response;
    try {
        response = await fetchImpl(url);
    } catch (error) {
        fail(`${label} fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status < 200 || response.status >= 300) {
        fail(`${label} returned HTTP ${response.status}`);
    }
    try {
        return await response.text();
    } catch (error) {
        fail(
            `${label} body read failed: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

export async function assertBrowserClientPreflight(origin, fetchImpl = globalThis.fetch) {
    const rootUrl = new URL("/", origin).href;
    const html = await fetchText(fetchImpl, rootUrl, "root");
    if (!html.includes("@convivium/dsh-plugin")) {
        fail("root HTML is missing the DSH boot markers");
    }
    const boot = extractBootObject(html);
    if (typeof boot.rev !== "string" || !/^[0-9a-f]{12}$/.test(boot.rev)) {
        fail("DSH boot revision is invalid");
    }
    if (!Array.isArray(boot.entries)) fail("DSH boot entries are missing");
    const entries = boot.entries.filter((entry) => entry?.id === "@convivium/dsh-plugin");
    if (entries.length !== 1) fail("expected one Convivium boot entry");
    const rowUrl = entries[0]?.url;
    const rowRevision = entries[0]?.rev;
    if (
        typeof rowRevision !== "string" ||
        !/^[0-9a-f]{12}$/.test(rowRevision) ||
        typeof rowUrl !== "string" ||
        rowUrl !== `/plugins/@convivium/dsh-plugin/client.js?rev=${rowRevision}`
    ) {
        fail("Convivium boot entry URL is invalid");
    }
    const bundleText = await fetchText(fetchImpl, new URL(rowUrl, origin).href, "bundle");
    for (const marker of [
        "window.__ModuleLoader__.load",
        'id: "@convivium/dsh-plugin"',
        "convivium-meetings",
        "conversation.view"
    ]) {
        if (!bundleText.includes(marker)) fail(`bundle is missing ${marker}`);
    }
}
