"use client";

/**
 * Playground workspace — App Shell ใหม่ (feat-050)
 * Layout Grid: Header (top), Rail (left), Panel (left-center), Stage (center), Status Bar (bottom)
 * สเปกตาม mockup: design-html/playground-ux/index.html
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import { Artboard } from "@/components/editor-2d/artboard";
import { IsometricView } from "@/components/preview-3d/isometric-view";
import { useLiveValidation } from "@/components/validation/use-live-validation";
import { layoutActions as actions, layoutStore, useLayoutStore } from "@/store/use-layout-store";
import { useSimulationStore } from "@/store/use-simulation-store";
import { getDraftStorage } from "@/lib/draft-storage";
import { restoreDraft, startAutosave } from "@/lib/draft-autosave";
import { useOnlineAutosave } from "@/lib/online-autosave";
import { useGuestSync } from "@/lib/guest-sync";
import { ZoomControls } from "./canvas-controls";
import { PlaygroundHeader } from "./playground-header";
import { PlaygroundRail } from "./playground-rail";
import { PlaygroundPanel } from "./playground-panel";
import { PlaygroundStatusBar } from "./playground-status-bar";
import { PrintReport } from "./print-report";

let draftRestored = false;
export function restoreDraftOnce() {
  if (draftRestored) return;
  draftRestored = true;
  restoreDraft(layoutStore, getDraftStorage());
}

function useDraftAutosave() {
  React.useEffect(() => {
    const autosave = startAutosave(layoutStore, getDraftStorage());
    const onHide = () => autosave.flush();
    const onVisibility = () => document.visibilityState === "hidden" && autosave.flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      autosave.dispose();
    };
  }, []);
}

function useHistoryShortcuts() {
  const simStatus = useSimulationStore((s) => s.status);
  const simActive = simStatus === "running" || simStatus === "paused";

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (simActive) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) actions().redo();
        else actions().undo();
      } else if (key === "y") {
        event.preventDefault();
        actions().redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [simActive]);
}

export function PlaygroundEditor() {
  useHistoryShortcuts();
  useDraftAutosave();
  useOnlineAutosave();
  const live = useLiveValidation();
  const is3D = useLayoutStore((s) => s.is3DView);
  const simStatus = useSimulationStore((s) => s.status);
  const isSim = simStatus === "running" || simStatus === "paused";

  const [sheetOpen, setSheetOpen] = React.useState(true);
  const [toastMsg, setToastMsg] = React.useState<string | null>(null);
  const toastTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string) => {
    setToastMsg(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMsg(null);
    }, 2400);
  };
  useGuestSync({ onToast: showToast });

  const focusIssue = (index: number) => {
    const issue = live.result.issues[index];
    if (!issue) return;
    const targetId = issue.objectIds[0];
    if (targetId) {
      actions().selectObject(targetId);
    }
  };

  return (
    <>
      <div
        className={cn(
          "playground-shell print:hidden",
          isSim && "sim-mode",
        )}
      >
        <PlaygroundHeader onToast={showToast} />

        <PlaygroundRail
          live={live}
          sheetOpen={sheetOpen}
          onToggleSheet={() => setSheetOpen((prev) => !prev)}
        />

        <PlaygroundPanel
          live={live}
          sheetOpen={sheetOpen}
          onToggleSheet={() => setSheetOpen((prev) => !prev)}
          onToast={showToast}
          onFocusIssue={focusIssue}
        />

        <main
          id="stage"
          aria-label="พื้นที่จัดผังร้าน"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-surface [grid-area:stage]"
        >
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6 max-[767px]:p-2.5">
            {is3D ? <IsometricView onToast={showToast} /> : <Artboard live={live} onToast={showToast} />}
          </div>

          <ZoomControls className="absolute bottom-3 left-4 z-10 max-[767px]:hidden" />
        </main>

        <PlaygroundStatusBar live={live} onFocusIssue={focusIssue} />
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[76px] left-1/2 z-50 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-[10px] bg-ink px-3.5 py-2 text-center text-[13px] text-white shadow-card transition-opacity duration-200"
        >
          {toastMsg}
        </div>
      )}

      <PrintReport live={live} />
    </>
  );
}
