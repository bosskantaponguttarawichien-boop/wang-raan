"use client";

/**
 * Playground workspace — เครื่องมือ | Artboard | ชิ้นงานที่เลือก (design-system.md §4.3, POC design-html/playground)
 * Desktop-first: > 1020px 3 คอลัมน์, ≤ 1020px 2 คอลัมน์ (ชิ้นงานลงล่าง), ≤ 700px 1 คอลัมน์ (Canvas บนสุด)
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import { Button, PaletteItem, ViewSwitch } from "@/components/ui";
import { Artboard } from "@/components/editor-2d/artboard";
import { IsometricView } from "@/components/preview-3d/isometric-view";
import { SimulationPanel, formatSimTime } from "@/components/simulation/simulation-panel";
import { PanelTitle } from "./panel-title";
import { ObjectInspector } from "./forms/object-inspector";
import { RoomSettingsForm } from "./forms/room-settings-form";
import { CloudPanel } from "./cloud-panel";
import { FilePanel } from "./file-panel";
import { PrintReport } from "./print-report";
import { useLiveValidation, type LiveValidation } from "@/components/validation/use-live-validation";
import { ValidationStatusBar } from "@/components/validation/validation-status-bar";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  layoutStore,
  selectCanRedo,
  selectCanUndo,
  useLayoutStore,
} from "@/store/use-layout-store";
import { useSimulationStore } from "@/store/use-simulation-store";
import { getDraftStorage } from "@/lib/draft-storage";
import { restoreDraft, startAutosave, startNewLayout, useDraftStatus } from "@/lib/draft-autosave";

const actions = () => layoutStore.getState();

const ICON_STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" as const };

const PALETTE = [
  {
    key: "table-2",
    name: "ชุดโต๊ะ 2 ที่นั่ง",
    size: "โต๊ะ 0.8 × 0.8 ม. + เก้าอี้ 2",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[21px]" {...ICON_STROKE}>
        <rect x="7" y="7" width="10" height="10" rx="3" />
        <path d="M9 3h6M9 21h6" />
      </svg>
    ),
    add: () => actions().addTableSet("table-2-seats"),
  },
  {
    key: "table-4",
    name: "ชุดโต๊ะ 4 ที่นั่ง",
    size: "โต๊ะ 1.2 × 1.2 ม. + เก้าอี้ 4",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[21px]" {...ICON_STROKE}>
        <rect x="6" y="6" width="12" height="12" rx="3" />
        <path d="M9 3h6M9 21h6M3 9v6M21 9v6" />
      </svg>
    ),
    add: () => actions().addTableSet("table-4-seats"),
  },
  {
    key: "counter",
    name: "เคาน์เตอร์",
    size: "2.4 × 0.7 ม.",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[21px]" {...ICON_STROKE}>
        <rect x="3" y="8" width="18" height="11" rx="2" />
        <path d="M15 8V5h5v3M3 13h18" />
      </svg>
    ),
    add: () => actions().addCounter(),
  },
  {
    key: "kitchen",
    name: "ครัว",
    size: "2.0 × 1.5 ม.",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[21px]" {...ICON_STROKE}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="2" />
        <circle cx="15.5" cy="10" r="2" />
        <path d="M6 15h12" />
      </svg>
    ),
    add: () => actions().addKitchen(),
  },
] as const;

function ToolPanel() {
  return (
    <aside
      aria-label="เครื่องมือจัดร้าน"
      className="border-line bg-white p-5 [grid-area:tools] min-[1021px]:overflow-y-auto min-[1021px]:border-r max-[1020px]:rounded-[14px] max-[1020px]:border max-[700px]:rounded-none max-[700px]:border-0 max-[700px]:border-b"
    >
      <PanelTitle>เพิ่มลงผัง</PanelTitle>
      <div className="grid gap-2 max-[700px]:grid-cols-2 max-[390px]:grid-cols-1">
        {PALETTE.map((item) => (
          <PaletteItem key={item.key} name={item.name} size={item.size} icon={item.icon} onClick={() => item.add()} />
        ))}
      </div>
      <p className="mt-4 text-[12px] leading-[1.75] text-secondary">
        <strong className="font-medium text-[#637590]">วิธีใช้:</strong> เพิ่มชิ้นงานแล้วลากไปวาง วางทับหรือชิดเกินได้ระหว่างลองจัด
        ระบบจะบอกสิ่งที่ต้องแก้ในแถบสถานะด้านล่าง
      </p>
    </aside>
  );
}

function SelectionPanel({ live }: { live: LiveValidation }) {
  const canUndo = useLayoutStore(selectCanUndo);
  const canRedo = useLayoutStore(selectCanRedo);

  return (
    <aside
      aria-label="การจัดการชิ้นงาน"
      className="border-line bg-white p-5 [grid-area:selection] min-[1021px]:overflow-y-auto min-[1021px]:border-l max-[1020px]:grid max-[1020px]:grid-cols-2 max-[1020px]:gap-5 max-[1020px]:rounded-[14px] max-[1020px]:border max-[700px]:block max-[700px]:rounded-none max-[700px]:border-0"
    >
      <SimulationPanel live={live} />

      <hr className="-mx-5 my-5 border-line max-[1020px]:hidden max-[700px]:block" />

      <section className="min-w-0">
        <PanelTitle>ชิ้นงานที่เลือก</PanelTitle>
        <ObjectInspector />
      </section>

      <hr className="-mx-5 my-5 border-line max-[1020px]:hidden max-[700px]:block" />

      <section className="min-w-0">
        <PanelTitle>ขนาดร้านและทางเข้า</PanelTitle>
        <RoomSettingsForm />
      </section>

      <hr className="-mx-5 my-5 border-line max-[1020px]:hidden max-[700px]:block" />

      <section className="min-w-0">
        <PanelTitle>บัญชีและผังออนไลน์</PanelTitle>
        <CloudPanel />
      </section>

      <hr className="-mx-5 my-5 border-line max-[1020px]:hidden max-[700px]:block" />

      <section className="min-w-0">
        <PanelTitle>ไฟล์และการส่งออก</PanelTitle>
        <FilePanel />
      </section>

      <hr className="-mx-5 my-5 border-line max-[1020px]:hidden max-[700px]:block" />

      <section className="min-w-0">
        <PanelTitle>ประวัติการแก้ไข</PanelTitle>
        <DraftNotice />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" disabled={!canUndo} onClick={() => actions().undo()} aria-keyshortcuts="Control+Z Meta+Z">
            ↶ ย้อนกลับ
          </Button>
          <Button variant="secondary" size="sm" disabled={!canRedo} onClick={() => actions().redo()} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">
            ↷ ทำซ้ำ
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="col-span-2"
            onClick={() => {
              if (window.confirm("เริ่มผังใหม่? ผังปัจจุบันและประวัติการแก้ไขจะถูกล้าง")) startNewLayout(layoutStore, getDraftStorage());
            }}
          >
            เริ่มผังใหม่
          </Button>
        </div>
        <p className="mb-0 mt-3 text-[12px] leading-[1.75] text-secondary">ผังและประวัติบันทึกในเบราว์เซอร์นี้อัตโนมัติ</p>
      </section>
    </aside>
  );
}

function SimulationStatusText({ blocked }: { blocked: boolean }) {
  const status = useSimulationStore((s) => s.status);
  const metrics = useSimulationStore((s) => s.metrics);
  const text =
    status === "running" || status === "paused"
      ? `${status === "paused" ? "หยุดชั่วคราว" : "กำลังจำลอง"} · ${formatSimTime(metrics?.time ?? 0)} · ในร้าน ${metrics?.inStore ?? 0} คน`
      : status === "starting"
        ? "กำลังเตรียมการจำลอง…"
        : blocked
          ? "แก้ผังให้ผ่านกฎจำเป็นก่อนจำลอง"
          : "พร้อมจำลองลูกค้า";
  const tone = status === "running" ? "bg-[var(--save-saved-dot)]" : blocked && status === "idle" ? "bg-status-blocked" : "bg-[var(--save-saving)]";
  return (
    <span className="flex items-center gap-1.5" data-testid="simulation-status">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone)} />
      {text}
    </span>
  );
}

function CanvasCard({ live }: { live: LiveValidation }) {
  const is3D = useLayoutStore((s) => s.is3DView);
  const zoom = useLayoutStore((s) => s.zoom);
  const size = useLayoutStore((s) => `${s.layout.width} × ${s.layout.depth} เมตร`);
  const navButton =
    "grid h-[27px] w-[27px] place-items-center border-r border-[#e5eaf2] bg-white text-[17px] leading-none text-[#526985] hover:bg-[#f3f6ff] hover:text-blue disabled:opacity-45 focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus focus-visible:-outline-offset-2";

  return (
    <section
      aria-labelledby="canvas-title"
      className="flex min-h-0 min-w-0 flex-col bg-white [grid-area:canvas] max-[1020px]:min-h-[620px] max-[1020px]:rounded-[14px] max-[1020px]:border max-[1020px]:border-line max-[700px]:min-h-0 max-[700px]:rounded-none max-[700px]:border-0 max-[700px]:border-b"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#e6ebf2] px-[18px] py-3.5 max-[700px]:px-3.5">
        <h1 id="canvas-title" className="m-0 flex items-center gap-2 text-[15px] font-semibold leading-[1.5] max-[390px]:sr-only">
          <span aria-hidden="true" className="size-2.5 rounded-[2px] border-[1.5px] border-[#8e9db2]" />
          Artboard ร้านของคุณ
        </h1>
        <div className="ml-auto flex flex-wrap items-center gap-2 max-[700px]:w-full max-[700px]:justify-between">
          <ViewSwitch
            aria-label="เปลี่ยนมุมมอง"
            value={is3D ? "3d" : "2d"}
            onValueChange={(v) => actions().set3DView(v === "3d")}
            options={[
              { value: "2d", label: "จัดผัง 2D" },
              { value: "3d", label: "ดูตัวอย่าง 3D" },
            ]}
          />
          <div role="group" aria-label="ซูม Artboard" className="flex items-center overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white">
            <button type="button" aria-label="ซูมออก" className={navButton} disabled={zoom <= ZOOM_MIN} onClick={() => actions().setZoom(Math.round((zoom - 0.1) * 10) / 10)}>
              −
            </button>
            <output aria-live="polite" className="min-w-[45px] border-r border-[#e5eaf2] text-center text-[11px] tabular-nums text-secondary">
              {Math.round(zoom * 100)}%
            </output>
            <button type="button" aria-label="ซูมเข้า" className={navButton} disabled={zoom >= ZOOM_MAX} onClick={() => actions().setZoom(Math.round((zoom + 0.1) * 10) / 10)}>
              +
            </button>
            <button type="button" aria-label="ปรับให้พอดี" className={cn(navButton, "w-[37px] border-r-0 text-[11px] font-semibold")} onClick={() => actions().setZoom(1)}>
              พอดี
            </button>
          </div>
          <span className="whitespace-nowrap rounded-[5px] bg-[#f3f6fa] px-2 py-1 text-[12px] text-secondary-strong max-[390px]:hidden">{size}</span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col bg-surface">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6 max-[700px]:px-3 max-[700px]:pb-6 max-[700px]:pt-[18px]">
          {is3D ? <IsometricView /> : <Artboard live={live} />}
        </div>
        <div className="pointer-events-none sticky bottom-3 z-20 px-3 pb-3">
          <ValidationStatusBar live={live} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 border-t border-[#e6ebf2] px-[18px] py-3 text-[12px] text-secondary max-[700px]:px-3.5 max-[700px]:text-[11px]">
        <SimulationStatusText blocked={live.result.status === "blocked"} />
        <DraftStatusText />
        <span>{is3D ? "มุมมอง Isometric" : "มุมมองด้านบน · กริดละ 0.25 ม."}</span>
      </div>
    </section>
  );
}

let draftRestored = false;
/** กู้คืนร่างครั้งเดียวต่อการโหลดหน้า (store เป็น singleton — การนำทางกลับมาหน้านี้ใช้ผังใน memory) */
export function restoreDraftOnce() {
  if (draftRestored) return;
  draftRestored = true;
  restoreDraft(layoutStore, getDraftStorage());
}

