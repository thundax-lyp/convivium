import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { Writable, Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";

const scriptPath = fileURLToPath(import.meta.url);
const pluginRoot = resolve(dirname(scriptPath), "..");
const require = createRequire(resolve(pluginRoot, "package.json"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const fail = (code) => {
    throw new Error(code);
};
const select = (options, id) => {
    const option = options?.find((entry) => entry.id === id);
    if (option?.type !== "select") {
        fail("ACP_CODEX_MODEL_UNAVAILABLE");
    }
    const values = option.options.flatMap((entry) => ("group" in entry ? entry.options : [entry]));
    if (!values.some((entry) => entry.value === option.currentValue)) {
        fail("ACP_CODEX_MODEL_UNAVAILABLE");
    }
    return { current: option.currentValue, values };
};

export const preflightCodexAcp = async () => {
    if (process.platform !== "darwin" || !["arm64", "x64"].includes(process.arch)) {
        fail("ACP_CODEX_CONFIG_INVALID");
    }
    const pkg = JSON.parse(readFileSync(resolve(pluginRoot, "package.json"), "utf8"));
    const lock = readFileSync(resolve(pluginRoot, "pnpm-lock.yaml"), "utf8");
    const bridgePackage = require.resolve("@agentclientprotocol/codex-acp/package.json");
    const codexPackage = require.resolve("@openai/codex/package.json");
    const bridge = JSON.parse(readFileSync(bridgePackage, "utf8"));
    const codex = JSON.parse(readFileSync(codexPackage, "utf8"));
    if (
        bridge.version !== "1.11.0" ||
        codex.version !== "0.161.0" ||
        pkg.devDependencies[bridge.name] !== bridge.version ||
        pkg.devDependencies[codex.name] !== codex.version ||
        pkg.pnpm.overrides["@agentclientprotocol/codex-acp>@openai/codex"] !== codex.version ||
        !lock.includes(
            "'@agentclientprotocol/codex-acp@1.11.0':\n    resolution: {integrity: sha512-opPKsRaekgdmQpOpHrR0EEDn9chgtiN+b+h0V78fTuQP84TNzB7vrn3EtKODwbiJQTBHJAlynjSFQazFfaT+VQ==}"
        ) ||
        !lock.includes(
            "'@openai/codex@0.161.0':\n    resolution: {integrity: sha512-+ZnJFGBbQBwYnjUTs+PoacgYVxmNyxMLiadIz6eSJ0AzQW0mRVxuuOQizSbz2qeNAJia9Syxag6j2uGf7guD2Q==}"
        )
    ) {
        fail("ACP_CODEX_CONFIG_INVALID");
    }
    const platformName = `@openai/codex-darwin-${process.arch}`;
    const platformPackage = createRequire(codexPackage).resolve(`${platformName}/package.json`);
    const platform = JSON.parse(readFileSync(platformPackage, "utf8"));
    if (platform.version !== `${codex.version}-darwin-${process.arch}`) {
        fail("ACP_CODEX_CONFIG_INVALID");
    }
    const triple = process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    const binary = realpathSync(resolve(dirname(platformPackage), "vendor", triple, "bin/codex"));
    const command = process.execPath;
    const args = [realpathSync(resolve(dirname(bridgePackage), bridge.bin["codex-acp"]))];
    const env = Object.fromEntries(
        ["PATH", "HOME", "CODEX_HOME"]
            .filter((key) => process.env[key] !== undefined)
            .map((key) => [key, process.env[key]])
    );
    Object.assign(env, { CODEX_PATH: binary, INITIAL_AGENT_MODE: "read-only", NO_BROWSER: "1" });
    let cliVersion;
    try {
        cliVersion = execFileSync(binary, ["--version"], {
            env,
            encoding: "utf8",
            timeout: 30000,
            stdio: ["ignore", "pipe", "pipe"]
        }).trim();
        execFileSync(binary, ["login", "status"], {
            env,
            timeout: 30000,
            stdio: ["ignore", "pipe", "pipe"]
        });
    } catch {
        fail("ACP_CODEX_AUTH_REQUIRED");
    }
    if (cliVersion !== `codex-cli ${codex.version}`) {
        fail("ACP_CODEX_CONFIG_INVALID");
    }
    const child = spawn(command, args, {
        cwd: realpathSync(process.cwd()),
        env,
        detached: true,
        stdio: ["pipe", "pipe", "ignore"]
    });
    child.stdin.on("error", () => {});
    const exited = new Promise((accept) => {
        child.once("close", accept);
        child.once("error", accept);
    });
    let timer;
    try {
        const client = new ClientSideConnection(
            () => ({
                sessionUpdate: async () => {},
                requestPermission: async () => ({ outcome: { outcome: "cancelled" } })
            }),
            ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout))
        );
        const timed = (operation) =>
            Promise.race([
                operation(),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error("ACP_CODEX_CONFIG_INVALID")), 30000);
                })
            ]).finally(() => clearTimeout(timer));
        const initialized = await timed(() =>
            client.initialize({
                protocolVersion: PROTOCOL_VERSION,
                clientInfo: { name: "convivium", version: pkg.version },
                clientCapabilities: {
                    fs: { readTextFile: false, writeTextFile: false },
                    terminal: false
                }
            })
        );
        if (
            initialized.protocolVersion !== PROTOCOL_VERSION ||
            !initialized.agentCapabilities?.loadSession ||
            !initialized.agentCapabilities?.mcpCapabilities?.http
        ) {
            fail("ACP_CODEX_CONFIG_INVALID");
        }
        const fresh = await timed(() =>
            client.newSession({ cwd: realpathSync(process.cwd()), mcpServers: [] })
        );
        const models = select(fresh.configOptions, "model");
        const model = process.env.CONVIVIUM_ACP_CODEX_MODEL ?? models.current;
        if (!models.values.some((entry) => entry.value === model)) {
            fail("ACP_CODEX_MODEL_UNAVAILABLE");
        }
        const configured = await timed(() =>
            client.setSessionConfigOption({
                sessionId: fresh.sessionId,
                configId: "model",
                value: model
            })
        );
        if (select(configured.configOptions, "model").current !== model) {
            fail("ACP_CODEX_MODEL_UNAVAILABLE");
        }
        const effortOption = configured.configOptions.find(
            (entry) => entry.id === "reasoning_effort"
        );
        let reasoningEffort;
        if (effortOption) {
            const efforts = select(configured.configOptions, "reasoning_effort");
            reasoningEffort = process.env.CONVIVIUM_ACP_CODEX_REASONING ?? efforts.current;
            if (!efforts.values.some((entry) => entry.value === reasoningEffort)) {
                fail("ACP_CODEX_MODEL_UNAVAILABLE");
            }
            const result = await timed(() =>
                client.setSessionConfigOption({
                    sessionId: fresh.sessionId,
                    configId: "reasoning_effort",
                    value: reasoningEffort
                })
            );
            if (select(result.configOptions, "reasoning_effort").current !== reasoningEffort) {
                fail("ACP_CODEX_MODEL_UNAVAILABLE");
            }
        } else if (process.env.CONVIVIUM_ACP_CODEX_REASONING !== undefined) {
            fail("ACP_CODEX_MODEL_UNAVAILABLE");
        }
        const mode = await timed(() =>
            client.setSessionConfigOption({
                sessionId: fresh.sessionId,
                configId: "mode",
                value: "read-only"
            })
        );
        if (
            select(mode.configOptions, "mode").current !== "read-only" ||
            select(mode.configOptions, "model").current !== model ||
            (reasoningEffort !== undefined &&
                select(mode.configOptions, "reasoning_effort").current !== reasoningEffort)
        ) {
            fail("ACP_CODEX_MODEL_UNAVAILABLE");
        }
        return {
            command,
            args,
            model,
            ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
            versions: {
                bridge: bridge.version,
                codex: codex.version,
                cli: cliVersion,
                platform: platform.version
            },
            binarySha256: { bridge: sha256(args[0]), codex: sha256(binary) }
        };
    } finally {
        clearTimeout(timer);
        if (child.pid) {
            try {
                process.kill(-child.pid, "SIGTERM");
            } catch (error) {
                if (error.code !== "ESRCH") {
                    throw error;
                }
            }
        }
        const force = setTimeout(() => {
            if (child.pid) {
                try {
                    process.kill(-child.pid, "SIGKILL");
                } catch {}
            }
        }, 5000);
        await exited;
        clearTimeout(force);
        child.stdin.destroy();
        child.stdout.destroy();
    }
};

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
    try {
        console.log(
            JSON.stringify({ ok: true, authenticated: true, ...(await preflightCodexAcp()) })
        );
    } catch (error) {
        console.error(
            JSON.stringify({
                ok: false,
                code: /^ACP_CODEX_[A-Z_]+$/.test(error.message)
                    ? error.message
                    : "ACP_CODEX_CONFIG_INVALID"
            })
        );
        process.exitCode = 1;
    }
}
