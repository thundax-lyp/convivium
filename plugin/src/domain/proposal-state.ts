import type { MeetingState, MeetingProposal } from "./model.js";

/** Independent proposals have independent revision sequences. */
export function currentProposals(state: MeetingState): MeetingProposal[] {
    const latest = new Map<string, MeetingProposal>();
    for (const proposal of state.proposals) {
        const previous = latest.get(proposal.id);
        if (previous === undefined || previous.revision < proposal.revision) {
            latest.set(proposal.id, proposal);
        }
    }
    return [...latest.values()];
}

export function blockingPositions(proposal: MeetingProposal) {
    return proposal.positions.filter(
        (position) =>
            position.proposalRevision === proposal.revision &&
            position.blocking &&
            (position.position === "object" || position.position === "needs_revision")
    );
}
