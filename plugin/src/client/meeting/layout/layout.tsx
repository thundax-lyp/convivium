import * as React from "react";
import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type ReactElement
} from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { MeetingPanelLayoutProps } from "@/client/meeting/shared/index.ts";
import { MeetingNavigator, MeetingWorkspace } from "@/client/meeting/regions/index.ts";
import { Resizer } from "@/client/meeting/components/index.ts";
import { useMeetingTranslate } from "@/client/meeting/hooks/index.ts";
import styles from "./layout.module.css";

const NAVIGATOR_MIN_WIDTH = 220;
const NAVIGATOR_MAX_WIDTH = 480;
const WORKSPACE_MIN_WIDTH = 320;
const SPLITTER_AND_GAPS_WIDTH = 16;
const MIN_WIDE_WIDTH = NAVIGATOR_MIN_WIDTH + WORKSPACE_MIN_WIDTH + SPLITTER_AND_GAPS_WIDTH;

export const MeetingPanelLayout = (props: MeetingPanelLayoutProps): ReactElement => {
    const t = useMeetingTranslate();
    const [viewportNarrow, setViewportNarrow] = useState(
        () => window.matchMedia?.("(max-width: 760px)").matches ?? false
    );
    const [containerNarrow, setContainerNarrow] = useState(false);
    const narrow = viewportNarrow || containerNarrow;
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [navigatorWidth, setNavigatorWidth] = useState(280);
    const [maxNavigatorWidth, setMaxNavigatorWidth] = useState(NAVIGATOR_MAX_WIDTH);
    const [panelHeight, setPanelHeight] = useState<number>();
    const openerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLElement | null>(null);
    const shellRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const query = window.matchMedia?.("(max-width: 760px)");
        if (query === undefined) {
            return;
        }
        const update = (event: MediaQueryListEvent) => {
            setViewportNarrow(event.matches);
        };
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    useEffect(() => {
        if (!narrow) {
            setDrawerOpen(false);
        }
    }, [narrow]);
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
    useEffect(() => {
        if (shellRef.current === null) {
            return;
        }
        const shell = shellRef.current;
        const measure = () => {
            const width = shell.getBoundingClientRect().width;
            if (width <= 0) {
                return;
            }
            setContainerNarrow(width < MIN_WIDE_WIDTH);
            const maximum = Math.max(
                NAVIGATOR_MIN_WIDTH,
                Math.min(NAVIGATOR_MAX_WIDTH, width - WORKSPACE_MIN_WIDTH - SPLITTER_AND_GAPS_WIDTH)
            );
            setMaxNavigatorWidth(maximum);
        };
        measure();
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        observer?.observe(shell);
        window.addEventListener("resize", measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, []);
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (panel === null) {
            return;
        }
        let scrollContainer = panel.parentElement;
        while (
            scrollContainer !== null &&
            !/^(auto|scroll)$/.test(window.getComputedStyle(scrollContainer).overflowY)
        ) {
            scrollContainer = scrollContainer.parentElement;
        }
        if (scrollContainer === null) {
            return;
        }
        const container = scrollContainer;
        const stickyFooter = Array.from(container.children).find((child) => {
            const style = window.getComputedStyle(child);
            return style.position === "sticky" && style.bottom === "0px";
        });
        const measure = () => {
            const top =
                panel.getBoundingClientRect().top -
                container.getBoundingClientRect().top +
                container.scrollTop;
            const footerHeight = stickyFooter?.getBoundingClientRect().height ?? 0;
            setPanelHeight(Math.max(0, container.clientHeight - top - footerHeight));
        };
        measure();
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        observer?.observe(container);
        if (stickyFooter !== undefined) {
            observer?.observe(stickyFooter);
        }
        window.addEventListener("resize", measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, []);
    const resizeNavigator = (width: number) => {
        setNavigatorWidth(Math.min(maxNavigatorWidth, Math.max(NAVIGATOR_MIN_WIDTH, width)));
    };
    const visibleNavigatorWidth = Math.min(navigatorWidth, maxNavigatorWidth);
    const selectMeeting = (meetingId: string) => {
        props.selectMeeting(meetingId);
        if (narrow) {
            closeDrawer();
        }
    };
    const selected = props.meetings.find((meeting) => meeting.meetingId === props.selectedId);
    const navigator = (
        <MeetingNavigator
            meetings={props.meetings}
            selectedId={props.selectedId}
            listLoading={props.listLoading}
            listCached={props.listCached}
            listError={props.listError}
            requestRefresh={props.requestRefresh}
            selectMeeting={selectMeeting}
        />
    );
    let wideNavigation: ReactElement | null = null;
    let narrowDrawer: ReactElement | null = null;
    if (narrow) {
        if (drawerOpen) {
            narrowDrawer = (
                <div>
                    <Button
                        type="button"
                        variant="ghost"
                        aria-label={t("panel.navigator.close")}
                        onClick={closeDrawer}
                        className={styles.drawerBackdrop}
                    />
                    <aside
                        role="dialog"
                        aria-modal={true}
                        aria-label={t("panel.navigator.title")}
                        className={styles.drawer}
                    >
                        {navigator}
                    </aside>
                </div>
            );
        }
    } else {
        wideNavigation = (
            <>
                <aside id="meeting-navigator-pane" className={styles.navigator}>
                    {navigator}
                </aside>
                <Resizer
                    controls="meeting-navigator-pane"
                    width={visibleNavigatorWidth}
                    minWidth={NAVIGATOR_MIN_WIDTH}
                    maxWidth={maxNavigatorWidth}
                    onResize={resizeNavigator}
                />
            </>
        );
    }
    return (
        <section
            ref={panelRef}
            aria-label={t("panel.aria")}
            className={styles.panel}
            style={
                {
                    "--meeting-panel-height":
                        panelHeight === undefined ? undefined : `${panelHeight}px`
                } as React.CSSProperties
            }
        >
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
                ref={shellRef}
                data-testid="meeting-workspace-shell"
                className={`${styles.shell} ${narrow ? styles.shellNarrow : styles.shellWide}`}
                style={
                    {
                        "--meeting-navigator-width": `${visibleNavigatorWidth}px`
                    } as React.CSSProperties
                }
            >
                {wideNavigation}
                <MeetingWorkspace {...props} />
            </div>
            {narrowDrawer}
        </section>
    );
};
