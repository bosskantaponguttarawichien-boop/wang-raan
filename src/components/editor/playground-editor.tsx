"use client";

/**
 * Playground workspace — แถบซ้ายแบบหัวข้อ (Accordion) | Artboard (design-system.md §4.3)
 * Desktop-first: > 700px 2 คอลัมน์, ≤ 700px 1 คอลัมน์ (Canvas บนสุด แถบหัวข้อลงล่าง)
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import { Button, PaletteItem, StatusDot, ViewSwitch } from "@/components/ui";
import { Artboard } from "@/components/editor-2d/artboard";
import { IsometricView } from "@/components/preview-3d/isometric-view";
import { SimulationPanel, formatSimTime } from "@/components/simulation/simulation-panel";
import { WALL_LABEL, objectLabel } from "@/components/editor-2d/stage-math";
import { SECTION_ICONS, SidebarSection } from "./sidebar-section";
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
  layoutActions as actions,
  layoutStore,
  selectSelectedObject,
  useLayoutStore,
} from "@/store/use-layout-store";
import { useSimulationStore } from "@/store/use-simulation-store";
import { getDraftStorage } from "@/lib/draft-storage";
import { restoreDraft, startAutosave, startNewLayout, useDraftStatus } from "@/lib/draft-autosave";
import { formatDateTime } from "@/lib/format";

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

type SectionKey = "selected" | "room" | "add" | "simulation" | "file" | "cloud";

/** สรุปของชิ้นที่เลือก — เลือกเก้าอี้ให้แสดงโต๊ะแม่ (แก้ทั้งชุดที่โต๊ะ) */
function SelectedSummary() {
  const target = useLayoutStore((s) => {
    const picked = selectSelectedObject(s);
    return picked?.type === "chair" ? (s.layout.objects.find((o) => o.id === picked.tableId) ?? picked) : picked;
  });
  if (!target) return null;
  return <>{`${objectLabel(target)} · x ${target.x.toFixed(2)} y ${target.y.toFixed(2)} ม.`}</>;
}

function RoomSummary() {
  const text = useLayoutStore((s) => {
    const { width, depth, entrance } = s.layout;
    return `${width} × ${depth} ม. · ${entrance ? `ทางเข้าผนัง${WALL_LABEL[entrance.wall]}` : "ยังไม่มีทางเข้า"}`;
  });
  return <>{text}</>;
}

function PiecesSummary() {
  const text = useLayoutStore((s) => {
    const seats = s.layout.objects.filter((o) => o.type === "chair").length;
    const pieces = s.layout.objects.length - seats;
    return pieces === 0 ? "ยังไม่มีชิ้นงานบนผัง" : `วางแล้ว ${pieces} ชิ้น · ${seats} ที่นั่ง`;
  });
  return <>{text}</>;
}

/** จำหัวข้อที่เปิดไว้ในเบราว์เซอร์นี้ (รีเฟรช/เข้าสู่ระบบแล้วยังเปิดหัวข้อเดิม) */
const OPEN_SECTIONS_KEY = "wangraan:sidebar-open";
const SECTION_KEYS: readonly SectionKey[] = ["selected", "room", "add", "simulation", "file", "cloud"];

function readOpenSections(): ReadonlySet<SectionKey> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(OPEN_SECTIONS_KEY) ?? "null") as unknown;
    if (Array.isArray(saved)) return new Set(SECTION_KEYS.filter((k) => saved.includes(k)));
  } catch {
    // localStorage ปิดอยู่หรือค่าเสีย → ใช้ค่าเริ่มต้น
  }
  return new Set<SectionKey>(["add"]);
}

function saveOpenSections(open: ReadonlySet<SectionKey>) {
  try {
    window.localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...open]));
  } catch {
    // บันทึกไม่ได้ก็ไม่เป็นไร — แค่จำหัวข้อที่เปิดไม่ได้
  }
}

/**
 * แถบซ้ายแบบหัวข้อ (Accordion): กดหัวข้อเพื่อเปิด/ปิด ย้อนไปแก้หัวข้อไหนก็ได้ตลอด
 * "ชิ้นงานที่เลือก" โผล่เป็นหัวข้อแรกเฉพาะตอนเลือกชิ้นงาน และเปิดให้เองทุกครั้งที่เลือกชิ้นใหม่
 */
