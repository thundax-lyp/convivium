import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingPanelOverview } from "@/client/meeting/regions/workspace/overview/index.ts";
import { withMeetingTranslation } from "./meeting-panel-locale-fixtures.ts";
import { activeTimelineFixture, archiveTimelineFixture } from "./meeting-timeline-fixtures.ts";

afterEach(cleanup);

describe("Meeting overview round records", () => {
    it("keeps messages, evidence and reviews together in contributor name order", () => {
        const detail = structuredClone(archiveTimelineFixture());
        detail.rounds[0].status = "published";
        const archive = detail.archive!;
        const firstBundle = archive.evidenceBundles[0];
        archive.identityProvenance.find(
            (item) => item.identityId === "contributor-v1"
        )!.displayName = "乙";
        archive.identityProvenance.push({
            identityId: "contributor-v2",
            displayName: "甲",
            roles: ["contributor"]
        });
        const secondBundle = {
            ...firstBundle,
            packageId: "package-2",
            authorIdentityId: "contributor-v2",
            version: { ...firstBundle.version, id: "version-2", observation: "observation B" },
            review: {
                ...firstBundle.review,
                id: "review-2",
                versionId: "version-2",
                scope: "review B"
            }
        };
        archive.evidenceBundles = [secondBundle, firstBundle];
        archive.publications[0].finalVersionIds = ["version-1", "version-2"];
        archive.publications[0].finalReviewIds = ["review-1", "review-2"];
        archive.messages = [
            {
                ...archive.messages[0],
                id: "message-2",
                seq: 2,
                actorId: "contributor-v1",
                relatedIds: ["version-1", "review-1"],
                body: "second message"
            },
            {
                ...archive.messages[0],
                actorId: "contributor-v2",
                relatedIds: ["version-2", "review-2"],
                body: "first message"
            }
        ];

        const { rerender } = render(
            withMeetingTranslation(<MeetingPanelOverview detail={detail} />, "zh")
        );

        const records = screen.getByRole("region", { name: "记录" });
        const firstRound = within(records).getByRole("region", {
            name: "round question: 已发布"
        });
        expect(within(firstRound).getByRole("heading", { level: 5 }).textContent).toBe(
            "✅ round question"
        );
        const rows = within(firstRound)
            .getAllByRole("listitem")
            .map((item) => item.textContent ?? "");
        const messageRow = within(firstRound)
            .getAllByRole("listitem")
            .find((item) => item.textContent?.includes("first message"));
        const reviewRow = within(firstRound)
            .getAllByRole("listitem")
            .find((item) => item.textContent?.includes("review B"));
        expect(messageRow?.textContent).toBe("💡first message");
        expect(messageRow?.getAttribute("aria-label")).toBe("观点");
        expect(reviewRow?.textContent).toBe("💬review B");
        expect(reviewRow?.getAttribute("aria-label")).toBe("审核");
        expect(within(firstRound).queryByText("审核完成")).toBeNull();
        const evidenceRow = within(firstRound)
            .getAllByRole("button", { name: /查看证据/ })[0]
            .closest("li");
        expect(evidenceRow?.className).toBe(messageRow?.className);
        expect(
            within(firstRound)
                .getAllByRole("heading", { level: 6 })
                .map((item) => item.textContent)
        ).toEqual(["甲", "乙"]);
        expect(rows.join("\n")).not.toContain("observation B");
        expect(rows.findIndex((text) => text.includes("first message"))).toBeLessThan(
            rows.findIndex((text) => text.includes("review B"))
        );
        expect(rows.findIndex((text) => text.includes("review B"))).toBeLessThan(
            rows.findIndex((text) => text.includes("second message"))
        );
        expect(rows.findIndex((text) => text.includes("first message"))).toBeLessThan(
            rows.findIndex((text) => text.includes("second message"))
        );
        expect(within(firstRound).getAllByRole("button", { name: /查看证据/ })).toHaveLength(2);
        expect(rows.join("\n")).toContain("轮次发布: publication-1");
        expect(rows.join("\n")).not.toContain("reason A");
        expect(screen.queryByRole("region", { name: "证据" })).toBeNull();
        expect(screen.queryByRole("region", { name: "会议发言" })).toBeNull();

        rerender(withMeetingTranslation(<MeetingPanelOverview detail={detail} />, "en"));
        const englishRound = within(screen.getByRole("region", { name: "Records" })).getByRole(
            "region",
            { name: "round question: Published" }
        );
        expect(
            within(englishRound)
                .getAllByRole("heading", { level: 6 })
                .map((item) => item.textContent)
        ).toEqual(["甲", "乙"]);
    });

    it("keeps caller-visible review delivery failures with an unpublished round", () => {
        const detail = structuredClone(activeTimelineFixture());
        detail.rounds[0].status = "open";
        detail.publications = [];
        detail.messages = [];
        detail.reviewDeliveries = [
            {
                id: "delivery-1",
                reviewId: "review-1",
                authorId: "contributor-v1",
                status: "failed",
                failedAt: 29,
                failureReason: "dispatch_failed"
            }
        ];

        render(withMeetingTranslation(<MeetingPanelOverview detail={detail} />, "zh"));

        const records = screen.getByRole("region", { name: "记录" });
        const firstRound = within(records).getByRole("region", { name: /round question/ });
        expect(within(firstRound).getByRole("button", { name: /查看证据/ })).toBeTruthy();
        expect(within(firstRound).getByText(/review scope/)).toBeTruthy();
        expect(within(firstRound).queryByText("审核完成")).toBeNull();
        expect(within(firstRound).getByText(/dispatch_failed/)).toBeTruthy();
        expect(within(firstRound).queryByText(/publication-1/)).toBeNull();
        expect(screen.queryByRole("region", { name: "证据" })).toBeNull();
    });

    it("shows preparation and review progress before a formal message exists", () => {
        const detail = structuredClone(activeTimelineFixture());
        detail.publications = [];
        detail.messages = [];
        detail.evidenceReviews = [];
        detail.evidencePackages[0].currentVersion.status = "validating";
        detail.rounds[0].contributions = [
            {
                id: "contribution-preparing",
                contributorId: "contributor-v2",
                status: "preparing",
                substantiveSupplementCount: 0
            }
        ];

        render(withMeetingTranslation(<MeetingPanelOverview detail={detail} />, "zh"));

        const round = within(screen.getByRole("region", { name: "记录" })).getByRole("region", {
            name: /round question/
        });
        expect(within(round).getByText("准备中")).toBeTruthy();
        expect(within(round).getByText("审核中")).toBeTruthy();
        expect(within(round).queryByRole("listitem", { name: "观点" })).toBeNull();
        expect(within(round).getByRole("button", { name: /查看证据/ })).toBeTruthy();
    });

    it("shows the original body when a legacy message has no summary", () => {
        const detail = structuredClone(archiveTimelineFixture());
        detail.archive!.messages[0].kind = "round_evidence";
        detail.archive!.messages[0].actorId = "contributor-v1";
        detail.archive!.messages[0].relatedIds = ["version-1", "review-1"];
        detail.archive!.messages[0].body = "观察：完整历史原文";
        render(withMeetingTranslation(<MeetingPanelOverview detail={detail} />, "zh"));
        expect(screen.queryByText("历史记录未提供观点摘要")).toBeNull();
        expect(screen.getByText("观察：完整历史原文")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /查看证据/ }));
        expect(screen.getByRole("dialog", { name: /round question/ }).textContent).toContain(
            "观察：完整历史原文"
        );
    });

    it("shows a submitted summary while publication is pending", () => {
        const detail = structuredClone(activeTimelineFixture());
        detail.messages = [];
        detail.publications = [];
        detail.rounds[0].status = "open";
        detail.evidencePackages[0].currentVersion.summary = "作者提交的观点摘要";
        render(withMeetingTranslation(<MeetingPanelOverview detail={detail} />, "zh"));
        expect(screen.getByText("作者提交的观点摘要")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /查看证据/ }));
        expect(screen.getByRole("dialog", { name: /round question/ }).textContent).toContain(
            "作者提交的观点摘要"
        );
    });

    it("opens a complete caller-visible evidence version in a dismissible modal", () => {
        const detail = structuredClone(activeTimelineFixture());
        const version = detail.evidencePackages[0].currentVersion;
        version.observation =
            "## 证据发现\n\n**observation**\n\n- 第一条\n- 第二条\n\n| 来源 | 结果 |\n| --- | --- |\n| A | B |\n\n```ts\nconst value = 1;\n```";
        version.falsifiers = [{ value: "反证条件", reason: "反证理由" }];
        version.uncertainties = [{ value: "不确定性" }];
        version.limitations = [{ value: "适用限制" }];
        version.claims = [
            {
                id: "claim-1",
                statement: "具体主张",
                materialIds: ["material-1"],
                qualification: "主张限定"
            }
        ];
        version.materials = [
            {
                id: "material-1",
                kind: "document",
                originator: "原作者",
                originalSource: "原始来源",
                sourcePublishedAt: "2026-01-01",
                acquiredAt: "2026-01-02",
                version: "v1",
                locator: "来源定位",
                location: "引用位置",
                verificationConditions: "核验条件",
                limitations: "资料限制",
                sharedDependencies: ["共享依赖"]
            }
        ];

        render(withMeetingTranslation(<MeetingPanelOverview detail={detail} />, "zh"));
        expect(screen.queryByRole("dialog", { name: /round question/ })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /查看证据/ }));

        const dialog = screen.getByRole("dialog", { name: /round question/ });
        expect(within(dialog).getByText("contributor-v1")).toBeTruthy();
        expect(within(dialog).getByText("审核完成")).toBeTruthy();
        expect(within(dialog).queryByText(/审核状态|提交时间/)).toBeNull();
        expect(within(dialog).queryByText("版本序号")).toBeNull();
        expect(within(dialog).queryByText("审核失败次数")).toBeNull();
        expect(dialog.getAttribute("aria-label")).toBe("round question");
        expect(within(dialog).getByRole("heading", { name: "证据发现" })).toBeTruthy();
        expect(within(dialog).getByRole("table")).toBeTruthy();
        expect(within(dialog).getByText("observation").tagName).toBe("STRONG");
        for (const text of [
            "observation",
            "interpretation",
            "method",
            "反证条件",
            "反证理由",
            "不确定性",
            "适用限制",
            "具体主张",
            "material-1",
            "主张限定",
            "原作者",
            "原始来源",
            "2026-01-01",
            "2026-01-02",
            "v1",
            "来源定位",
            "引用位置",
            "核验条件",
            "资料限制",
            "共享依赖"
        ]) {
            expect(dialog.textContent).toContain(text);
        }
        fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
        expect(screen.queryByRole("dialog", { name: /round question/ })).toBeNull();
    });
});

