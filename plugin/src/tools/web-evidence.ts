import { defineTool } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import { parseWebEvidence } from "@/evidence-content/index.ts";
import type { MeetingCommandToolDependencies } from "./register-tools.ts";

export const registerWebEvidenceTool = (dependencies: MeetingCommandToolDependencies) =>
    dependencies.registry.register(
        defineTool({
            name: "convivium_submit_web_evidence",
            description:
                "Submit web-evidence.txt from your own cwd after writing the content format defined in the web Skill. The program parses and validates evidence, assembles the current protocol envelope, and submits once. No candidate JSON, path, version or PASS fields are accepted. Fix reported content errors in the file; only accepted means registered. Do not retry an unknown outcome without reading Meeting facts.",
            parameters: {
                meetingId: { type: "string", required: true },
                contributionId: { type: "string", required: true },
                requestId: { type: "string", required: true }
            },
            output: {
                schema: { type: "json" },
                render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
            },
            async execute(args, exec) {
                const reject = (code: string, message: string) => ({
                    kind: "rejected",
                    error: { code, message }
                });
                if (!exec.agent) {
                    return reject("UNAUTHORIZED", "An active Web Contributor is required");
                }
                const caller = await dependencies.callers.resolve(exec.agent, exec.signal);
                if (
                    !caller ||
                    caller.meetingId !== args.meetingId ||
                    caller.role !== "participant" ||
                    caller.ownership.definition.agentDefinitionId !==
                        "convivium.web_research_analyst"
                ) {
                    return reject(
                        "UNAUTHORIZED",
                        "Only the bound Web Contributor can submit its evidence content"
                    );
                }
                const view = await dependencies.reader.read(
                    { protocolVersion: 1, meetingId: args.meetingId },
                    caller,
                    exec.signal
                );
                const round = view?.rounds.find(
                    (r) =>
                        r.status === "open" &&
                        r.contributions.some(
                            (c) =>
                                c.id === args.contributionId &&
                                c.contributorId === caller.identityId &&
                                c.status === "preparing" &&
                                !c.packageId
                        )
                );
                if (
                    !view ||
                    view.lifecycle.status !== "running" ||
                    !round ||
                    !dependencies.readWebEvidence
                ) {
                    return reject(
                        "PRECONDITION_FAILED",
                        "An open, unsubmitted Web Contribution and content reader are required; reread Meeting facts"
                    );
                }
                let evidence;
                try {
                    evidence = parseWebEvidence(
                        await dependencies.readWebEvidence(exec.agent, exec.signal)
                    );
                } catch (error) {
                    exec.signal.throwIfAborted();
                    return reject(
                        "INVALID_ARGUMENT",
                        error instanceof Error ? error.message : "Invalid Web evidence content"
                    );
                }
                exec.signal.throwIfAborted();
                return (await dependencies.application.execute(
                    {
                        protocolVersion: 1,
                        meetingId: view.meetingId,
                        expectedMeetingVersion: view.version,
                        requestId: args.requestId,
                        action: {
                            kind: "submit_evidence",
                            contributionId: args.contributionId,
                            evidence
                        }
                    },
                    { caller: caller.caller },
                    exec.signal
                )) as unknown as JsonValue;
            }
        })
    );
