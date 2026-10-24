"use client";

import Link from "next/link";
import * as React from "react";
import { ViewSwitch } from "@/components/ui";
import { renderPlanSvg } from "@/core/export";
import { createLayoutFile, importLayoutFile, layoutFileName, serializeLayoutFile } from "@/core/io";
import { clearDraft, getDraftStorage } from "@/lib/draft-storage";
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
import { promptInstall, useInstallState } from "@/lib/pwa";
import { DraftStatusText } from "./header-actions";
import { CloudModal } from "./cloud-modal";
import { OnboardingModal } from "./onboarding-modal";
import { InlineLayoutName } from "./inline-layout-name";
import { SaveOnlineDialog } from "./save-online-dialog";

const ICON = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICON_BTN =
  "grid size-[34px] place-items-center rounded-[8px] text-secondary hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-secondary focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus";

const MENU_ITEM =
  "flex w-full items-start gap-2.5 rounded-[8px] p-2 text-left text-[13px] text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus";

function MenuButton({ act, children, ...props }: { act: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" role="menuitem" data-act={act} className={MENU_ITEM} {...props}>
      {children}
    </button>
  );
}

function MenuIcon({ tone = "text-secondary", children }: { tone?: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" {...ICON}>
      {children}
    </svg>
  );
}

function MenuText({ title, hint, titleClass = "" }: { title: string; hint?: string; titleClass?: string }) {
  return (
    <div>
      <span className={`block font-medium ${titleClass}`}>{title}</span>
      {hint && <small className="block text-[11px] text-secondary">{hint}</small>}
    </div>
  );
}

