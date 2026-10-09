"use client";

/**
 * แผงจำลองลูกค้า P2 + Validation Gate (PRD C-05/C-06, SKILL กฎข้อ 7)
 * ปุ่ม "เริ่มจำลอง" ถูก disabled ทันทีเมื่อผัง Blocked และกดได้เมื่อ Ready / Warning เท่านั้น
 * (Controller ตรวจซ้ำอีกชั้นก่อนส่งไป Worker และ Worker ตรวจซ้ำอีกชั้น)
 */
import * as React from "react";
import { Button } from "@/components/ui";
import { PanelTitle } from "@/components/editor/panel-title";
import type { LiveValidation } from "@/components/validation/use-live-validation";
import { cn } from "@/lib/cn";
import { layoutStore } from "@/store/use-layout-store";
import { CUSTOMER_RATE_OPTIONS, SPEED_OPTIONS, useSimulationStore } from "@/store/use-simulation-store";
import { getSimulationController } from "./simulation-controller";
import { AGENT_LEGEND } from "./simulation-overlay";

export function formatSimTime(seconds: number): string {
  const total = Math.floor(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} ชม. ${String(m).padStart(2, "0")} นาที` : `${m} นาที`;
}

const selectClass =
  "mt-1.5 block min-h-10 w-full rounded-[7px] border border-[#dce4ef] bg-white px-2 text-[14px] text-ink focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus";

export function SimulationPanel({ live }: { live: LiveValidation }) {
  const status = useSimulationStore((s) => s.status);
  const message = useSimulationStore((s) => s.message);
  const metrics = useSimulationStore((s) => s.metrics);
  const seats = useSimulationStore((s) => s.seats);
  const config = useSimulationStore((s) => s.config);
  const setConfig = useSimulationStore((s) => s.setConfig);
  const reasonId = React.useId();

  const blocked = live.result.status === "blocked";
  const idle = status === "idle" || status === "starting";
  const controller = () => getSimulationController();

  const start = async () => {
    if (layoutStore.getState().is3DView) layoutStore.getState().set3DView(false);
    await controller().start();
  };

  const note = blocked
    ? `ต้องแก้ผัง ${live.blockedCount} ข้อก่อน ปุ่มเริ่มจำลองจะกดได้เมื่อผังพร้อม`
    : message ?? (status === "starting" ? "กำลังตรวจผังและเตรียมการจำลอง…" : status === "idle" ? "ผังพร้อมจำลองลูกค้าแล้ว" : null);

  return (
    <section className="min-w-0" aria-labelledby="simulation-title">
      <PanelTitle id="simulation-title">จำลองลูกค้า</PanelTitle>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[12px] text-secondary">
          ลูกค้า / ชั่วโมง
          <select className={selectClass} value={config.customersPerHour} disabled={!idle} onChange={(e) => setConfig({ customersPerHour: Number(e.target.value) })}>
            {CUSTOMER_RATE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v} คน
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12px] text-secondary">
          ความเร็ว
          <select className={selectClass} value={config.speed} onChange={(e) => void controller().setSpeed(Number(e.target.value))}>
            {SPEED_OPTIONS.map((v) => (
              <option key={v} value={v}>
                ×{v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3">
        {idle ? (
          <Button
            className="w-full"
            disabled={blocked || status === "starting"}
            aria-describedby={reasonId}
            data-testid="start-simulation"
            onClick={() => void start()}
          >
            {blocked ? "เริ่มจำลอง (ต้องแก้ผังก่อน)" : status === "starting" ? "กำลังเตรียม…" : "▶ เริ่มจำลอง"}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={() => void (status === "running" ? controller().pause() : controller().resume())}>
              {status === "running" ? "⏸ หยุดชั่วคราว" : "▶ เล่นต่อ"}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void controller().stop()}>
              ■ หยุดจำลอง
            </Button>
          </div>
        )}
      </div>
      <p
        id={reasonId}
        role="status"
        aria-live="polite"
        className={cn("mb-0 mt-2 min-h-[1.75em] text-[12px] leading-[1.75]", blocked ? "text-[#c64c45]" : "text-[#637590]")}
      >
        {note}
      </p>

      {metrics && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] leading-[1.6]" data-testid="simulation-metrics">
          {[
            ["เวลาจำลอง", formatSimTime(metrics.time)],
            ["ลูกค้าในร้าน", `${metrics.inStore} คน`],
            ["รอคิว (สูงสุด)", `${metrics.queuing} (${metrics.maxQueue}) คน`],
            ["นั่งทาน", `${metrics.seated} / ${seats} ที่`],
            ["ทานเสร็จแล้ว", `${metrics.served} คน`],
            ["ไม่มีที่นั่ง", `${metrics.noSeat} คน`],
            ["เวลาเฉลี่ยในร้าน", metrics.avgVisitMinutes > 0 ? `${metrics.avgVisitMinutes.toFixed(1)} นาที` : "—"],
          ].map(([term, value]) => (
            <div key={term} className="min-w-0">
              <dt className="text-secondary">{term}</dt>
              <dd className="m-0 font-semibold tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(status !== "idle" || metrics) && (
        <ul className="m-0 mt-3 grid list-none gap-1 p-0 text-[12px] text-secondary" aria-label="สัญลักษณ์บนผัง">
          {AGENT_LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 rounded-full border border-white shadow-[0_0_0_1px_#cbd5e3]" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-5 rounded-[3px] bg-[linear-gradient(90deg,rgba(59,98,244,0.35),rgba(228,104,93,0.65))]" />
            Heatmap ความหนาแน่นทางเดิน
          </li>
        </ul>
      )}
    </section>
  );
}
