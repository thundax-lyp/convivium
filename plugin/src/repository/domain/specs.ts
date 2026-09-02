import { defineDomain, domainTable, type Domain } from "@deepseek-ai/dsh-storage-domain";
import {
    CheckpointPageV1Schema,
    CheckpointPointerV1Schema,
    CheckpointRootV1Schema,
    CatalogMeetingRecordV1Schema,
    CommitRecordV1Schema,
    CreationRecordV1Schema
} from "./schemas.js";
import type {
    CatalogMeetingRecordV1,
    CheckpointPageV1,
    CheckpointPointerV1,
    CheckpointRootV1,
    CommitRecordV1,
    CreationRecordV1
} from "./schemas.js";
import type { CatalogKey, SeqKey } from "./keys.js";

export const catalogDomainSpec = defineDomain({
    name: "convivium_catalog",
    version: 1,
    tables: {
        meetings: domainTable<CatalogKey, CatalogMeetingRecordV1>(CatalogMeetingRecordV1Schema)
    }
});
export function createMeetingDomainSpec(name: string) {
    return defineDomain({
        name,
        version: 1,
        tables: {
            creation: domainTable<"current", CreationRecordV1>(CreationRecordV1Schema),
            commits: domainTable<SeqKey, CommitRecordV1>(CommitRecordV1Schema),
            checkpoint_pages: domainTable<string, CheckpointPageV1>(CheckpointPageV1Schema),
            checkpoint_roots: domainTable<string, CheckpointRootV1>(CheckpointRootV1Schema),
            checkpoint_pointer: domainTable<"current", CheckpointPointerV1>(
                CheckpointPointerV1Schema
            )
        }
    });
}
export type CatalogDomain = Domain<typeof catalogDomainSpec>;
export type MeetingDomain = Domain<ReturnType<typeof createMeetingDomainSpec>>;