/** หมวดในเมนู — เส้นคั่น + หัวข้อเล็ก (role="group" ให้ screen reader อ่านชื่อหมวด) */
function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  const id = `menu-sec-${React.useId()}`;
  return (
    <div role="group" aria-labelledby={id} className="mt-1 border-t border-line pt-1">
      <div id={id} className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium text-secondary">
        {label}
      </div>
      {children}
    </div>
  );
}

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

  const canPromptInstall = useInstallState((s) => s.promptEvent !== null);
  const showInstall = useInstallState((s) => !s.installed && (s.promptEvent !== null || s.iosManual));
  const [projOpen, setProjOpen] = React.useState(false);
  const [cloudOpen, setCloudOpen] = React.useState(false);
  const [onboardingOpen, setOnboardingOpen] = React.useState(false);
  const [saveOnlineOpen, setSaveOnlineOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Close menus on click outside or Escape
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-menu-wrap]")) setProjOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProjOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const closeMenus = () => setProjOpen(false);

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
    clearDraft(getDraftStorage());
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
    // notes = สิ่งที่ระบบแก้ให้ตอนนำเข้า (เช่น ตัดเก้าอี้ที่ไม่มีโต๊ะ) — ต้องบอกผู้ใช้ ไม่งั้นของหายเงียบ ๆ
    onToast([`นำเข้า “${file.name}” แล้ว`, ...result.notes].join(" · "));
  };

  const handleOpenShop = () => {
    closeMenus();
    actions().setActiveTab("shop");
  };

  const handleOpenCloud = () => {
    closeMenus();
    setCloudOpen(true);
  };

  const handleInstall = async () => {
    closeMenus();
    if (canPromptInstall) {
      if (await promptInstall()) onToast("ติดตั้งแล้ว เปิดวางร้านจากหน้าจอโฮมได้เลย");
    } else {
      onToast("แตะปุ่มแชร์ของ Safari แล้วเลือก \"เพิ่มไปยังหน้าจอโฮม\"");
    }
  };

  return (
    <>
      {/* ซ้าย/ขวากว้างเท่ากัน → ปุ่ม 2D|3D อยู่กลางจอจริง · จอ < 768px ให้ฝั่งซ้าย (ชื่อผัง) หดแทน ฝั่งขวาไม่โดนบีบทับปุ่ม 3D */}
      <header
        role="banner"
        className="[grid-area:hd] grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center max-[767px]:grid-cols-[minmax(0,1fr)_auto_auto] gap-2.5 border-b border-line bg-white px-3.5 max-[767px]:h-[52px] max-[767px]:gap-1.5 max-[767px]:px-2 max-[359px]:gap-1 max-[359px]:px-1.5"
      >
        {/* ซ้าย: ตัวตนของผัง (โลโก้ + ชื่อผัง) */}
        <div className="flex min-w-0 items-center gap-2.5 max-[767px]:gap-1.5">
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
        </div>

        {/* Center: View Switcher */}
        {/* กลาง: คอลัมน์ auto ของ grid — อยู่กลางจอจริงและไม่หด (จอแคบให้ชื่อผังตัดแทน ไม่งั้นปุ่มขวาทับปุ่ม 3D) */}
        <div className="flex items-center justify-center">
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

        {/* ขวา: สถานะ · ย้อนกลับ/ทำซ้ำ · (Guest) บันทึกออนไลน์ · เมนู */}
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <span className="mr-1.5 flex min-w-0 truncate items-center gap-1.5 text-[12px] text-secondary max-[1023px]:hidden">
            <DraftStatusText />
          </span>
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

          {/* Guest: ปุ่มชวนบันทึกออนไลน์ยังอยู่บนแถบหัว (ทางลัดสำคัญก่อนข้อมูลหาย) — ผู้ใช้ที่ล็อกอินแล้วไป "ผังของฉัน" ผ่านเมนู */}
          {!isLoggedIn && (
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

          {/* เมนูเดียวของ Playground: บัญชี · ไฟล์ · ส่งออกและแชร์ · ร้าน (รวมปุ่ม "ผังของฉัน" และ "ส่งออก ▾" เดิมไว้ที่นี่) */}
          <div className="relative" data-menu-wrap>
            <button
              type="button"
              id="projBtn"
              aria-haspopup="menu"
              aria-expanded={projOpen}
              aria-controls={projOpen ? "projMenu" : undefined}
              aria-label="เมนูโปรเจกต์"
              onClick={() => setProjOpen(!projOpen)}
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
                // จอ < 768px ยึดเต็มความกว้างจอ (ขอบ 8px) — กว้าง 264px ชิดปุ่มแล้วอาจล้นขอบซ้ายบนจอแคบ
                className="absolute right-0 top-[calc(100%+6px)] z-40 w-[264px] max-h-[calc(100dvh-72px)] max-[767px]:fixed max-[767px]:inset-x-2 max-[767px]:top-[calc(58px+env(safe-area-inset-top))] max-[767px]:w-auto overflow-y-auto overscroll-contain rounded-[12px] border border-line bg-white p-1.5 shadow-[0_10px_30px_rgba(30,43,64,0.12)]"
              >
                {/* จอ < 1024px ไม่มีที่บนแถบหัว — แสดงสถานะการบันทึกในเมนูแทน */}
                <div role="none" className="hidden px-2 pb-1.5 pt-1 text-[12px] text-secondary max-[1023px]:block">
                  <DraftStatusText />
                </div>
                {isLoggedIn ? (
                  <Link href="/projects" role="menuitem" data-act="projects" onClick={closeMenus} className={`${MENU_ITEM} no-underline`}>
                    <MenuIcon tone="text-blue">
                      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                    </MenuIcon>
                    <MenuText title="ผังของฉัน" hint="กลับไปหน้ารวมโปรเจกต์" />
                  </Link>
                ) : (
                  <MenuButton
                    act="save-online"
                    onClick={() => {
                      closeMenus();
                      setSaveOnlineOpen(true);
                    }}
                  >
                    <MenuIcon tone="text-blue">
                      <path d="M7 16a4 4 0 0 1-.88-7.903A5 5 0 1 1 15.9 6L16 6a5 5 0 0 1 1 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </MenuIcon>
                    <MenuText title="บันทึกออนไลน์" titleClass="text-blue" hint="บันทึกเข้าบัญชีของคุณ" />
                  </MenuButton>
                )}
                <MenuButton act="cloud" onClick={handleOpenCloud}>
                  <MenuIcon tone="text-blue">
                    <path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z" />
                  </MenuIcon>
                  <MenuText title="บัญชีและผังออนไลน์" hint="บันทึกในบัญชีและแชร์ลิงก์" />
                </MenuButton>

                <MenuSection label="ไฟล์">
                  <MenuButton act="new" onClick={handleNewLayout}>
                    <MenuIcon tone="text-blue">
                      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                      <path d="M12 11v6M9 14h6" />
                    </MenuIcon>
                    <MenuText title="เริ่มผังใหม่" hint="ผังปัจจุบันจะถูกแทนที่" />
                  </MenuButton>
                  <MenuButton act="open" onClick={handleOpenFile}>
                    <MenuIcon>
                      <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                    </MenuIcon>
                    <MenuText title="เปิดไฟล์ผัง (.json)" />
                  </MenuButton>
                  <MenuButton act="save" onClick={handleExportJson}>
                    <MenuIcon>
                      <path d="M6 4h10l4 4v12H4V4z" />
                      <path d="M8 4v4h8V4M8 14h8v6H8z" />
                    </MenuIcon>
                    <MenuText title="บันทึกเป็นไฟล์ (.json)" hint="เก็บไว้เปิดต่อเครื่องอื่น" />
                  </MenuButton>
                </MenuSection>

                <MenuSection label="ส่งออกและแชร์">
                  <MenuButton act="png" disabled={busy} onClick={handleExportPng}>
                    <MenuIcon>
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </MenuIcon>
                    <MenuText title="ภาพ PNG" hint="ส่งต่อทางไลน์ได้ทันที" />
                  </MenuButton>
                  <MenuButton act="svg" onClick={handleExportSvg}>
                    <MenuIcon>
                      <path d="M4 14l6-6 4 4 6-6" />
                      <circle cx="4" cy="14" r="2" />
                      <circle cx="10" cy="8" r="2" />
                      <circle cx="14" cy="12" r="2" />
                      <circle cx="20" cy="6" r="2" />
                    </MenuIcon>
                    <MenuText title="ภาพ SVG" hint="สำหรับช่างหรือผู้ออกแบบ" />
                  </MenuButton>
                  <MenuButton act="pdf" onClick={handlePrint}>
                    <MenuIcon>
                      <path d="M6 9V2h12v7" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" rx="1" />
                    </MenuIcon>
                    <MenuText title="รายงาน PDF" hint="ผัง + ผลตรวจ + ผลจำลอง" />
                  </MenuButton>
                  <MenuButton act="share" onClick={handleOpenCloud}>
                    <MenuIcon tone="text-blue">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </MenuIcon>
                    <MenuText title="แชร์ลิงก์ผัง" hint="สร้างลิงก์สำหรับส่งต่อ" />
                  </MenuButton>
                </MenuSection>

                {showInstall && (
                  <MenuSection label="แอป">
                    <MenuButton act="install" onClick={handleInstall}>
                      <MenuIcon tone="text-blue">
                        <rect x="6" y="2" width="12" height="20" rx="2.5" />
                        <path d="M12 7v7M9 11l3 3 3-3M10 18h4" />
                      </MenuIcon>
                      <MenuText title="ติดตั้งแอปวางร้าน" hint="เปิดจากหน้าจอโฮม ใช้จัดผังได้แม้ออฟไลน์" />
                    </MenuButton>
                  </MenuSection>
                )}

                <MenuSection label="ร้าน">
                  <MenuButton act="shop" onClick={handleOpenShop}>
                    <MenuIcon>
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    </MenuIcon>
                    <MenuText title="ขนาดร้านและทางเข้า" />
                  </MenuButton>
                </MenuSection>
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