function Sidebar({ live }: { live: LiveValidation }) {
  const [open, setOpen] = React.useState<ReadonlySet<SectionKey>>(readOpenSections);
  const selectedId = useLayoutStore((s) => s.selectedObjectId);
  const asideRef = React.useRef<HTMLElement>(null);
  const toggle = (key: SectionKey) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  React.useEffect(() => saveOpenSections(open), [open]);

  React.useEffect(() => {
    if (!selectedId) return;
    setOpen((prev) => (prev.has("selected") ? prev : new Set(prev).add("selected")));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    asideRef.current?.scrollTo?.({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [selectedId]);

  const section = (key: SectionKey) => ({ id: key, open: open.has(key), onToggle: () => toggle(key), icon: SECTION_ICONS[key] });

  return (
    <aside
      ref={asideRef}
      aria-label="เครื่องมือจัดร้าน"
      className="border-line bg-white [grid-area:side] min-[701px]:overflow-y-auto min-[701px]:border-r max-[700px]:border-t"
    >
      <DraftNotice />
      {selectedId && (
        <SidebarSection {...section("selected")} title="ชิ้นงานที่เลือก" summary={<SelectedSummary />}>
          <ObjectInspector />
        </SidebarSection>
      )}

      <SidebarSection {...section("room")} title="ขนาดร้านและทางเข้า" summary={<RoomSummary />}>
        <RoomSettingsForm />
      </SidebarSection>

      <SidebarSection {...section("add")} title="เพิ่มลงผัง" summary={<PiecesSummary />}>
        <div className="grid gap-2 max-[700px]:grid-cols-2 max-[390px]:grid-cols-1">
          {PALETTE.map((item) => (
            <PaletteItem key={item.key} name={item.name} size={item.size} icon={item.icon} onClick={() => item.add()} />
          ))}
        </div>
        <p className="mb-0 mt-3 text-[12px] leading-[1.75] text-secondary">
          กดเพื่อเพิ่ม แล้วลากไปวางบนผัง วางทับหรือชิดเกินได้ระหว่างลองจัด ระบบจะบอกสิ่งที่ต้องแก้ในแถบสถานะด้านล่าง
        </p>
      </SidebarSection>

      <SidebarSection {...section("simulation")} title="จำลองลูกค้า" summary={<SimulationStatusText blocked={live.result.status === "blocked"} />}>
        <SimulationPanel live={live} />
      </SidebarSection>

      <SidebarSection {...section("file")} title="ไฟล์และส่งออก" summary="JSON · ภาพ PNG/SVG · รายงาน · เริ่มผังใหม่">
        <FilePanel />
        <hr className="my-4 border-line" />
        <Button
          variant="danger"
          size="sm"
          className="w-full"
          onClick={() => {
            if (window.confirm("เริ่มผังใหม่? ผังปัจจุบันและประวัติการแก้ไขจะถูกล้าง")) startNewLayout(layoutStore, getDraftStorage());
          }}
        >
          เริ่มผังใหม่
        </Button>
        <p className="mb-0 mt-2 text-[12px] leading-[1.75] text-secondary">ผังและประวัติบันทึกในเบราว์เซอร์นี้อัตโนมัติ</p>
      </SidebarSection>

      <SidebarSection {...section("cloud")} title="บัญชีและผังออนไลน์" summary="บันทึกผังไว้ในบัญชีและแชร์ลิงก์">
        <CloudPanel />
      </SidebarSection>
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
    <StatusDot tone={tone} data-testid="simulation-status" className="inline-flex">
      {text}
    </StatusDot>
  );
}

function CanvasCard({ live }: { live: LiveValidation }) {
  const is3D = useLayoutStore((s) => s.is3DView);
  const zoom = useLayoutStore((s) => s.zoom);
  const size = useLayoutStore((s) => `${s.layout.width} × ${s.layout.depth} เมตร`);
  const zoomBy = (step: number) => actions().setZoom(Math.round((zoom + step) * 10) / 10);
  const navButton =
    "grid h-[27px] w-[27px] place-items-center border-r border-[#e5eaf2] bg-white text-[17px] leading-none text-[#526985] hover:bg-[#f3f6ff] hover:text-blue disabled:opacity-45 focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus focus-visible:-outline-offset-2";

  return (
    <section
      aria-labelledby="canvas-title"
      className="flex min-h-0 min-w-0 flex-col bg-white [grid-area:canvas] max-[700px]:min-h-[520px]"
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
            <button type="button" aria-label="ซูมออก" className={navButton} disabled={zoom <= ZOOM_MIN} onClick={() => zoomBy(-0.1)}>
              −
            </button>
            <output aria-live="polite" className="min-w-[45px] border-r border-[#e5eaf2] text-center text-[11px] tabular-nums text-secondary">
              {Math.round(zoom * 100)}%
            </output>
            <button type="button" aria-label="ซูมเข้า" className={navButton} disabled={zoom >= ZOOM_MAX} onClick={() => zoomBy(0.1)}>
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

/** แจ้งว่ากู้คืนร่างเดิม + ทางเลือกเริ่มผังใหม่ */
function DraftNotice() {
  const restoredAt = useDraftStatus((s) => s.restoredAt);
  if (!restoredAt) return null;
  return (
    <p className="m-3 rounded-[8px] bg-blue-soft px-3 py-2 text-[12px] leading-[1.75] text-ink" data-testid="draft-notice">
      กู้คืนผังที่บันทึกไว้เมื่อ {formatDateTime(restoredAt)}
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
          "h-[calc(100dvh-60px)] grid-cols-[minmax(272px,300px)_minmax(0,1fr)] [grid-template-areas:'side_canvas']",
          "max-[700px]:h-auto max-[700px]:min-h-[calc(100dvh-60px)] max-[700px]:grid-cols-1 max-[700px]:[grid-template-areas:'canvas''side']",
        )}
      >
        <Sidebar live={live} />
        <CanvasCard live={live} />
      </div>
      <PrintReport live={live} />
    </>
  );
}
