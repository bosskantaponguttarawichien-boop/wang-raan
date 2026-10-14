"use client";

import Link from "next/link";
import * as React from "react";
import { ViewSwitch } from "@/components/ui";
import { renderPlanSvg } from "@/core/export";
import { createLayoutFile, importLayoutFile, layoutFileName, serializeLayoutFile } from "@/core/io";
import { getDraftStorage } from "@/lib/draft-storage";
import { downloadBlob, downloadText, svgToPngBlob } from "@/lib/export-client";
import {
  layoutActions as actions,
  layoutStore,
  selectCanRedo,
  selectCanUndo,
  useLayoutStore,
} from "@/store/use-layout-store";
import { useSimulationStore } from "@/store/use-simulation-store";
import { summarizeIssues } from "@/components/validation/use-live-validation";
import { createEmptyLayout, createEntrance, randomId, type Wall } from "@/core/layout";
import { useSession } from "next-auth/react";
import { DraftStatusText } from "./header-actions";
import { CloudModal } from "./cloud-modal";
import { OnboardingModal } from "./onboarding-modal";
import { InlineLayoutName } from "./inline-layout-name";
import { SaveOnlineDialog } from "./save-online-dialog";

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICON_BTN =
  "grid size-[34px] place-items-center rounded-[8px] text-secondary hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-secondary focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus";

export interface PlaygroundHeaderProps {
  onToast?: (message: string) => void;
}

