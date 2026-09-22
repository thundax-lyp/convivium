import type { Context } from "@deepseek-ai/cordis";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { apply, inject } from "@/client/index.js";

const NS = "convivium.meeting";

describe("Meeting client locale integration", () => {
    it("registers locale-owned view copy and hands cleanup to the plugin lifecycle", async () => {
        let active: "zh" | "en" = "en";
        let dictionaries: Record<"zh" | "en", Record<string, string>> | undefined;
        let registration:
            | {
                  options: Record<string, unknown>;
                  component: (props: { t: (key: string) => string }) => ReactElement;
              }
            | undefined;
        const lifecycleEffects: Array<() => void> = [];
        const disposeDictionary = vi.fn(() => {
            dictionaries = undefined;
        });
        const disposeSlot = vi.fn(() => {
            registration = undefined;
        });
        const translate = (key: string) => dictionaries?.[active][key] ?? key;
        const fakeContext = {
            remote: { $mount: vi.fn(async () => {}), conviviumMeetings: {} },
            locale: {
                register: vi.fn(
                    (namespace: string, value: Record<"zh" | "en", Record<string, string>>) => {
                        expect(namespace).toBe(NS);
                        dictionaries = value;
                        return disposeDictionary;
                    }
                ),
                bind: vi.fn((namespace: string) => {
                    expect(namespace).toBe(NS);
                    return translate;
                })
            },
            effect: vi.fn((factory: () => () => void) => {
                const dispose = factory();
                lifecycleEffects.push(dispose);
                return dispose;
            }),
            inject: vi.fn(
                (_services: readonly string[], callback: (ctx: typeof fakeContext) => void) =>
                    callback(fakeContext)
            ),
            slots: {
                inject: vi.fn((_name: string, callback: () => () => void) => {
                    const dispose = callback();
                    lifecycleEffects.push(dispose);
                    return dispose;
                }),
                register: vi.fn(
                    (
                        options: Record<string, unknown>,
                        component: (props: { t: (key: string) => string }) => ReactElement
                    ) => {
                        registration = { options, component };
                        return disposeSlot;
                    }
                )
            }
        };

        await apply(fakeContext as unknown as Context);

        expect(inject).toContain("locale");
        expect(fakeContext.locale.register).toHaveBeenCalledOnce();
        expect(registration).toBeDefined();
        expect(registration?.options).toMatchObject({
            name: "conversation.view",
            id: "convivium-meetings",
            order: 100,
            locale: NS
        });
        const label = registration?.options.label;
        expect(label).toBeTypeOf("function");
        expect((label as () => string)()).toBe("Meetings");
        active = "zh";
        expect((label as () => string)()).toBe("会议");

        const seat = vi.fn(() => "seat-value");
        const element = registration?.component({ t: seat });
        expect(element?.props.t).toBe(seat);

        for (const dispose of lifecycleEffects.reverse()) dispose();
        expect(registration).toBeUndefined();
        expect(translate("tab.meetings")).toBe("tab.meetings");
        expect(disposeDictionary).toHaveBeenCalledOnce();
        expect(disposeSlot).toHaveBeenCalledOnce();
    });
});
