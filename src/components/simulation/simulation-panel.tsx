"use client";

/**
 * แผงจำลองลูกค้า P2 + Validation Gate (PRD C-05/C-06, §9 ข้อ 9–10, SKILL กฎข้อ 7, feat-055)
 * แท็บเดียว 2 ขั้น:
 * (1) ตรวจผัง: ผ่านแสดงกล่องเขียวสั้น, ติดแสดงรายการ "ต้องแก้ก่อนจำลอง" กดแล้วเลือกวัตถุ, คำแนะนำพับไว้
 * (2) จำลองร้าน 1 วัน (feat-095): ร้าน / พนักงานตามผัง / ลูกค้าวันนี้, ความเร็ว, Heatmap, ปุ่มเริ่ม
 *     กดเริ่ม → คำนวณทั้งวันเบื้องหลัง → การ์ดคำตอบ 3 ข้อ (DayAnswers) + ดูภาพช่วงคนเยอะ (หยุดเองตอนจบ)
 *
 * ตอน Blocked: ปุ่มเริ่มใช้ aria-disabled="true" (ไม่ disabled เงียบๆ), ข้อความ "แก้อีก N ข้อก่อนเริ่ม",
 * กดแล้วพาไปโฟกัสข้อแรกที่ต้องแก้ และไม่เริ่มจำลองเด็ดขาด
 */
import * as React from "react";
import { Button } from "@/components/ui";
import type { LiveValidation } from "@/components/validation/use-live-validation";
import { cn } from "@/lib/cn";
import { layoutActions as actions, layoutStore } from "@/store/use-layout-store";
import {
  SPEED_OPTIONS,
  useSimulationStore,
} from "@/store/use-simulation-store";
import { formatClock, formatNumber } from "@/lib/day-config";
import { parseClock } from "@/core/simulation";
import { DayAnswers } from "./day-answers";
import { DaySetupForm } from "./day-setup-form";
import { getSimulationController } from "./simulation-controller";
import { AGENT_LEGEND } from "./simulation-overlay";

