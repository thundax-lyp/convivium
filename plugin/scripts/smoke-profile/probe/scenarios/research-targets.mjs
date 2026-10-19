import { readFile } from "node:fs/promises";
import { peerCreateCommand, peerSessionId, waitUntil } from "../support.mjs";

export const runResearchTargetsScenario = async (runtime) => {
    const { ctx, assert, remote, toolEvidence } = runtime;
    const questions = JSON.parse(
        await readFile(new URL("../research-questions.json", import.meta.url), "utf8")
    );
    assert(questions.length === 3, "Expected the three current QUESTIONS-DRAFT questions");
    const cases = await Promise.all(
        questions.map(async (question, index) => {
            const command = await peerCreateCommand(`research-targets-${index}`, question);
            command.action.objective.researchPlanning = { status: "pending" };
            command.action.participantRoleNames = [];
            command.action.limits.maxDurationMs = 2100000;
            const created = await remote("control", { command });
            assert(
                created.kind === "accepted",
                "Planning Meeting creation failed: " + JSON.stringify(created)
            );
            const meetingId = created.meetingId;
            const read = () => remote("read", { request: { protocolVersion: 1, meetingId } });
            const initial = await read();
            const managerId = initial.identities.find((i) => i.roles.includes("manager")).id;
            const sessionId = peerSessionId(meetingId, managerId);
            const manager = await runtime.waitForAgent(ctx, sessionId);
            const final = await waitUntil(
                async () => {
                    const view = await read();
                    const failedCall = [...toolEvidence.values()].find(
                        (t) =>
                            t.sessionId === sessionId &&
                            t.name === "convivium_plan_research" &&
                            t.isError
                    );
                    assert(!failedCall, "Planning tool failed before commit for " + meetingId);
                    return ["accepted", "failed"].includes(view.objective.researchPlanning?.status)
                        ? view
                        : undefined;
                },
                "Manager did not finish target planning",
                1800000
            );
            await manager.whenIdle();
            const evidence = [...toolEvidence.values()].filter((t) => t.sessionId === sessionId);
            const skillLoaded = evidence.some(
                (t) =>
                    t.name === "skill" &&
                    !t.isError &&
                    JSON.stringify(t.arguments).includes("research-planning")
            );
            const planningCalled = evidence.some(
                (t) =>
                    t.name === "convivium_plan_research" &&
                    !t.isError &&
                    t.value?.kind === "accepted"
            );
            assert(
                final.rounds.length === 0 && final.evidencePackages.length === 0,
                "Planning-only smoke started research work"
            );
            return {
                question,
                meetingId,
                sessionId,
                planning: final.objective.researchPlanning,
                requiredOutputs: final.objective.requiredOutputs,
                roundCount: final.rounds.length,
                skillLoaded,
                planningCalled
            };
        })
    );
    await runtime.writeResult({
        ok: cases.every(
            (c) => c.planning?.status === "accepted" && c.skillLoaded && c.planningCalled
        ),
        scenario: "research-targets",
        cases
    });
};
