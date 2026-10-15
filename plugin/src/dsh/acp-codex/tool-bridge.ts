import type { Agent } from "@deepseek-ai/dsh-agent";
import { ToolCallId, type ToolSchema } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    McpError,
    ErrorCode,
    type CallToolResult
} from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { encodeCanonicalJson, sha256Hex } from "@/utils/index.ts";
import type { CodexToolBridge } from "./types.ts";

export const openCodexToolBridge = async (input: {
    agent: Agent;
    signal: AbortSignal;
    isBlocked: () => boolean;
    onUnsafeSettlement: () => Promise<void>;
}): Promise<CodexToolBridge> => {
    input.signal.throwIfAborted();
    const { agent } = input;
    const token = randomBytes(16).toString("hex");
    const path = `/${randomBytes(16).toString("hex")}`;
    const lifetime = new AbortController();
    let request: Parameters<CodexToolBridge["setRequest"]>[0];
    let concluded = false;
    let closing: Promise<void> | undefined;
    let tail: Promise<void> = Promise.resolve();
    const cache = new Map<string, { hash: string; result: Promise<CallToolResult> }>();
    const handlers = new Set<Promise<void>>();
    const servers = new Set<Server>();
    const unavailable = (): CallToolResult => ({
        isError: true,
        content: [{ type: "text", text: "Session tools are unavailable." }]
    });
    const visible = (): readonly ToolSchema[] => {
        if (closing || input.isBlocked() || agent.ctx.agents.get(SessionId(agent.id)) !== agent) {
            return [];
        }
        const scoped = agent.ctx.tools.schemas(agent);
        return request
            ? request.tools.filter((tool) => scoped.some((item) => item.name === tool.name))
            : scoped;
    };
    const call = (
        id: string | number,
        name: string,
        args: Record<string, unknown>,
        signal: AbortSignal,
        onDispatched: () => void
    ): Promise<CallToolResult> => {
        const current = request;
        if (
            !current ||
            current.signal.aborted ||
            lifetime.signal.aborted ||
            concluded ||
            !visible().some((tool) => tool.name === name)
        ) {
            return Promise.resolve(unavailable());
        }
        const key = `${current.requestId}:${id}`;
        const hash = sha256Hex(encodeCanonicalJson({ name, arguments: args }));
        const prior = cache.get(key);
        if (prior) {
            if (prior.hash !== hash) {
                throw new McpError(ErrorCode.InvalidRequest, "Conflicting RPC arguments.");
            }
            return prior.result;
        }
        const run = async (): Promise<CallToolResult> => {
            const combined = AbortSignal.any([signal, current.signal, lifetime.signal]);
            if (
                request !== current ||
                combined.aborted ||
                concluded ||
                !visible().some((tool) => tool.name === name)
            ) {
                return unavailable();
            }
            onDispatched();
            try {
                const result = await agent.ctx.tools.execute({
                    callId: ToolCallId(`acp:${current.requestId}:${id}`),
                    name,
                    arguments: args,
                    agent,
                    signal: combined
                });
                if (request !== current || combined.aborted || input.isBlocked()) {
                    throw new Error("Tool settlement interrupted.");
                }
                for (const context of result.additionalContexts ?? []) {
                    agent.inject(context);
                }
                if (
                    result.additionalContexts?.length &&
                    !(await agent.ctx.sessions.flush(agent.session))
                ) {
                    throw new Error("Context persistence failed.");
                }
                if (result.concludesTurn) {
                    concluded = true;
                }
                const content: CallToolResult["content"] = result.content
                    .filter((block) => block.type === "text")
                    .map((block) => ({ type: "text", text: block.text }));
                if (!content.length) {
                    content.push({
                        type: "text",
                        text: JSON.stringify(result.isError ? result.error : result.value)
                    });
                }
                if (result.concludesTurn) {
                    content.push({ type: "text", text: "结束当前响应" });
                }
                return {
                    content,
                    isError: result.isError,
                    ...(!result.isError &&
                    result.value !== null &&
                    typeof result.value === "object" &&
                    !Array.isArray(result.value)
                        ? { structuredContent: result.value }
                        : {})
                };
            } catch (error) {
                await input.onUnsafeSettlement();
                throw error;
            }
        };
        const result = tail.then(run, run);
        tail = result.then(
            () => {},
            () => {}
        );
        cache.set(key, { hash, result });
        return result;
    };
    let address = "";
    const http = createServer((req, res) => {
        const work = async (): Promise<void> => {
            const auth = Buffer.from(req.headers.authorization ?? "");
            const expected = Buffer.from(`Bearer ${token}`);
            if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
                res.writeHead(401).end();
                req.resume();
                return;
            }
            if (
                req.headers.host !== address ||
                (req.headers.origin !== undefined && req.headers.origin !== `http://${address}`)
            ) {
                res.writeHead(403).end();
                req.resume();
                return;
            }
            if (req.url !== path) {
                res.writeHead(404).end();
                req.resume();
                return;
            }
            if (req.method !== "POST") {
                res.writeHead(405).end();
                req.resume();
                return;
            }
            let bytes = 0;
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                bytes += chunk.length;
                if (bytes > 1048576) {
                    res.writeHead(413).end();
                    req.resume();
                    return;
                }
                chunks.push(Buffer.from(chunk));
            }
            let body: unknown;
            try {
                body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            } catch {
                res.writeHead(400).end();
                return;
            }
            if (lifetime.signal.aborted) {
                res.writeHead(503).end();
                return;
            }
            const server = new Server(
                { name: "convivium", version: "1" },
                { capabilities: { tools: {} } }
            );
            servers.add(server);
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true
            });
            let dispatched = false;
            res.on("close", () => {
                if (dispatched && !res.writableFinished) {
                    void input.onUnsafeSettlement().catch(() => {
                        lifetime.abort();
                    });
                }
            });
            server.setRequestHandler(ListToolsRequestSchema, async () => ({
                tools: visible().map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: { ...tool.parameters, type: "object" as const }
                }))
            }));
            server.setRequestHandler(CallToolRequestSchema, async (value, extra) =>
                call(
                    extra.requestId,
                    value.params.name,
                    value.params.arguments ?? {},
                    extra.signal,
                    () => {
                        dispatched = true;
                    }
                )
            );
            try {
                await server.connect(transport);
                await transport.handleRequest(req, res, body);
            } finally {
                await server.close();
                servers.delete(server);
            }
        };
        const job = work().catch(() => {
            if (!res.headersSent) {
                res.writeHead(500);
            }
            res.end();
        });
        handlers.add(job);
        void job.finally(() => handlers.delete(job));
    });
    await new Promise<void>((resolve, reject) => {
        http.once("error", reject);
        http.listen(0, "127.0.0.1", () => {
            http.removeListener("error", reject);
            resolve();
        });
    });
    const bound = http.address();
    if (!bound || typeof bound === "string") {
        http.close();
        throw new Error("MCP listener unavailable.");
    }
    address = `127.0.0.1:${bound.port}`;
    const close = (): Promise<void> =>
        (closing ??= (async () => {
            input.signal.removeEventListener("abort", abort);
            lifetime.abort();
            request = undefined;
            http.closeAllConnections();
            await Promise.allSettled([...handlers]);
            await tail;
            await Promise.all([...servers].map((server) => server.close()));
            await new Promise<void>((resolve, reject) =>
                http.close((error) => (error ? reject(error) : resolve()))
            );
        })());
    const abort = () => {
        void close().catch(() => {});
    };
    input.signal.addEventListener("abort", abort, { once: true });
    if (input.signal.aborted) {
        await close();
        input.signal.throwIfAborted();
    }
    return {
        mcpServer: {
            type: "http",
            name: "convivium",
            url: `http://${address}${path}`,
            headers: [{ name: "Authorization", value: `Bearer ${token}` }]
        },
        setRequest: (value) => {
            if (closing) {
                throw new Error("MCP bridge closed.");
            }
            if (value?.requestId !== request?.requestId) {
                cache.clear();
                concluded = false;
            }
            request =
                value === undefined ? undefined : { ...value, tools: structuredClone(value.tools) };
        },
        close
    };
};
