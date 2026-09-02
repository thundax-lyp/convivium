import type { Domain, KvTable } from "@deepseek-ai/dsh-storage-domain";
import type { DomainSpec } from "@deepseek-ai/dsh-storage-domain";
import type { CatalogDomain, MeetingDomain } from "../../src/repository/domain/specs.js";
import { catalogDomainSpec, createMeetingDomainSpec } from "../../src/repository/domain/specs.js";

export interface FakeDomainPutCall {
    readonly table: string;
    readonly key: string;
    readonly value: unknown;
}
export interface FakeDomainDeleteCall {
    readonly table: string;
    readonly key: string;
}
export interface FakeDomainControls {
    readonly putCalls: readonly FakeDomainPutCall[];
    readonly deleteCalls: readonly FakeDomainDeleteCall[];
    failNextPut(table: string, key: string): void;
    failNextDelete(table: string, key: string): void;
}
export type FakeCatalogDomain = CatalogDomain & FakeDomainControls;
export type FakeMeetingDomain = MeetingDomain & FakeDomainControls;
type Failure = { table: string; key: string; error: Error };

class Controller implements FakeDomainControls {
    readonly putCalls: FakeDomainPutCall[] = [];
    readonly deleteCalls: FakeDomainDeleteCall[] = [];
    private putFailure: Failure | undefined;
    private deleteFailure: Failure | undefined;
    failNextPut(table: string, key: string): void {
        if (this.putFailure) throw new Error("put failure already armed");
        this.putFailure = { table, key, error: new Error("fake put failure") };
    }
    failNextDelete(table: string, key: string): void {
        if (this.deleteFailure) throw new Error("delete failure already armed");
        this.deleteFailure = { table, key, error: new Error("fake delete failure") };
    }
    recordPut(table: string, key: string, value: unknown): Error | undefined {
        this.putCalls.push({ table, key, value });
        if (this.putFailure?.table === table && this.putFailure.key === key) {
            const error = this.putFailure.error;
            this.putFailure = undefined;
            return error;
        }
        return undefined;
    }
    recordDelete(table: string, key: string): Error | undefined {
        this.deleteCalls.push({ table, key });
        if (this.deleteFailure?.table === table && this.deleteFailure.key === key) {
            const error = this.deleteFailure.error;
            this.deleteFailure = undefined;
            return error;
        }
        return undefined;
    }
}

class FakeTable<K extends string, V> implements KvTable<K, V> {
    private readonly values = new Map<K, V>();
    constructor(
        private readonly tableName: string,
        initial: ReadonlyMap<K, V>,
        private readonly controller: Controller
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
    async put(key: K, value: V): Promise<void> {
        const error = this.controller.recordPut(this.tableName, key, value);
        if (error) throw error;
        this.values.set(key, value);
    }
    async delete(key: K): Promise<boolean> {
        const error = this.controller.recordDelete(this.tableName, key);
        if (error) throw error;
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
    values: Record<string, ReadonlyMap<string, unknown>> | undefined,
    controller: Controller
): Domain<S> & FakeDomainControls {
    const tables = new Map<string, FakeTable<string, unknown>>();
    for (const [name, initial] of Object.entries(values ?? {}))
        if (!(name in spec.tables)) throw new Error("unknown table");
    for (const name of Object.keys(spec.tables)) {
        const parsed = new Map<string, unknown>();
        for (const [key, value] of values?.[name] ?? [])
            parsed.set(key, spec.tables[name]!.valueSchema.parse(value));
        tables.set(name, new FakeTable(name, parsed, controller));
    }
    const domain = {
        name: spec.name,
        global: undefined,
        table(name: string) {
            const table = tables.get(name);
            if (!table) throw new Error("unknown table");
            return table;
        },
        async close() {},
        putCalls: controller.putCalls,
        deleteCalls: controller.deleteCalls,
        failNextPut: controller.failNextPut.bind(controller),
        failNextDelete: controller.failNextDelete.bind(controller)
    } as Domain<S> & FakeDomainControls;
    Object.defineProperty(domain, "__tables", { value: tables });
    return domain;
}

export function createFakeCatalogDomain(
    initial?: Record<string, ReadonlyMap<string, unknown>>
): FakeCatalogDomain {
    return fakeDomain(catalogDomainSpec, initial, new Controller());
}
export function createFakeMeetingDomain(
    options:
        | string
        | {
              name?: string;
              initial?: Record<string, ReadonlyMap<string, unknown>>;
          } = "convivium_m_test"
): FakeMeetingDomain {
    const input = typeof options === "string" ? { name: options } : options;
    return fakeDomain(
        createMeetingDomainSpec(input.name ?? "convivium_m_test"),
        input.initial,
        new Controller()
    );
}
export function createFakeDomainFacility(): {
    open: <S extends DomainSpec>(spec: S) => Promise<Domain<S>>;
} {
    return {
        async open<S extends DomainSpec>(spec: S): Promise<Domain<S>> {
            return fakeDomain(spec, undefined, new Controller());
        }
    };
}
