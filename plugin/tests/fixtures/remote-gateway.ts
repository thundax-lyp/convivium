import { Context } from "@deepseek-ai/cordis";
import TypertGatewayService from "@deepseek-ai/dsh-api-gateway";
import TypertRegistry from "@deepseek-ai/dsh-typert-registry";
import type { InvokeRemoteRequest } from "@deepseek-ai/dsh-api-gateway";
import type { LocalMeetingWebRuntime } from "@/runtime/index.js";
import { ConviviumRemoteService } from "@/remote/index.js";
import { TYPERT } from "@convivium/dsh-plugin/typert";

export async function createRemoteGateway(runtime: LocalMeetingWebRuntime) {
    const ctx = new Context();
    let unregister: (() => void) | undefined;
    try {
        await ctx.plugin(TypertRegistry);
        await ctx.plugin(TypertGatewayService, {});
        const registry = ctx.get("typert");
        unregister = registry.register(TYPERT);
        const serviceFiber = await ctx.plugin({
            name: "convivium-test-remote",
            apply(serviceContext: Context) {
                serviceContext.plugin(ConviviumRemoteService, runtime);
            }
        });
        return {
            ctx,
            serviceFiber,
            invoke(method: string, args: Readonly<Record<string, unknown>>, signal?: AbortSignal) {
                const request: InvokeRemoteRequest = {
                    namespace: "conviviumMeetings",
                    method,
                    args,
                    signal
                };
                return ctx.typertGateway.invoke(request);
            },
            stream(method: string, args: Readonly<Record<string, unknown>>, signal?: AbortSignal) {
                const request: InvokeRemoteRequest = {
                    namespace: "conviviumMeetings",
                    method,
                    args,
                    signal
                };
                return ctx.typertGateway.stream(request);
            },
            async dispose() {
                try {
                    unregister?.();
                } finally {
                    try {
                        await serviceFiber.dispose();
                    } finally {
                        await ctx.fiber.dispose();
                    }
                }
            }
        };
    } catch (error) {
        try {
            unregister?.();
        } finally {
            await ctx.fiber.dispose();
        }
        throw error;
    }
}