export function formatSimTime(seconds: number): string {
  const total = Math.floor(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} ชม. ${String(m).padStart(2, "0")} นาที` : `${m} นาที`;
}

/** เริ่มจำลอง (ใช้ร่วมกันระหว่างแผงจำลองและแถบสถานะ) — สลับกลับมุมมอง 2D ก่อน */
export async function startSimulation() {
  if (layoutStore.getState().is3DView) layoutStore.getState().set3DView(false);
  return getSimulationController().start();
}

export interface SimulationPanelProps {
  live: LiveValidation;
  onFocusIssue?: (index: number) => void;
  onToast?: (message: string) => void;
}

export function SimulationPanel({
  live,
  onFocusIssue,
  onToast = () => {},
}: SimulationPanelProps) {
  const status = useSimulationStore((s) => s.status);
  const metrics = useSimulationStore((s) => s.metrics);
  const seats = useSimulationStore((s) => s.seats);
  const config = useSimulationStore((s) => s.config);
  const analysis = useSimulationStore((s) => s.analysis);
  const showHeatmap = useSimulationStore((s) => s.showHeatmap);
  const setShowHeatmap = useSimulationStore((s) => s.setShowHeatmap);
  const reasonId = React.useId();

  const blocked = live.result.status === "blocked";
  const openMinute = parseClock(config.openTime) ?? 0;
  const isRunningOrPaused = status === "running" || status === "paused";
  const controller = () => getSimulationController();

  const blockedIssues = live.humanIssues?.filter((i) => i.severity === "blocked") ?? [];
  const warningIssues = live.humanIssues?.filter((i) => i.severity === "warning") ?? [];

  const handleSelectIssue = (issueIndex: number, objectId?: string) => {
    if (objectId) {
      actions().selectObject(objectId);
    }
    if (onFocusIssue) {
      onFocusIssue(issueIndex);
    }
  };

  const handleStartClick = async () => {
    if (blocked) {
      onToast(`ยังเริ่มจำลองไม่ได้ — ต้องแก้อีก ${live.blockedCount} ข้อ`);
      if (blockedIssues[0]?.objectIds[0]) {
        handleSelectIssue(0, blockedIssues[0].objectIds[0]);
      } else if (onFocusIssue) {
        onFocusIssue(0);
      }
      return;
    }
    if (status === "starting") return;
    const result = await startSimulation();
    // เริ่มไม่ได้ (เช่น คำนวณทั้งวันไม่สำเร็จ) ต้องบอกผู้ใช้ ไม่ใช่เงียบ — ยกเลิกเองไม่ต้องแจ้ง
    if (!result.ok && result.reason !== "ยกเลิกการเริ่มจำลอง") onToast(result.reason);
  };

  return (
    <div className="min-w-0" data-testid="simulation-panel">
      {/* ── โหมดจำลองกำลังทำงาน (Running / Paused) ──────────────── */}
      {isRunningOrPaused ? (
        <div>
          <div className="mb-3.5 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 justify-center"
              onClick={() => void (status === "running" ? controller().pause() : controller().resume())}
            >
              {status === "running" ? "⏸ หยุดชั่วคราว" : "▶ เล่นต่อ"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              data-testid="stop-simulation"
              className="flex-1 justify-center"
              onClick={() => void controller().stop()}
            >
              ■ จบรอบ
            </Button>
          </div>

          {metrics && (
            <dl
              className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-[12px] border border-line bg-surface p-3 text-[12px] leading-[1.6]"
              data-testid="simulation-metrics"
            >
              {[
                ["เวลาในร้าน", analysis ? `${formatClock(openMinute + metrics.time / 60)} น.` : formatSimTime(metrics.time)],
                ["ลูกค้าในร้าน", `${metrics.inStore} คน`],
                ["นั่งที่โต๊ะ", `${metrics.seated} / ${seats} ที่`],
                ["รอหน้าเข้า", `${metrics.waitingEntrance} คน`],
                ["รออาหารเฉลี่ย", metrics.fed > 0 ? `${formatNumber(metrics.avgFoodWaitMinutes)} นาที` : "—"],
                ["รอโต๊ะเฉลี่ย", metrics.avgEntranceWaitMinutes > 0 ? `${formatNumber(metrics.avgEntranceWaitMinutes)} นาที` : "—"],
                ["จ่ายเงินแล้ว", `${metrics.served} คน`],
              ].map(([term, value]) => (
                <div key={term} className="min-w-0">
                  {/* secondary บน bg-surface ได้ 4.45:1 (ไม่ถึง AA) — ใช้ secondary-strong 4.77:1 */}
                  <dt className="text-secondary-strong">{term}</dt>
                  <dd className="m-0 font-semibold tabular-nums text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mb-3.5 space-y-2.5">
            <div>
              <label className="mb-1 block text-[11.5px] text-secondary">ความเร็วจำลอง <span className="text-secondary">(x1 = 1 วินาทีจริง : 1 นาทีในร้าน)</span></label>
              <div className="flex rounded-[8px] border border-line bg-surface p-0.5" role="group" aria-label="ความเร็วจำลอง">
                {SPEED_OPTIONS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    aria-pressed={config.speed === spd}
                    onClick={() => void controller().setSpeed(spd)}
                    className={cn(
                      "flex-1 rounded-[6px] py-1 text-center text-[12px] font-medium transition-colors cursor-pointer",
                      config.speed === spd
                        ? "bg-white font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                        : "text-[#41536b] hover:text-ink",
                    )}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-ink cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
                className="size-4 rounded border-line text-blue focus:ring-blue"
              />
              <span>แสดงจุดที่คนเดินหนาแน่น (Heatmap)</span>
            </label>
          </div>

          {analysis?.plan.peak && (
            <p className="mb-3 text-[11.5px] leading-[1.7] text-secondary-strong">
              กำลังดูช่วงคนเยอะ {formatClock(openMinute + analysis.plan.peak.startSeconds / 60)}–
              {formatClock(openMinute + analysis.plan.peak.endSeconds / 60)} น. · ภาพจะหยุดเองเมื่อจบช่วงนี้
            </p>
          )}
          {analysis && <DayAnswers analysis={analysis} openMinute={openMinute} />}

          {/* blue บน blue-soft ได้ 4.39:1 — ใช้ blue-hover ให้ผ่าน AA เหมือนจุดอื่น */}
          <div className="mt-3 rounded-[10px] bg-blue-soft p-2.5 text-[12px] text-blue-hover">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>ผังถูกล็อกระหว่างจำลอง ถ้าจะแก้ให้กด &ldquo;จบรอบ&rdquo; หรือ &ldquo;กลับไปแก้ผัง&rdquo;</span>
            </div>
          </div>

          <ul className="m-0 mt-3.5 grid list-none gap-1.5 p-0 text-[12px] text-secondary" aria-label="สัญลักษณ์บนผัง">
            {AGENT_LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full border border-white shadow-[0_0_0_1px_#cbd5e3]"
                  style={{ background: item.color }}
                />
                {item.label}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-5 rounded-[3px] bg-[linear-gradient(90deg,rgba(59,98,244,0.35),rgba(228,104,93,0.65))]"
              />
              Heatmap ความหนาแน่นทางเดิน
            </li>
          </ul>

        </div>
      ) : (
        /* ── โหมดเตรียมการจัดร้าน & ตรวจผัง (Edit / Idle) ─────────── */
        <div>
          {analysis && <DayAnswers analysis={analysis} openMinute={openMinute} />}

          {/* สรุปผลจำลองรอบล่าสุด (feat-057) — ภาพช่วงที่ดู */}
          {metrics && (
            <div className="mb-4 rounded-[12px] border border-line bg-surface p-3 text-[12px]" data-testid="latest-sim-summary">
              <div className="mb-2 flex items-center justify-between">
                <b className="flex items-center gap-1.5 font-semibold text-ink">
                  <svg viewBox="0 0 24 24" className="size-4 text-blue" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M3 3v18h18M7 15l4-4 4 4 5-6" />
                  </svg>
                  สรุปผลจำลองรอบล่าสุด
                </b>
                <span className="text-[11px] text-secondary tabular-nums">
                  {analysis?.plan.peak
                    ? `ช่วง ${formatClock(openMinute + analysis.plan.peak.startSeconds / 60)}–${formatClock(openMinute + metrics.time / 60)} น.`
                    : formatSimTime(metrics.time)}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 rounded-[8px] bg-white p-2.5 text-[11.5px] border border-line">
                <div>
                  <dt className="text-secondary">ลูกค้าเข้ามา</dt>
                  <dd className="m-0 font-semibold text-ink tabular-nums">{metrics.arrived} คน</dd>
                </div>
                <div>
                  <dt className="text-secondary">รับบริการแล้ว</dt>
                  <dd className="m-0 font-semibold text-ink tabular-nums">{metrics.served} คน</dd>
                </div>
                <div>
                  <dt className="text-secondary">นั่งทาน</dt>
                  <dd className="m-0 font-semibold text-ink tabular-nums">{metrics.seated} / {seats} ที่</dd>
                </div>
                <div>
                  <dt className="text-secondary">ไม่มีที่นั่ง</dt>
                  <dd className="m-0 font-semibold text-ink tabular-nums">{metrics.noSeat} คน</dd>
                </div>
              </dl>

              {/* คำแนะนำ 1 ประโยค (PRD §9 ข้อ 11, feat-057) */}
              <div className="mt-2.5 flex items-start gap-2 rounded-[8px] bg-[#fffbeb] border border-[#fef3c7] p-2 text-[11.5px] text-[#92400e]">
                <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-[#d97706]" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 2.5 5.5.5.5.5 1.5.5 2.5h8c0-1 0-2 .5-2.5 1-1 2.5-3 2.5-5.5a7 7 0 0 0-7-7z" />
                </svg>
                <span>
                  {(controller().heatmap?.max ?? 0) > 0
                    ? "บริเวณสีแดงบนผังคือทางที่คนเดินผ่านหนาแน่น ลองขยายทางเดินตรงนั้นหรือย้ายเคาน์เตอร์ให้ห่างประตู"
                    : "การสัญจรลื่นไหลดี ไม่พบจุดที่คนเดินแออัด"}
                  {metrics.maxEntranceQueue > 0
                    ? " · มีคิวรอหน้าเข้า ลองเพิ่มโต๊ะหรือเพิ่มพนักงานเก็บโต๊ะ"
                    : metrics.noSeat > 0 && " · ที่นั่งไม่พอช่วงพีค ลองเพิ่มโต๊ะ"}
                </span>
              </div>

              <label className="mt-2.5 flex items-center gap-2 text-[11.5px] text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={(e) => setShowHeatmap(e.target.checked)}
                  className="size-3.5 rounded border-line text-blue focus:ring-blue"
                />
                <span>แสดงจุดหนาแน่นบนผัง (จาง)</span>
              </label>
            </div>
          )}

          {/* ขั้นที่ 1: ตรวจผัง */}
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white",
                  blocked ? "bg-status-blocked" : "bg-status-ready",
                )}
              >
                {blocked ? "1" : "✓"}
              </span>
              ตรวจผัง
            </div>

            {blocked ? (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-danger">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  ต้องแก้ก่อนจำลอง ({live.blockedCount})
                </div>
                <p className="mb-2 text-[11.5px] text-secondary">กดแต่ละข้อเพื่อดูจุดนั้นบนผัง</p>

                <div className="grid gap-2">
                  {blockedIssues.map((issue, idx) => (
                    <button
                      key={issue.id}
                      type="button"
                      onClick={() => handleSelectIssue(idx, issue.objectIds[0])}
                      className="flex w-full items-start gap-2.5 rounded-[12px] border border-line bg-white p-2.5 text-left transition-colors hover:border-danger hover:bg-[#fff9f9] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus cursor-pointer"
                    >
                      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-status-blocked text-[11px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <b className="block text-[12.5px] font-semibold text-ink leading-tight">{issue.title}</b>
                        <small className="mt-0.5 block text-[11.5px] leading-snug text-secondary">{issue.hint}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-[12px] border border-[#d1fae5] bg-[#f0fdf4] p-3 text-ink">
                <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-status-ready" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <div>
                  <b className="block text-[13px] font-semibold text-[#065f46]">ผังผ่านการตรวจ</b>
                  <small className="block text-[11.5px] text-[#047857]">ทางเดิน ระยะเก้าอี้ ทางเข้า และการชนกัน</small>
                </div>
              </div>
            )}

            {warningIssues.length > 0 && (
              <details className="mt-2.5 rounded-[10px] border border-line bg-surface p-2 text-[12px]">
                <summary className="cursor-pointer font-medium text-ink select-none py-0.5">
                  คำแนะนำ — ไม่แก้ก็จำลองได้ ({warningIssues.length})
                </summary>
                <div className="mt-2 grid gap-1.5 border-t border-line pt-2">
                  {warningIssues.map((issue, idx) => (
                    <button
                      key={issue.id}
                      type="button"
                      onClick={() => handleSelectIssue(blockedIssues.length + idx, issue.objectIds[0])}
                      className="flex w-full items-start gap-2 rounded-[8px] bg-white p-2 text-left hover:bg-[#fffdf5] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus cursor-pointer"
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-status-warning text-[10px] font-bold text-white">
                        !
                      </span>
                      <div className="min-w-0 flex-1">
                        <b className="block text-[12px] text-ink">{issue.title}</b>
                        <small className="block text-[11px] text-secondary">{issue.hint}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* ขั้นที่ 2: ตั้งค่าการจำลอง */}
          <div className="border-t border-line pt-3.5">
            <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white", blocked ? "bg-[#94a3b8]" : "bg-blue")}>
                2
              </span>
              จำลองร้าน 1 วัน
            </div>

            <div className="space-y-3">
              <DaySetupForm disabled={status !== "idle"} />

              <div className="border-t border-line pt-3.5">
                <label className="mb-1.5 block text-[12px] text-secondary">ความเร็วภาพจำลอง <span className="text-secondary">(x1 = 1 วินาทีจริง : 1 นาทีในร้าน)</span></label>
                <div className="flex rounded-[8px] border border-line bg-surface p-0.5" role="group" aria-label="ความเร็วจำลอง">
                  {SPEED_OPTIONS.map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      aria-pressed={config.speed === spd}
                      onClick={() => void controller().setSpeed(spd)}
                      className={cn(
                        "flex-1 rounded-[6px] py-1 text-center text-[12px] font-medium transition-colors cursor-pointer",
                        config.speed === spd
                          ? "bg-white font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                          : "text-[#41536b] hover:text-ink",
                      )}
                    >
                      {spd}×
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-[12px] text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={(e) => setShowHeatmap(e.target.checked)}
                  className="size-4 rounded border-line text-blue focus:ring-blue"
                />
                <span>แสดงจุดที่คนเดินหนาแน่น (Heatmap)</span>
              </label>

              <button
                type="button"
                data-testid="start-simulation"
                aria-disabled={blocked || status === "starting"}
                aria-describedby={reasonId}
                onClick={handleStartClick}
                className={cn(
                  "mt-2 flex w-full items-center justify-center gap-2 rounded-[12px] py-2.5 text-[13.5px] font-medium transition-colors focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus cursor-pointer",
                  blocked
                    ? "border border-line bg-surface text-secondary hover:bg-[#edf1f7]"
                    : "bg-blue text-white shadow-card hover:bg-blue-hover",
                )}
              >
                {blocked ? (
                  <>
                    <svg viewBox="0 0 24 24" className="size-4 text-secondary" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>แก้อีก {live.blockedCount} ข้อก่อนเริ่ม</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="size-4 fill-current">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>{status === "starting" ? "กำลังคำนวณทั้งวัน…" : analysis || metrics ? "จำลองร้านอีกครั้ง" : "จำลองร้าน 1 วัน"}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <p id={reasonId} className="sr-only">
            {blocked
              ? `ต้องแก้ผัง ${live.blockedCount} ข้อก่อน ปุ่มเริ่มจำลองจะกดได้เมื่อผังพร้อม`
              : "ผังพร้อมจำลอง กดแล้วระบบจะคำนวณทั้งวันก่อน แล้วแสดงภาพช่วงคนเยอะ"}
          </p>
        </div>
      )}
    </div>
  );
}
