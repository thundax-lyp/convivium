import * as React from "react";
import {
    useEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type ReactElement
} from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { MeetingPanelLayoutProps } from "@/client/meeting/shared/index.ts";
import { MeetingNavigator, MeetingWorkspace } from "@/client/meeting/regions/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";

const MeetingPanelLayout = ({ ctx }: { ctx: MeetingPanelLayoutProps }): ReactElement => {
    const t = useMeetingTranslate();
    const [narrow, setNarrow] = useState(
        () => window.matchMedia?.("(max-width: 760px)").matches ?? false
    );
    const [drawerOpen, setDrawerOpen] = useState(false);
    const openerRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        const query = window.matchMedia?.("(max-width: 760px)");
        if (query === undefined) {
            return;
        }
        const update = (event: MediaQueryListEvent) => {
            setNarrow(event.matches);
            if (!event.matches) {
                setDrawerOpen(false);
            }
        };
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    const closeDrawer = () => {
        setDrawerOpen(false);
        openerRef.current?.focus();
    };
    useEffect(() => {
        if (!drawerOpen) {
            return;
        }
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeDrawer();
            }
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [drawerOpen]);
    const selectMeeting = (meetingId: string) => {
        ctx.selectMeeting(meetingId);
        if (narrow) {
            closeDrawer();
        }
    };
    const selected = ctx.meetings.find((meeting) => meeting.meetingId === ctx.selectedId);
    const navigator = (
        <MeetingNavigator
            meetings={ctx.meetings}
            selectedId={ctx.selectedId}
            listLoading={ctx.listLoading}
            listCached={ctx.listCached}
            listError={ctx.listError}
            selectMeeting={selectMeeting}
        />
    );
    return (
        <section data-testid="convivium-meeting-panel" aria-label={t("panel.aria")}>
            {narrow ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={t("panel.navigator.open")}
                    onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                        openerRef.current = event.currentTarget;
                        setDrawerOpen(true);
                    }}
                >
                    {selected?.objective ?? t("panel.navigator.current")}
                </Button>
            ) : null}
            <div
                data-testid="meeting-workspace-shell"
                style={
                    narrow
                        ? { display: "block" }
                        : {
                              display: "grid",
                              gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
                              gap: 16
                          }
                }
            >
                {narrow ? null : <aside>{navigator}</aside>}
                <MeetingWorkspace ctx={ctx} />
            </div>
            {narrow && drawerOpen ? (
                <div>
                    <button
                        type="button"
                        aria-label={t("panel.navigator.close")}
                        onClick={closeDrawer}
                        style={{
                            position: "fixed",
                            inset: 0,
                            border: 0,
                            background: "rgba(0, 0, 0, 0.45)",
                            zIndex: 1
                        }}
                    />
                    <aside
                        role="dialog"
                        aria-modal={true}
                        aria-label={t("panel.navigator.title")}
                        style={{
                            position: "fixed",
                            inset: "0 auto 0 0",
                            width: "min(86vw, 320px)",
                            background: "Canvas",
                            zIndex: 2,
                            overflowY: "auto"
                        }}
                    >
                        {navigator}
                    </aside>
                </div>
            ) : null}
        </section>
    );
};

export const renderMeetingPanelLayout = (ctx: MeetingPanelLayoutProps): ReactElement => {
    return <MeetingPanelLayout ctx={ctx} />;
};
