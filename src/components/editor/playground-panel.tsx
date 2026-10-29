"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { PaletteItem } from "@/components/ui";
import {
  layoutActions as actions,
  useLayoutStore,
} from "@/store/use-layout-store";
import { useSimulationStore } from "@/store/use-simulation-store";
import type { Counter, Table, TableSetCreationOptions } from "@/core/layout";
import type { LiveValidation } from "@/components/validation/use-live-validation";
import { RoomSettingsForm } from "./forms/room-settings-form";
import { TableSetCreatePanel } from "./forms/table-set-create-panel";
import { CounterEditPanel } from "./forms/counter-style-controls";
import { TableSetEditPanel } from "./forms/table-set-edit-panel";
import { SimulationPanel } from "@/components/simulation/simulation-panel";
import { LightingSettingsPanel } from "@/components/preview-3d/lighting/settings-panel";

const ICON_STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" as const };

const PALETTE = [
  {
    key: "table",
    name: "โต๊ะ",
    size: "เพิ่มจำนวนเก้าอี้ · ปรับรูปแบบได้",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[21px]" {...ICON_STROKE}>
        <rect x="7" y="7" width="10" height="10" rx="3" />
        <path d="M9 3h6M9 21h6" />
      </svg>
    ),
    configuresTable: true,
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
    key: "kitchen-door",
    name: "ประตูครัว",
    size: "ติดผนัง",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[21px]" {...ICON_STROKE}>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <circle cx="15.5" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
    isKitchenDoor: true,
  },
] as const;

export interface PlaygroundPanelProps {
  live: LiveValidation;
  sheetOpen?: boolean;
  onToggleSheet?: () => void;
  onToast?: (message: string) => void;
  onFocusIssue?: (index: number) => void;
}

