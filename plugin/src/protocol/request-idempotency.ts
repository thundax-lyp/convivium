export function serializeValidatedRequestV1(value: object): string {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
        throw new TypeError("Validated request cannot be serialized");
    }
    return serialized;
}
