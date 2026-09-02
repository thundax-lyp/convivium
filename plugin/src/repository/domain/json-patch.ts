import type { JsonValue } from "./canonical-json.js";

export type JsonPath = readonly (string | number)[];
export type JsonPatchOperationV1 =
    | { readonly op: "remove"; readonly path: JsonPath }
    | { readonly op: "set"; readonly path: JsonPath; readonly value: JsonValue }
    | {
          readonly op: "splice";
          readonly path: JsonPath;
          readonly start: number;
          readonly deleteCount: number;
          readonly items: readonly JsonValue[];
      };

const dangerous = new Set(["__proto__", "prototype", "constructor"]);
function jsonEqual(a: JsonValue, b: JsonValue): boolean {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) && Array.isArray(b))
        return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]!));
    if (
        a &&
        b &&
        typeof a === "object" &&
        typeof b === "object" &&
        !Array.isArray(a) &&
        !Array.isArray(b)
    ) {
        const ak = Object.keys(a).sort(),
            bk = Object.keys(b).sort();
        return (
            ak.length === bk.length &&
            ak.every((key, i) => key === bk[i] && jsonEqual(a[key]!, b[key]!))
        );
    }
    return false;
}
function clone(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === "object") {
        const result: { [key: string]: JsonValue } = Object.create(null);
        for (const key of Object.keys(value)) {
            if (dangerous.has(key)) throw new Error("dangerous key");
            result[key] = clone(value[key]!);
        }
        return result;
    }
    return value;
}

export function diff(previous: JsonValue, next: JsonValue): JsonPatchOperationV1[] {
    const operations: JsonPatchOperationV1[] = [];
    const walk = (a: JsonValue, b: JsonValue, path: JsonPath): void => {
        if (Array.isArray(a) && Array.isArray(b)) {
            let prefix = 0;
            while (prefix < a.length && prefix < b.length && jsonEqual(a[prefix]!, b[prefix]!))
                prefix++;
            let suffix = 0;
            while (
                suffix < a.length - prefix &&
                suffix < b.length - prefix &&
                jsonEqual(a[a.length - 1 - suffix]!, b[b.length - 1 - suffix]!)
            )
                suffix++;
            if (prefix !== a.length || prefix !== b.length)
                operations.push({
                    op: "splice",
                    path,
                    start: prefix,
                    deleteCount: a.length - prefix - suffix,
                    items: b.slice(prefix, b.length - suffix).map(clone)
                });
            return;
        }
        if (
            a &&
            b &&
            typeof a === "object" &&
            typeof b === "object" &&
            !Array.isArray(a) &&
            !Array.isArray(b)
        ) {
            const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
            for (const key of keys)
                if (!Object.prototype.hasOwnProperty.call(b, key))
                    operations.push({ op: "remove", path: [...path, key] });
            for (const key of keys)
                if (
                    Object.prototype.hasOwnProperty.call(a, key) &&
                    Object.prototype.hasOwnProperty.call(b, key)
                )
                    walk(a[key]!, b[key]!, [...path, key]);
            for (const key of keys)
                if (!Object.prototype.hasOwnProperty.call(a, key))
                    operations.push({ op: "set", path: [...path, key], value: clone(b[key]!) });
            return;
        }
        if (!jsonEqual(a, b)) operations.push({ op: "set", path, value: clone(b) });
    };
    walk(previous, next, []);
    return operations;
}

function readPath(root: JsonValue, path: JsonPath): JsonValue {
    let current = root;
    for (const part of path) {
        if (Array.isArray(current)) {
            if (
                typeof part !== "number" ||
                !Number.isInteger(part) ||
                part < 0 ||
                part >= current.length
            )
                throw new Error("invalid array path");
            current = current[part]!;
        } else if (current && typeof current === "object") {
            if (
                typeof part !== "string" ||
                dangerous.has(part) ||
                !Object.prototype.hasOwnProperty.call(current, part)
            )
                throw new Error("invalid object path");
            current = current[part]!;
        } else {
            throw new Error("invalid object path");
        }
    }
    return current;
}

function locate(root: JsonValue, path: JsonPath): { parent: JsonValue; key: string | number } {
    if (!path.length) throw new Error("root path has no parent");
    const parent = readPath(root, path.slice(0, -1));
    const key = path[path.length - 1]!;
    if (Array.isArray(parent)) {
        if (typeof key !== "number" || !Number.isInteger(key) || key < 0 || key >= parent.length)
            throw new Error("invalid array path");
    } else if (
        !parent ||
        typeof parent !== "object" ||
        typeof key !== "string" ||
        dangerous.has(key)
    ) {
        throw new Error("invalid object path");
    }
    return { parent, key };
}

export function applyPatch(
    input: JsonValue,
    operations: readonly JsonPatchOperationV1[]
): JsonValue {
    let root = clone(input);
    for (const operation of operations) {
        if (!operation.path.length && operation.op === "set") {
            root = clone(operation.value);
            continue;
        }
        if (operation.op === "splice") {
            const target = readPath(root, operation.path);
            if (
                !Array.isArray(target) ||
                !Number.isInteger(operation.start) ||
                !Number.isInteger(operation.deleteCount) ||
                operation.start < 0 ||
                operation.deleteCount < 0 ||
                operation.start > target.length ||
                operation.start + operation.deleteCount > target.length
            )
                throw new Error("invalid splice");
            target.splice(operation.start, operation.deleteCount, ...operation.items.map(clone));
            continue;
        }
        const { parent, key } = locate(root, operation.path);
        if (Array.isArray(parent)) {
            if (
                typeof key !== "number" ||
                key < 0 ||
                key >= parent.length ||
                (operation.op === "set" && !Number.isInteger(key))
            )
                throw new Error("invalid array index");
            if (operation.op === "remove") parent.splice(key, 1);
            else parent[key] = clone(operation.value);
        } else {
            if (!parent || typeof parent !== "object" || typeof key !== "string")
                throw new Error("invalid object path");
            if (operation.op === "remove") {
                if (!Object.prototype.hasOwnProperty.call(parent, key))
                    throw new Error("invalid object path");
                delete parent[key];
            } else parent[key] = clone(operation.value);
        }
    }
    return root;
}
