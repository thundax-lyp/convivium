import type { MeetingDomain } from "./specs.ts";

/** Only plugin-owned business tables; Session persistence is a separate Host resource. */
export const purgeMeetingData = async (domain: MeetingDomain): Promise<void> => {
    for (const name of ["commits", "checkpoint_pages", "checkpoint_roots"] as const) {
        const table = domain.table(name);
        for (const key of [...table.keys()]) {
            await table.delete(key);
        }
    }
    await domain.table("checkpoint_pointer").delete("current");
    await domain.table("creation").delete("current");
};
