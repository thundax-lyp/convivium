#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
if (process.argv[2] === "--version") {
    process.stdout.write("codex-cli 0.161.0\n");
    process.exit(0);
}
const mode = process.argv[2];
const provider = mode === "provider";
const configurations = () =>
    provider
        ? [
              {
                  id: "model",
                  name: "Model",
                  type: "select",
                  currentValue: "scripted-codex",
                  options: [{ value: "scripted-codex", name: "Scripted Codex" }]
              },
              {
                  id: "reasoning_effort",
                  name: "Reasoning",
                  type: "select",
                  currentValue: "medium",
                  options: [{ value: "medium", name: "Medium" }]
              },
              {
                  id: "mode",
                  name: "Mode",
                  type: "select",
                  currentValue: "read-only",
                  options: [{ value: "read-only", name: "Read only" }]
              }
          ]
        : [];
const statePath = provider ? join(process.env.CODEX_HOME, "scripted-remote.json") : undefined;
const sessions = new Set(
    statePath && existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : ["saved"]
);
let active;
const write = (message) =>
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    if (provider) {
        appendFileSync(
            join(process.env.CODEX_HOME, "scripted-rpc.jsonl"),
            JSON.stringify({
                method: message.method,
                sessionId: message.params?.sessionId ?? null,
                mcpCount: message.params?.mcpServers?.length ?? null,
                prompt: message.params?.prompt ?? null
            }) + "\n"
        );
    }
    const faultPath = provider ? join(process.env.CODEX_HOME, "scripted-fault") : undefined;
    const fault = faultPath && existsSync(faultPath) ? readFileSync(faultPath, "utf8") : undefined;
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
                    mcpCapabilities: { http: mode !== "no-http" }
                },
                agentInfo: { name: "scripted", version: "1" }
            }
        });
    } else if (message.method === "session/new") {
        const sessionId = provider ? `scripted-${randomUUID()}` : "fresh";
        sessions.add(sessionId);
        if (statePath) {
            writeFileSync(statePath, JSON.stringify([...sessions]));
        }
        write({ id: message.id, result: { sessionId, configOptions: configurations() } });
    } else if (message.method === "session/load") {
        if (fault === "load-fail") {
            write({ id: message.id, error: { code: -32602, message: "scripted load failure" } });
            continue;
        }
        if (!sessions.has(message.params.sessionId)) {
            write({ id: message.id, error: { code: -32602, message: "unknown session" } });
            continue;
        }
        if (provider) {
            write({
                method: "session/update",
                params: {
                    sessionId: message.params.sessionId,
                    update: {
                        sessionUpdate: "agent_message_chunk",
                        content: { type: "text", text: "hydrated history" }
                    }
                }
            });
        }
        write({ id: message.id, result: { configOptions: configurations() } });
    } else if (message.method === "session/set_config_option") {
        write({ id: message.id, result: { configOptions: configurations() } });
    } else if (message.method === "session/prompt") {
        if (fault === "kill-after-prompt") {
            process.exit(3);
        }
        if (mode === "pending" || fault === "pending") {
            active = message;
            continue;
        }
        if (mode === "disconnect") {
            process.exit(3);
        }
        if (provider) {
            write({
                method: "session/update",
                params: {
                    sessionId: message.params.sessionId,
                    update: {
                        sessionUpdate: "agent_thought_chunk",
                        content: { type: "text", text: "private thought" }
                    }
                }
            });
        }
        const nativeReview =
            provider && JSON.stringify(message.params.prompt).includes("[Native review output]");
        const review = {
            versionId: "version-1",
            scope: "first round",
            dimensions: Object.fromEntries(
                ["source", "credibility", "completeness", "support"].map((key) => [
                    key,
                    {
                        score: 2,
                        scope: key,
                        reason: "verified",
                        baselineEvidenceIds: []
                    }
                ])
            )
        };
        write({
            method: "session/update",
            params: {
                sessionId: message.params.sessionId,
                update: {
                    sessionUpdate: "agent_message_chunk",
                    content: {
                        type: "text",
                        text: nativeReview
                            ? fault === "native-invalid-json"
                                ? "```json\n{}\n```"
                                : JSON.stringify(review)
                            : "scripted result"
                    }
                }
            }
        });
        write({
            id: message.id,
            result: {
                stopReason: "end_turn",
                ...(JSON.stringify(message.params.prompt).includes("usage counters")
                    ? {
                          usage: {
                              inputTokens: 10,
                              outputTokens: 3,
                              totalTokens: 13,
                              cachedReadTokens: 2,
                              cachedWriteTokens: 1,
                              thoughtTokens: 1
                          }
                      }
                    : {})
            }
        });
    } else if (message.method === "session/cancel" && active) {
        write({ id: active.id, result: { stopReason: "cancelled" } });
        active = undefined;
    }
}
