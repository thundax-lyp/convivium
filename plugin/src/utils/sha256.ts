import { createHash } from "node:crypto";

export const sha256Hex = (bytes: Uint8Array): string => {
    return createHash("sha256").update(bytes).digest("hex");
};
