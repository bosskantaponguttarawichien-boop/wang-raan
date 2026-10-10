"use client";

import * as React from "react";
import type { StoreLayout } from "@/core/layout";
import { ViewSwitch } from "@/components/ui";
import { IsometricScene } from "@/components/preview-3d/isometric-view";

/** สลับ 2D (SVG จาก Core ที่ server สร้างให้) ↔ 3D Isometric แบบอ่านอย่างเดียว */
export function ShareViewer({ layout, planSvg }: { layout: StoreLayout; planSvg: string }) {
  const [view, setView] = React.useState<"2d" | "3d">("2d");
  return (
    <div className="flex flex-col items-center gap-4">
      <ViewSwitch
        aria-label="เปลี่ยนมุมมอง"
        value={view}
        onValueChange={setView}
        options={[
          { value: "2d", label: "ผัง 2D" },
          { value: "3d", label: "ตัวอย่าง 3D" },
        ]}
      />
      {view === "2d" ? (
        // SVG สร้างจาก renderPlanSvg (escape ข้อความทุกตัว) — ไม่มี HTML จากผู้ใช้โดยตรง
        <div className="w-full max-w-[760px] [&>svg]:h-auto [&>svg]:w-full" data-testid="share-plan" dangerouslySetInnerHTML={{ __html: planSvg }} />
      ) : (
        <IsometricScene layout={layout} />
      )}
    </div>
  );
}
