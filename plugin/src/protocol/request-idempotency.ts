export function serializeValidatedRequest(value: object): string {
    const canonicalize = (input: unknown): unknown => {
        if (Array.isArray(input)) return input.map(canonicalize);
        if (input && typeof input === "object") {
            return Object.fromEntries(
                Object.entries(input)
                    .sort(([left], [right]) => left.localeCompare(right))
                    .map(([key, child]) => [key, canonicalize(child)])
            );
        }
        return input;
    };
    const serialized = JSON.stringify(canonicalize(value));
    if (serialized === undefined) {
        throw new TypeError("Validated request cannot be serialized");
    }
    return serialized;
}
