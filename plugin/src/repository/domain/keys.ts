import { encodeCanonicalJson, sha256Hex } from "./canonical-json.js";

const encoder = new TextEncoder();

export type SeqKey = string;
export type CatalogKey = string;
export type ReceiptKey = string;

export function catalogKey(teamId: string, meetingId: string): CatalogKey {
    return sha256Hex(encodeCanonicalJson([teamId, meetingId]));
}

export function meetingIdFor(teamId: string, requestId: string): string {
    return `meeting-${sha256Hex(encoder.encode(`${teamId}\0${requestId}`)).slice(0, 32)}`;
}

export function meetingDomainName(teamId: string, meetingId: string): string {
    return `convivium_m_${sha256Hex(encoder.encode(`${teamId}\0${meetingId}`)).slice(0, 32)}`;
}

export function seqKey(seq: number): SeqKey {
    if (!Number.isSafeInteger(seq) || seq < 1) throw new Error("invalid sequence");
    return seq.toString().padStart(20, "0");
}

export function receiptKey(
    requestId: string,
    commandKind: string,
    callerBinding: string
): ReceiptKey {
    return Buffer.from(encodeCanonicalJson([requestId, commandKind, callerBinding])).toString(
        "base64url"
    );
}

export function generation(baseSeq: number, projectionDigest: string): string {
    return `${seqKey(baseSeq)}_${projectionDigest.slice(0, 16)}`;
}