/** บันทึกร่างอัตโนมัติ + บันทึกทันทีเมื่อปิด/ซ่อนแท็บ */
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

const SAVE_TEXT = { idle: "ยังไม่มีการแก้ไข", saving: "กำลังบันทึกร่าง…", saved: "บันทึกร่างในเบราว์เซอร์แล้ว", error: "บันทึกร่างไม่สำเร็จ (พื้นที่เบราว์เซอร์เต็มหรือถูกปิด)" } as const;

function DraftStatusText() {
  const status = useDraftStatus((s) => s.status);
  const tone = status === "saved" ? "bg-[var(--save-saved-dot)]" : status === "error" ? "bg-status-blocked" : status === "saving" ? "bg-[var(--save-saving)]" : "bg-[#c5cfdd]";
  return (
    <span className="flex items-center gap-1.5" data-testid="draft-status" data-status={status}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone)} />
      {SAVE_TEXT[status]}
    </span>
  );
}

/** แจ้งว่ากู้คืนร่างเดิม + ทางเลือกเริ่มผังใหม่ */
function DraftNotice() {
  const restoredAt = useDraftStatus((s) => s.restoredAt);
  if (!restoredAt) return null;
  const time = new Date(restoredAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  return (
    <p className="m-0 mb-3 rounded-[8px] bg-blue-soft px-3 py-2 text-[12px] leading-[1.75] text-secondary-strong" data-testid="draft-notice">
      กู้คืนผังที่บันทึกไว้เมื่อ {time}
    </p>
  );
}

/** Ctrl/Cmd+Z = ย้อนกลับ, Ctrl/Cmd+Shift+Z หรือ Ctrl+Y = ทำซ้ำ (ไม่ทำงานขณะพิมพ์ในช่องกรอก) */
function useHistoryShortcuts() {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
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
  }, []);
}

export function PlaygroundEditor() {
  useHistoryShortcuts();
  useDraftAutosave();
  const live = useLiveValidation();
  return (
    <>
      <div
        className={cn(
          "grid bg-blue-tint-3 print:hidden",
          "h-[calc(100dvh-60px)] grid-cols-[minmax(252px,280px)_minmax(0,1fr)_minmax(242px,280px)] [grid-template-areas:'tools_canvas_selection']",
          "max-[1020px]:h-auto max-[1020px]:min-h-[calc(100dvh-60px)] max-[1020px]:grid-cols-[minmax(230px,280px)_minmax(0,1fr)] max-[1020px]:gap-3.5 max-[1020px]:p-3.5 max-[1020px]:[grid-template-areas:'tools_canvas''selection_selection']",
          "max-[700px]:grid-cols-1 max-[700px]:gap-0 max-[700px]:p-0 max-[700px]:[grid-template-areas:'canvas''tools''selection']",
        )}
      >
        <ToolPanel />
        <CanvasCard live={live} />
        <SelectionPanel live={live} />
      </div>
      <PrintReport live={live} />
    </>
  );
}
