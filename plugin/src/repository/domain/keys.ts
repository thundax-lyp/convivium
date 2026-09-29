import { encodeCanonicalJson, sha256Hex } from "./canonical-json.ts";

const encoder = new TextEncoder();

export type SeqKey = string;
export type CatalogKey = string;
export type ReceiptKey = string;

export const catalogKey = (meetingId: string): CatalogKey => {
    return sha256Hex(encodeCanonicalJson(meetingId));
};

export const meetingIdFor = (requestId: string): string => {
    return `meeting-${sha256Hex(encoder.encode(requestId)).slice(0, 32)}`;
};

export const meetingDomainName = (meetingId: string): string => {
    return `convivium_m_${sha256Hex(encoder.encode(meetingId)).slice(0, 32)}`;
};

export const seqKey = (seq: number): SeqKey => {
    if (!Number.isSafeInteger(seq) || seq < 1) {
        throw new Error("invalid sequence");
    }
    return seq.toString().padStart(20, "0");
};

export const receiptKey = (
    requestId: string,
    commandKind: string,
    callerBinding: string
): ReceiptKey => {
    return Buffer.from(encodeCanonicalJson([requestId, commandKind, callerBinding])).toString(
        "base64url"
    );
};

export const generation = (baseSeq: number, projectionDigest: string): string => {
    return `${seqKey(baseSeq)}_${projectionDigest.slice(0, 16)}`;
};
