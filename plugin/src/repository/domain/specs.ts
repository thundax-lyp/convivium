import { z } from "zod";
import { UnsupportedMeetingStateFormatError } from "./projection.js";
import { defineDomain, domainTable, type Domain } from "@deepseek-ai/dsh-storage-domain";
import {
    CheckpointPageSchema,
    CheckpointPointerSchema,
    CheckpointRootSchema,
    CatalogMeetingRecordSchema,
    CommitRecordSchema,
    CreationRecordSchema
} from "./schemas.js";
import type {
    CatalogMeetingRecord,
    CheckpointPage,
    CheckpointPointer,
    CheckpointRoot,
    CommitRecord,
    CreationRecord
} from "./schemas.js";
import type { CatalogKey, SeqKey } from "./keys.js";

export const catalogDomainSpec = defineDomain({
    name: "convivium_catalog",
    version: 1,
    tables: {
        meetings: domainTable<CatalogKey, CatalogMeetingRecord>(CatalogMeetingRecordSchema)
    }
});
export function createMeetingDomainSpec(name: string) {
    return defineDomain({
        name,
        version: 1,
        tables: {
            creation: domainTable<"current", CreationRecord>(
                z.preprocess((value) => {
                    if (
                        value &&
                        typeof value === "object" &&
                        "formatVersion" in value &&
                        value.formatVersion !== 2
                    )
                        throw new UnsupportedMeetingStateFormatError(value.formatVersion);
                    return value;
                }, CreationRecordSchema)
            ),
            commits: domainTable<SeqKey, CommitRecord>(CommitRecordSchema),
            checkpoint_pages: domainTable<string, CheckpointPage>(CheckpointPageSchema),
            checkpoint_roots: domainTable<string, CheckpointRoot>(CheckpointRootSchema),
            checkpoint_pointer: domainTable<"current", CheckpointPointer>(CheckpointPointerSchema)
        }
    });
}
export type CatalogDomain = Domain<typeof catalogDomainSpec>;
export type MeetingDomain = Domain<ReturnType<typeof createMeetingDomainSpec>>;