export function PlaygroundPanel({
  live,
  sheetOpen = true,
  onToggleSheet,
  onToast = () => {},
  onFocusIssue,
}: PlaygroundPanelProps) {
  const activeTab = useLayoutStore((s) => s.activeTab);
  const simStatus = useSimulationStore((s) => s.status);
  const metrics = useSimulationStore((s) => s.metrics);
  const selectedTable = useLayoutStore((state): Table | null => {
    const selected = state.layout.objects.find((object) => object.id === state.selectedObjectId);
    if (selected?.type === "table") return selected;
    if (selected?.type !== "chair") return null;
    const table = state.layout.objects.find((object): object is Table => object.id === selected.tableId && object.type === "table");
    return table ?? null;
  });
  const selectedCounter = useLayoutStore(
    (state): Counter | null =>
      state.layout.objects.find((object): object is Counter => object.id === state.selectedObjectId && object.type === "counter") ?? null,
  );
  const isSim = simStatus === "running" || simStatus === "paused";
  const [configuringTable, setConfiguringTable] = React.useState(false);

  const handleApplyTemplate = () => {
    actions().loadSampleLayout();
    onToast("ใส่ผังตัวอย่างแล้ว ลากปรับได้ตามร้านจริง");
  };

  const handleCreateTableSet = (options: TableSetCreationOptions) => {
    const preset = (options.chairCount ?? 4) <= 2 ? "table-2-seats" : "table-4-seats";
    actions().addTableSet(preset, undefined, options);
    setConfiguringTable(false);
    onToast(`เพิ่มโต๊ะพร้อมเก้าอี้ ${options.chairCount ?? 4} ตัวแล้ว ลากไปตำแหน่งที่ต้องการได้เลย`);
    if (typeof window !== "undefined" && window.innerWidth < 768 && onToggleSheet) onToggleSheet();
  };

  return (
    <aside
      id="panel"
      aria-live="polite"
      className={cn(
        "relative [grid-area:panel] min-w-0 border-r border-line bg-white p-4 overflow-y-auto",
        "max-[767px]:border-r-0 max-[767px]:border-t max-[767px]:max-h-[40dvh] max-[767px]:rounded-t-[16px] max-[767px]:px-4 max-[767px]:pb-4 max-[767px]:pt-0 max-[767px]:shadow-[0_-6px_20px_rgba(30,43,64,0.06)]",
        !sheetOpen && "max-[767px]:hidden",
      )}
    >
      {/* Mobile Grip handle — พื้นที่กดเต็มความกว้าง ติดขอบบนขณะเลื่อนเนื้อหาในแผง */}
      <button
        type="button"
        aria-label="ย่อ/ขยายแผง"
        onClick={onToggleSheet}
        className="sticky top-0 z-10 -mx-4 mb-1 hidden h-6 w-[calc(100%+2rem)] place-items-center bg-white focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus max-[767px]:grid"
      >
        <span aria-hidden="true" className="block h-1 w-9 rounded-full bg-[#d4dbe6]" />
      </button>

      {isSim ? (
        <div>
          <h2 className="m-0 mb-1 text-[15px] font-semibold text-ink">จำลองลูกค้า</h2>
          <p className="m-0 mb-3 text-[12px] leading-[1.5] text-secondary">
            ดูว่าลูกค้าเดินเข้า สั่งอาหาร และหาที่นั่งได้สะดวกไหม
          </p>
          <SimulationPanel live={live} onFocusIssue={onFocusIssue} onToast={onToast} />
        </div>
      ) : activeTab === "add" && selectedTable ? (
        <TableSetEditPanel
          table={selectedTable}
          onBack={() => actions().selectObject(null)}
          onToast={onToast}
        />
      ) : activeTab === "add" && selectedCounter ? (
        <CounterEditPanel counter={selectedCounter} onBack={() => actions().selectObject(null)} onToast={onToast} />
      ) : activeTab === "shop" ? (
        <div>
          <h2 className="m-0 mb-1 text-[15px] font-semibold text-ink">ขนาดร้านและทางเข้า</h2>
          <p className="m-0 mb-3 text-[12px] leading-[1.5] text-secondary">
            ร้าน 2–30 ม. ปรับทีละ 25 ซม.<span className="max-[767px]:hidden"> · กด Enter หรือออกจากช่องเพื่อใช้ค่า</span>
          </p>
          <RoomSettingsForm />
          <div className="mt-4 border-t border-line pt-4">
            <LightingSettingsPanel />
          </div>
        </div>
      ) : activeTab === "check" ? (
        <div>
          <h2 className="m-0 mb-1 text-[15px] font-semibold text-ink">ตรวจผังและจำลอง</h2>
          <p className="m-0 mb-3 text-[12px] leading-[1.5] text-secondary">
            ผังต้องผ่านการตรวจก่อน แล้วตั้งค่าการจำลองและกดเริ่ม
          </p>
          <SimulationPanel live={live} onFocusIssue={onFocusIssue} onToast={onToast} />
        </div>
      ) : configuringTable ? (
        <TableSetCreatePanel onBack={() => setConfiguringTable(false)} onCreate={handleCreateTableSet} />
      ) : (
        /* Tab "add" */
        <div>
          {metrics && (
            <div className="mb-3.5 rounded-[12px] border border-line bg-[#edf4fe] p-3 text-[12px] text-ink">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-blue">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M3 3v18h18M7 15l4-4 4 4 5-6" />
                </svg>
                ผลจำลองรอบล่าสุด
              </div>
              <p className="m-0 text-[11.5px] leading-[1.5] text-secondary">
                ลูกค้าเข้าร้าน {metrics.arrived} คน · รับบริการ {metrics.served} คน · นั่งทาน {metrics.seated} คน
                {metrics.noSeat > 0 && ` · เดินกลับเพราะไม่มีที่นั่ง ${metrics.noSeat} คน`}
              </p>
            </div>
          )}

          <h2 className="m-0 mb-1 text-[15px] font-semibold text-ink">เพิ่มลงผัง</h2>
          <p className="m-0 mb-3 text-[12px] leading-[1.5] text-secondary">
            กดเพื่อวางบนผัง แล้วลากไปตำแหน่งที่ต้องการ
          </p>

          {/* มือถือ: 3 ไทล์เรียงแถวเดียว เห็นครบทุกชนิดโดยไม่ต้องเลื่อน */}
          <div className="cat-list grid gap-2 max-[767px]:grid-cols-3">
            {PALETTE.map((item) => (
              <PaletteItem
                key={item.key}
                name={item.name}
                size={item.size}
                icon={item.icon}
                compactOnMobile
                onClick={() => {
                  if ("configuresTable" in item) {
                    setConfiguringTable(true);
                    return;
                  }
                  if ("isKitchenDoor" in item) {
                    const { kitchenDoor } = actions().layout;
                    if (kitchenDoor) {
                      onToast("มีประตูครัวแล้ว — ลากบนผังหรือปรับในแท็บร้าน");
                    } else {
                      const ok = actions().addKitchenDoor();
                      if (ok) {
                        onToast("เพิ่มประตูครัวแล้ว ลากบนผนังเพื่อย้าย");
                      } else {
                        onToast("ไม่มีผนังว่างพอสำหรับวางประตูครัว");
                      }
                    }
                    if (typeof window !== "undefined" && window.innerWidth < 768 && onToggleSheet) {
                      onToggleSheet();
                    }
                    return;
                  }
                  item.add();
                  onToast(`เพิ่ม${item.name}แล้ว ลากไปตำแหน่งที่ต้องการได้เลย`);
                  if (typeof window !== "undefined" && window.innerWidth < 768 && onToggleSheet) {
                    onToggleSheet();
                  }
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleApplyTemplate}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-blue px-3 py-2.5 text-[13px] font-medium text-blue hover:bg-blue-soft focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            ใช้ผังตัวอย่าง (คาเฟ่ 8×6 ม.)
          </button>

          <p className="mb-0 mt-3 text-[11px] leading-[1.6] text-secondary max-[767px]:hidden">
            คีย์ลัด: ลูกศรขยับ 25 ซม. (Shift = 1 ม.) · R หมุน · Delete ลบ · Esc ยกเลิกเลือก
          </p>
        </div>
      )}

    </aside>
  );
}
