import { createInterface } from "node:readline";
const mode = process.argv[2];
const sessions = new Set(["saved"]);
let active;
const write = (message) =>
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    if (message.method === "initialize") {
        if (mode === "hang") {
            continue;
        }
        if (mode === "exit") {
            process.exit(2);
        }
        write({
            id: message.id,
            result: {
                protocolVersion: 1,
                agentCapabilities: {
                    loadSession: mode !== "no-load",
                    mcpCapabilities: { http: true }
                },
                agentInfo: { name: "scripted", version: "1" }
            }
        });
    } else if (message.method === "session/new") {
        sessions.add("fresh");
        write({ id: message.id, result: { sessionId: "fresh", configOptions: [] } });
    } else if (message.method === "session/load") {
        if (!sessions.has(message.params.sessionId)) {
            write({ id: message.id, error: { code: -32602, message: "unknown session" } });
            continue;
        }
        write({ id: message.id, result: { configOptions: [] } });
    } else if (message.method === "session/set_config_option") {
        write({ id: message.id, result: { configOptions: [] } });
    } else if (message.method === "session/prompt") {
        if (mode === "pending") {
            active = message;
            continue;
        }
        if (mode === "disconnect") {
            process.exit(3);
        }
        write({
            method: "session/update",
            params: {
                sessionId: message.params.sessionId,
                update: {
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text: "scripted result" }
                }
            }
        });
        write({ id: message.id, result: { stopReason: "end_turn" } });
    } else if (message.method === "session/cancel" && active) {
        write({ id: active.id, result: { stopReason: "cancelled" } });
        active = undefined;
    }
}
