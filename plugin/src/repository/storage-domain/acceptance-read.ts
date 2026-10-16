import type { KvTable } from "@deepseek-ai/dsh-storage-domain";
import { catalogKey, meetingDomainName, CatalogMeetingRecordSchema } from "./format/index.ts";
import { loadProjection } from "./meeting/index.ts";

export const readMeetingOutboxForAcceptance = (input: {
    storageDomain: {
        get(name: string):
            | {
                  table(name: string): Pick<KvTable<string, unknown>, "get" | "entries">;
              }
            | undefined;
    };
    meetingId: string;
    deliveryIds: readonly string[];
}): readonly {
    id: string;
    deliveryId: string;
    status: "pending" | "leased" | "delivered" | "failed";
}[] => {
    if (
        !input.meetingId.trim() ||
        input.deliveryIds.length === 0 ||
        input.deliveryIds.some((id) => !id.trim()) ||
        new Set(input.deliveryIds).size !== input.deliveryIds.length
    ) {
        throw new Error("Invalid acceptance outbox selection");
    }
    const catalog = input.storageDomain.get("convivium_catalog");
    if (!catalog) {
        throw new Error("Acceptance catalog is not open");
    }
    const record = CatalogMeetingRecordSchema.parse(
        catalog.table("meetings").get(catalogKey(input.meetingId))
    );
    const name = meetingDomainName(input.meetingId);
    if (
        record.meetingId !== input.meetingId ||
        record.domainName !== name ||
        record.status !== "ready"
    ) {
        throw new Error("Acceptance meeting identity is unavailable");
    }
    const domain = input.storageDomain.get(name);
    if (!domain) {
        throw new Error("Acceptance meeting domain is not open");
    }
    const projection = loadProjection({ domain });
    if (projection.snapshot?.meetingId !== input.meetingId) {
        throw new Error("Acceptance snapshot identity mismatch");
    }
    return Object.freeze(
        input.deliveryIds.map((deliveryId) => {
            const items = Object.values(projection.outbox).filter(
                (item) => item.deliveryId === deliveryId
            );
            if (items.length !== 1) {
                throw new Error("Acceptance delivery is missing or ambiguous");
            }
            const { id, status } = items[0];
            return Object.freeze({ id, deliveryId, status });
        })
    );
};
