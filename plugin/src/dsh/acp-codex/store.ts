import type { Context } from "@deepseek-ai/cordis";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { LlmError } from "@deepseek-ai/dsh-llm";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { encodeCanonicalJson, sha256Hex } from "@/utils/index.ts";
import type { CodexAcpBinding, CodexAcpRequest, CodexAcpDelivery, CodexAcpStore } from "./types.ts";
const text = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const binding = z
    .strictObject({
        sessionId: text,
        rootSessionId: text,
        acpSessionId: text.optional(),
        cwd: text.refine(isAbsolute),
        launchFingerprint: hash,
        provider: z.literal("acp-codex"),
        model: text,
        reasoningEffort: text.optional(),
        state: z.enum(["ready", "blocked"]),
        block: z
            .strictObject({
                code: z.enum(["ACP_CODEX_OUTCOME_UNKNOWN", "ACP_CODEX_RECOVERY_REQUIRED"]),
                since: time
            })
            .optional(),
        createdAt: time,
        updatedAt: time
    })
    .refine((value) =>
        value.state === "ready"
            ? value.acpSessionId !== undefined && value.block === undefined
            : value.block !== undefined
    );
const request = z
    .strictObject({
        requestId: text,
        sessionId: text,
        rootSessionId: text,
        inputMessageIds: z.array(text),
        prefixMessageIds: z.array(text),
        prefixSha256: hash,
        phase: z.enum(["sending", "responded", "committed"]),
        startedAt: time,
        respondedAt: time.optional(),
        committedAt: time.optional()
    })
    .refine((value) =>
        value.phase === "sending"
            ? value.respondedAt === undefined && value.committedAt === undefined
            : value.phase === "responded"
              ? value.respondedAt !== undefined && value.committedAt === undefined
              : value.respondedAt !== undefined && value.committedAt !== undefined
    );
const delivery = z.strictObject({
    sessionId: text,
    deliveryId: text,
    textSha256: hash,
    state: z.enum(["admitting", "queued", "completed", "blocked"]),
    createdAt: time,
    updatedAt: time
});
const spec = defineDomain({
    name: "convivium_acp_codex",
    version: 1,
    tables: {
        bindings: domainTable<string, CodexAcpBinding>(binding),
        requests: domainTable<string, CodexAcpRequest>(request),
        deliveries: domainTable<string, CodexAcpDelivery>(delivery)
    }
});
const deliveryKey = (sessionId: string, deliveryId: string) =>
    sha256Hex(encodeCanonicalJson([sessionId, deliveryId]));
const snapshot = <T>(value: T): T => {
    if (value === undefined) {
        return value;
    }
    const clone = structuredClone(value);
    const freeze = (item: unknown): void => {
        if (item !== null && typeof item === "object") {
            for (const child of Object.values(item)) {
                freeze(child);
            }
            Object.freeze(item);
        }
    };
    freeze(clone);
    return clone;
};
export const openCodexAcpStore = async (ctx: Context): Promise<CodexAcpStore> => {
    const domain = await ctx.storageDomain.open(spec);
    const bindings = domain.table("bindings"),
        requests = domain.table("requests"),
        deliveries = domain.table("deliveries");
    try {
        if (
            [...bindings.entries()].some(([key, record]) => key !== record.sessionId) ||
            [...requests.entries()].some(([key, record]) => key !== record.requestId) ||
            [...deliveries.entries()].some(
                ([key, record]) => key !== deliveryKey(record.sessionId, record.deliveryId)
            )
        ) {
            throw new LlmError("ACP record key mismatch.", "ACP_CODEX_RECOVERY_REQUIRED");
        }
    } catch (error) {
        await domain.close();
        throw error;
    }
    return {
        binding: (id) => snapshot(bindings.get(id)),
        request: (id) => snapshot(requests.get(id)),
        delivery: (id, deliveryId) => snapshot(deliveries.get(deliveryKey(id, deliveryId))),
        bindings: () => snapshot([...bindings.entries()].map(([, value]) => value)),
        requests: (id) =>
            snapshot(
                [...requests.entries()]
                    .map(([, value]) => value)
                    .filter((value) => value.sessionId === id)
            ),
        deliveries: (id) =>
            snapshot(
                [...deliveries.entries()]
                    .map(([, value]) => value)
                    .filter((value) => value.sessionId === id)
            ),
        putBinding: async (value) => {
            const record = binding.parse(value);
            await bindings.put(record.sessionId, record);
        },
        putRequest: async (value) => {
            const record = request.parse(value);
            await requests.put(record.requestId, record);
        },
        putDelivery: async (value) => {
            const record = delivery.parse(value);
            const key = deliveryKey(record.sessionId, record.deliveryId);
            const previous = deliveries.get(key);
            if (previous && previous.textSha256 !== record.textSha256) {
                throw new LlmError("Conflicting ACP delivery.", "ACP_CODEX_DELIVERY_CONFLICT");
            }
            await deliveries.put(key, record);
        },
        close: () => domain.close()
    };
};
