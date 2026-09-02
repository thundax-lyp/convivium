import type { Domain, KvTable } from "@deepseek-ai/dsh-storage-domain";
import type { DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import type { CatalogDomain, MeetingDomain } from "../../src/repository/domain/specs.js";
import { catalogDomainSpec, createMeetingDomainSpec } from "../../src/repository/domain/specs.js";

type Failure = { table: string; key: string };

class FakeTable<K extends string, V> implements KvTable<K, V> {
    private readonly values = new Map<K, V>();
    private failure: Failure | undefined;
    readonly putCalls: Array<{ table: string; key: string; value: V }> = [];
    readonly deleteCalls: Array<{ table: string; key: string }> = [];
    constructor(
        private readonly tableName: string,
        initial: ReadonlyMap<K, V>
    ) {
        for (const [key, value] of initial) this.values.set(key, value);
    }
    get(key: K): V | undefined {
        return this.values.get(key);
    }
    entries(): IterableIterator<[K, V]> {
        return new Map(this.values).entries();
    }
    keys(): IterableIterator<K> {
        return new Map(this.values).keys();
    }
    get size(): number {
        return this.values.size;
    }
    failNextPut(table: string, key: string): void {
        this.failure = { table, key };
    }
    failNextDelete(table: string, key: string): void {
        this.failure = { table, key };
    }
    async put(key: K, value: V): Promise<void> {
        this.putCalls.push({ table: this.tableName, key, value });
        if (this.failure?.table === this.tableName && this.failure.key === key) {
            this.failure = undefined;
            throw new Error("fake put failure");
        }
        this.values.set(key, value);
    }
    async delete(key: K): Promise<boolean> {
        this.deleteCalls.push({ table: this.tableName, key });
        if (this.failure?.table === this.tableName && this.failure.key === key) {
            this.failure = undefined;
            throw new Error("fake delete failure");
        }
        return this.values.delete(key);
    }
    async update(key: K, fn: (current: V) => V): Promise<V> {
        const current = this.values.get(key);
        if (current === undefined) throw new Error("missing-key");
        const next = fn(current);
        await this.put(key, next);
        return next;
    }
}

function fakeDomain<S extends DomainSpec>(
    spec: S,
    values?: Record<string, ReadonlyMap<string, unknown>>
): Domain<S> {
    const tables = new Map<string, FakeTable<string, unknown>>();
    for (const name of Object.keys(spec.tables))
        tables.set(name, new FakeTable(name, values?.[name] ?? new Map()));
    const domain = {
        name: spec.name,
        global: undefined,
        table(name: string) {
            const table = tables.get(name);
            if (!table) throw new Error("unknown table");
            return table;
        },
        async close() {}
    } as Domain<S>;
    Object.defineProperty(domain, "__tables", { value: tables });
    return domain;
}

export function createFakeCatalogDomain(): CatalogDomain {
    return fakeDomain(catalogDomainSpec);
}
export function createFakeMeetingDomain(name = "convivium_m_test"): MeetingDomain {
    return fakeDomain(createMeetingDomainSpec(name));
}
export function createFakeDomainFacility(): {
    open: <S extends DomainSpec>(spec: S) => Promise<Domain<S>>;
} {
    return {
        async open<S extends DomainSpec>(spec: S): Promise<Domain<S>> {
            return fakeDomain(spec);
        }
    };
}
