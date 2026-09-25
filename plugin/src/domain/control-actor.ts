import { createHash } from "node:crypto";

export const captainActorIdFor = (meetingId: string): string =>
    `captain_actor-${createHash("sha256")
        .update(JSON.stringify([meetingId, "captain_actor", "captain"]))
        .digest("hex")
        .slice(0, 32)}`;