describe("Meeting overview contributor participation records", () => {
    it("shows declined and unanswered invitations as individual contributor records", () => {
        const detail = structuredClone(activeTimelineFixture());
        detail.rounds[0].invitedContributorIds = [
            "contributor-v1",
            "contributor-v2",
            "contributor-v3",
            "contributor-v4"
        ];
        detail.rounds[0].participationResponses = [
            { contributorId: "contributor-v1", status: "declined", recordedAt: 22 },
            { contributorId: "contributor-v2", status: "declined", recordedAt: 23 },
            { contributorId: "contributor-v3", status: "no_response", recordedAt: 24 },
            { contributorId: "contributor-v4", status: "raised", recordedAt: 25 }
        ];

        render(withMeetingTranslation(<MeetingPanelOverview detail={detail} />, "zh"));

        const records = screen.getByRole("region", { name: "记录" });
        const firstRound = within(records).getByRole("region", { name: /round question/ });
        expect(within(firstRound).getByText("contributor-v2")).toBeTruthy();
        expect(within(firstRound).getByText("contributor-v3")).toBeTruthy();
        expect(
            within(firstRound)
                .getAllByRole("listitem")
                .filter((item) => item.textContent?.includes("不举手"))
        ).toHaveLength(2);
        expect(
            within(firstRound)
                .getByText(/期限内未回应/)
                .closest("li")?.textContent
        ).not.toContain("不举手");
        expect(within(firstRound).queryByText(/已举手/)).toBeNull();
        expect(screen.queryByRole("region", { name: "进展" })).toBeNull();
    });

    it("places failed contributions among contributor records without fabricating evidence or speech", () => {
        const detail = structuredClone(archiveTimelineFixture());
        detail.rounds[0].status = "published";
        detail.rounds[0].contributions = [
            {
                id: "contribution-failed",
                contributorId: "contributor-failed",
                status: "execution_failed",
                substantiveSupplementCount: 0,
                exitReason: "worker failed",
                failure: {
                    sourceEffectId: "effect-failed",
                    stage: "contributor_turn",
                    failureCode: "TURN_FAILED",
                    failureSummary: "tool crashed",
                    attemptCount: 1,
                    retryable: false,
                    occurredAt: 26
                }
            }
        ];
        detail.archive!.identityProvenance.push({
            identityId: "contributor-failed",
            displayName: "甲失败贡献者",
            roles: ["contributor"]
        });
        detail.rounds[0].participationResponses = [
            { contributorId: "contributor-declined", status: "declined", recordedAt: 26 }
        ];
        detail.archive!.publications[0].contributionFailures = [
            {
                contributionId: "contribution-failed",
                failure: detail.rounds[0].contributions[0].failure!
            }
        ];

        render(withMeetingTranslation(<MeetingPanelOverview detail={detail} />, "zh"));

        const records = screen.getByRole("region", { name: "记录" });
        const round = within(records).getByRole("region", { name: /round question/ });
        const text = round.textContent ?? "";
        expect(text).toContain("取证失败");
        expect(text).toContain("甲失败贡献者");
        expect(text).toContain("tool crashed");
        expect(
            within(round)
                .getAllByRole("heading", { level: 6 })
                .map((item) => item.textContent)
        ).toEqual(["甲失败贡献者", "contributor-declined", "contributor-v1", "manager-v1"]);
        expect(text.indexOf("取证失败")).toBeLessThan(text.indexOf("查看证据"));
        expect(within(round).getAllByRole("button", { name: /查看证据/ })).toHaveLength(1);
        expect(
            within(round)
                .getAllByRole("listitem", { name: "观点" })
                .some((item) => item.textContent?.includes("tool crashed"))
        ).toBe(false);
    });

    it("puts failed evidence validation after other submitted evidence", () => {
        const detail = structuredClone(activeTimelineFixture());
        detail.rounds[0].status = "open";
        detail.publications = [];
        detail.messages = [];
        detail.evidencePackages.push({
            ...detail.evidencePackages[0],
            id: "package-failed",
            contributionId: "contribution-failed-validation",
            authorId: "contributor-v2",
            currentVersion: {
                ...detail.evidencePackages[0].currentVersion,
                id: "version-failed",
                status: "validation_failed",
                failureCount: 1,
                lastFailureReason: "review_timeout"
            }
        });

        render(withMeetingTranslation(<MeetingPanelOverview detail={detail} />, "zh"));

        const round = within(screen.getByRole("region", { name: "记录" })).getByRole("region", {
            name: /round question/
        });
        expect(within(round).getAllByRole("button", { name: /查看证据/ })).toHaveLength(2);
        expect(within(round).getByText("审核失败").closest("li")?.textContent).toContain("⚠️");
    });
});
