export type RecordValue = Record<string, unknown>;

export function record(value: unknown): value is RecordValue {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function own(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

export function ref(value: unknown, values: ReadonlySet<string>): boolean {
    return typeof value === "string" && value.trim().length > 0 && values.has(value);
}

export function checkRefs(
    values: readonly string[],
    ids: ReadonlySet<string>,
    path: string
): string | undefined {
    for (let i = 0; i < values.length; i++) if (!ids.has(values[i])) return `${path}[${i}]`;
    return undefined;
}

export function indexById<T extends { id: string }>(items: readonly T[]) {
    return new Map(items.map((item) => [item.id, item] as const));
}

export function ownUndefined(value: object, key: string, path: string): string | undefined {
    return own(value, key) && (value as RecordValue)[key] === undefined ? path : undefined;
}

export function ids(targets: readonly { id: string }[]): Set<string> {
    return new Set(targets.map(({ id }) => id));
}

export function indexVersionOwners(state: import("@/domain/meeting-state.js").MeetingState) {
    return new Map(
        state.evidencePackages.flatMap((pack) =>
            pack.versions.map((version) => [version.id, pack] as const)
        )
    );
}