export function PlaygroundHeader({ onToast = () => {} }: PlaygroundHeaderProps) {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user?.id && !session.user.id.startsWith("guest-"));
  const is3D = useLayoutStore((s) => s.is3DView);
  const canUndo = useLayoutStore(selectCanUndo);
  const canRedo = useLayoutStore(selectCanRedo);
  const simStatus = useSimulationStore((s) => s.status);
  const simActive = simStatus === "running" || simStatus === "paused";

  const [projOpen, setProjOpen] = React.useState(false);
  const [expOpen, setExpOpen] = React.useState(false);
  const [cloudOpen, setCloudOpen] = React.useState(false);
  const [onboardingOpen, setOnboardingOpen] = React.useState(false);
  const [saveOnlineOpen, setSaveOnlineOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const projBtnRef = React.useRef<HTMLButtonElement>(null);
  const expBtnRef = React.useRef<HTMLButtonElement>(null);

  // Close menus on click outside or Escape
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-menu-wrap]")) {
        setProjOpen(false);
        setExpOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProjOpen(false);
        setExpOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const closeMenus = () => {
    setProjOpen(false);
    setExpOpen(false);
  };

  const handleNewLayout = () => {
    closeMenus();
    setOnboardingOpen(true);
  };

  const handleStartCustom = ({ width, depth, wall }: { width: number; depth: number; wall: Wall }) => {
    const store = layoutStore.getState();
    const newLayout = createEmptyLayout({ width, depth }, randomId);
    const wallLen = wall === "north" || wall === "south" ? width : depth;
    const doorWidth = 1.2;
    const doorPos = Math.max(0, Math.round(((wallLen - doorWidth) / 2) / 0.25) * 0.25);
    const withDoor = {
      ...newLayout,
      entrance: createEntrance(newLayout, { wall, position: doorPos, width: doorWidth }, randomId),
    };
    store.loadLayout(withDoor);
    getDraftStorage()?.clear();
    onToast("เริ่มผังใหม่แล้ว");
  };

  const handleUseTemplate = () => {
    actions().loadSampleLayout();
    onToast("ใส่ผังตัวอย่างแล้ว ลากปรับได้ตามร้านจริง");
  };

  const currentPlan = () => {
    const store = layoutStore.getState();
    const validation = store.runValidation();
    return { layout: store.layout, validation };
  };

  const planSvg = () => {
    const { layout, validation } = currentPlan();
    return { layout, svg: renderPlanSvg(layout, { severityById: summarizeIssues(validation.issues).severityById }) };
  };

  const handleExportJson = () => {
    closeMenus();
    const { layout, validation } = currentPlan();
    downloadText(serializeLayoutFile(createLayoutFile(layout, validation)), layoutFileName(layout, new Date()), "application/json");
    onToast("บันทึกไฟล์ JSON แล้ว");
  };

  const handleExportSvg = () => {
    closeMenus();
    const { layout, svg } = planSvg();
    downloadText(svg, layoutFileName(layout, new Date(), "svg"), "image/svg+xml");
    onToast("ดาวน์โหลดภาพ SVG แล้ว");
  };

  const handleExportPng = async () => {
    closeMenus();
    setBusy(true);
    try {
      const { layout, svg } = planSvg();
      downloadBlob(await svgToPngBlob(svg, 2), layoutFileName(layout, new Date(), "png"));
      onToast("ดาวน์โหลดภาพ PNG แล้ว");
    } catch {
      onToast("ส่งออกภาพ PNG ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = () => {
    closeMenus();
    window.print();
  };

  const handleOpenFile = () => {
    closeMenus();
    fileInputRef.current?.click();
  };

  const onFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = importLayoutFile(await file.text(), randomId);
    if (!result.ok) {
      onToast(`นำเข้าไฟล์ไม่สำเร็จ: ${result.errors[0] ?? "รูปแบบไฟล์ไม่ถูกต้อง"}`);
      return;
    }
    layoutStore.getState().replaceLayout(result.layout);
    onToast(`นำเข้า “${file.name}” แล้ว`);
  };

  const handleOpenShop = () => {
    closeMenus();
    actions().setActiveTab("shop");
  };

  const handleOpenCloud = () => {
    closeMenus();
    setCloudOpen(true);
  };

  return (
    <>
      <header
        role="banner"
        className="[grid-area:hd] flex h-14 items-center gap-2.5 border-b border-line bg-white px-3.5 max-[767px]:h-[52px] max-[767px]:gap-1.5 max-[767px]:px-2"
      >
        {/* Logo */}
        <Link
          href="/"
          aria-label="วางร้าน กลับหน้าแรก"
          className="flex shrink-0 items-center gap-2 text-[17px] font-semibold text-ink no-underline focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logos/logo-wangraan-clear-channel.svg"
            alt=""
            aria-hidden="true"
            width={28}
            height={28}
            className="block size-7"
          />
          <span className="max-[767px]:hidden">วางร้าน</span>
        </Link>

        {/* Project Name (Inline Editable) */}
        <InlineLayoutName onToast={onToast} />

        {/* Project Menu */}
        <div className="relative" data-menu-wrap>
          <button
            ref={projBtnRef}
            type="button"
            id="projBtn"
            aria-haspopup="menu"
            aria-expanded={projOpen}
            aria-label="เมนูโปรเจกต์"
            onClick={() => {
              setExpOpen(false);
              setProjOpen(!projOpen);
            }}
            className="flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[13px] font-medium text-secondary hover:bg-surface hover:text-ink focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true" {...ICON}>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="max-w-[160px] truncate max-[1023px]:hidden">เมนู</span>
            <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-muted" aria-hidden="true" {...ICON}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {projOpen && (
            <div
              id="projMenu"
              role="menu"
              aria-label="เมนูโปรเจกต์"
              className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[220px] rounded-[12px] border border-line bg-white p-1.5 shadow-[0_10px_30px_rgba(30,43,64,0.12)]"
            >
              {isLoggedIn ? (
                <Link
                  href="/projects"
                  role="menuitem"
                  data-act="projects"
                  onClick={closeMenus}
                  className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus no-underline"
                >
                  <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" {...ICON}>
                    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                  </svg>
                  <div>
                    <span className="block font-medium">ผังของฉัน</span>
                    <small className="block text-[11px] text-muted">กลับไปหน้ารวมโปรเจกต์</small>
                  </div>
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  data-act="save-online"
                  onClick={() => {
                    closeMenus();
                    setSaveOnlineOpen(true);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
                >
                  <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" {...ICON}>
                    <path d="M7 16a4 4 0 0 1-.88-7.903A5 5 0 1 1 15.9 6L16 6a5 5 0 0 1 1 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <div>
                    <span className="block font-medium text-blue">บันทึกออนไลน์</span>
                    <small className="block text-[11px] text-muted">บันทึกเข้าบัญชีของคุณ</small>
                  </div>
                </button>
              )}

              <hr className="my-1 border-t border-line" />

              <button
                type="button"
                role="menuitem"
                data-act="new"
                onClick={handleNewLayout}
                className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
              >
                <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" {...ICON}>
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <path d="M12 11v6M9 14h6" />
                </svg>
                <div>
                  <span className="block font-medium">เริ่มผังใหม่</span>
                  <small className="block text-[11px] text-muted">ผังปัจจุบันจะถูกแทนที่</small>
                </div>
              </button>

              <button
                type="button"
                role="menuitem"
                data-act="open"
                onClick={handleOpenFile}
                className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
              >
                <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" {...ICON}>
                  <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                </svg>
                <div>
                  <span className="block font-medium">เปิดไฟล์ผัง (.json)</span>
                </div>
              </button>

              <button
                type="button"
                role="menuitem"
                data-act="save"
                onClick={handleExportJson}
                className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
              >
                <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" {...ICON}>
                  <path d="M6 4h10l4 4v12H4V4z" />
                  <path d="M8 4v4h8V4M8 14h8v6H8z" />
                </svg>
                <div>
                  <span className="block font-medium">บันทึกเป็นไฟล์ (.json)</span>
                  <small className="block text-[11px] text-muted">เก็บไว้เปิดต่อเครื่องอื่น</small>
                </div>
              </button>

              <hr className="my-1 border-t border-line" />

              <button
                type="button"
                role="menuitem"
                data-act="shop"
                onClick={handleOpenShop}
                className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
              >
                <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" {...ICON}>
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <div>
                  <span className="block font-medium">ขนาดร้านและทางเข้า</span>
                </div>
              </button>

              <button
                type="button"
                role="menuitem"
                data-act="cloud"
                onClick={handleOpenCloud}
                className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
              >
                <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" {...ICON}>
                  <path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z" />
                </svg>
                <div>
                  <span className="block font-medium">บัญชีและผังออนไลน์</span>
                  <small className="block text-[11px] text-muted">บันทึกในบัญชีและแชร์ลิงก์</small>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* My Projects / Save Online quick button */}
        {isLoggedIn ? (
          <Link
            href="/projects"
            id="myProjectsLink"
            aria-label="ไปยังหน้ารวมผังของฉัน"
            className="flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[13px] font-medium text-secondary hover:bg-surface hover:text-ink focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus no-underline max-[767px]:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-secondary" aria-hidden="true" {...ICON}>
              <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
            </svg>
            <span>ผังของฉัน</span>
          </Link>
        ) : (
          <button
            type="button"
            id="saveOnlineBtn"
            aria-label="บันทึกผังออนไลน์"
            onClick={() => {
              closeMenus();
              setSaveOnlineOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-[8px] bg-[#edf1ff] px-2.5 py-1.5 text-[13px] font-semibold text-[#1d4ed8] hover:bg-[#dce5ff] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus transition-colors cursor-pointer max-[767px]:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-[#1d4ed8]" aria-hidden="true" {...ICON}>
              <path d="M7 16a4 4 0 0 1-.88-7.903A5 5 0 1 1 15.9 6L16 6a5 5 0 0 1 1 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span>บันทึกออนไลน์</span>
          </button>
        )}

        {/* Center: View Switcher */}
        <div className="flex flex-1 items-center justify-center min-w-0">
          <ViewSwitch
            aria-label="มุมมอง"
            value={is3D ? "3d" : "2d"}
            onValueChange={(v) => actions().set3DView(v === "3d")}
            options={[
              { value: "2d", label: "จัดผัง 2D", shortLabel: "2D" },
              { value: "3d", label: "ดูตัวอย่าง 3D", shortLabel: "3D" },
            ]}
          />
        </div>

        {/* Header Right */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            id="undo"
            aria-label="ย้อนกลับ (Ctrl+Z)"
            title="ย้อนกลับ (Ctrl+Z)"
            disabled={!canUndo || simActive}
            onClick={() => actions().undo()}
            className={ICON_BTN}
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" {...ICON}>
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>

          <button
            type="button"
            id="redo"
            aria-label="ทำซ้ำ (Ctrl+Shift+Z)"
            title="ทำซ้ำ (Ctrl+Shift+Z)"
            disabled={!canRedo || simActive}
            onClick={() => actions().redo()}
            className={ICON_BTN}
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" {...ICON}>
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </svg>
          </button>

          <span className="mx-1.5 flex items-center gap-1.5 text-[12px] text-secondary max-[1023px]:hidden">
            <DraftStatusText />
          </span>

          {/* Export Menu */}
          <div className="relative" data-menu-wrap>
            <button
              ref={expBtnRef}
              type="button"
              id="expBtn"
              aria-haspopup="menu"
              aria-expanded={expOpen}
              aria-label="ส่งออก"
              onClick={() => {
                setProjOpen(false);
                setExpOpen(!expOpen);
              }}
              className="flex items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-[#c8d2e2] hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
            >
              <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-secondary" aria-hidden="true" {...ICON}>
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              <span className="export-label max-[767px]:hidden">ส่งออก</span>
              <svg viewBox="0 0 24 24" className="size-3 shrink-0 text-muted" aria-hidden="true" {...ICON}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {expOpen && (
              <div
                id="expMenu"
                role="menu"
                aria-label="เมนูส่งออก"
                className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[210px] rounded-[12px] border border-line bg-white p-1.5 shadow-[0_10px_30px_rgba(30,43,64,0.12)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  data-act="png"
                  disabled={busy}
                  onClick={handleExportPng}
                  className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
                >
                  <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" {...ICON}>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <div>
                    <span className="block font-medium">ภาพ PNG</span>
                    <small className="block text-[11px] text-muted">ส่งต่อทางไลน์ได้ทันที</small>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-act="svg"
                  onClick={handleExportSvg}
                  className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
                >
                  <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" {...ICON}>
                    <path d="M4 14l6-6 4 4 6-6" />
                    <circle cx="4" cy="14" r="2" />
                    <circle cx="10" cy="8" r="2" />
                    <circle cx="14" cy="12" r="2" />
                    <circle cx="20" cy="6" r="2" />
                  </svg>
                  <div>
                    <span className="block font-medium">ภาพ SVG</span>
                    <small className="block text-[11px] text-muted">สำหรับช่างหรือผู้ออกแบบ</small>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  data-act="pdf"
                  onClick={handlePrint}
                  className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
                >
                  <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" {...ICON}>
                    <path d="M6 9V2h12v7" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" rx="1" />
                  </svg>
                  <div>
                    <span className="block font-medium">รายงาน PDF</span>
                    <small className="block text-[11px] text-muted">ผัง + ผลตรวจ + ผลจำลอง</small>
                  </div>
                </button>

                <hr className="my-1 border-t border-line" />

                <button
                  type="button"
                  role="menuitem"
                  data-act="share"
                  onClick={handleOpenCloud}
                  className="flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
                >
                  <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" {...ICON}>
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  <div>
                    <span className="block font-medium">แชร์ลิงก์ผัง</span>
                    <small className="block text-[11px] text-muted">สร้างลิงก์สำหรับส่งต่อ</small>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hidden input for JSON import */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-label="เลือกไฟล์ผังร้าน JSON"
          data-testid="import-input"
          onChange={onFileInputChange}
        />
      </header>

      {/* Cloud & Share Modal */}
      <CloudModal open={cloudOpen} onOpenChange={setCloudOpen} />

      {/* Save Online Modal */}
      <SaveOnlineDialog open={saveOnlineOpen} onOpenChange={setSaveOnlineOpen} />

      {/* Onboarding / New Layout Modal */}
      <OnboardingModal
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        onStartCustom={handleStartCustom}
        onUseTemplate={handleUseTemplate}
      />
    </>
  );
}
