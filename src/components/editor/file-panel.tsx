"use client";

/**
 * ไฟล์ผังร้าน: นำเข้า/ส่งออก JSON (feat-029), ภาพ PNG/SVG และรายงานสำหรับพิมพ์/บันทึก PDF (feat-025, feat-026)
 */
import * as React from "react";
import { renderPlanSvg } from "@/core/export";
import { createLayoutFile, importLayoutFile, layoutFileName, serializeLayoutFile } from "@/core/io";
import { randomId } from "@/core/layout";
import { Button } from "@/components/ui";
import { summarizeIssues } from "@/components/validation/use-live-validation";
import { downloadBlob, downloadText, svgToPngBlob } from "@/lib/export-client";
import { layoutStore } from "@/store/use-layout-store";

type Message = { tone: "ok" | "error"; title: string; details: string[] };

/** ผังปัจจุบัน + ผลตรวจทางการ (ตรวจใหม่ทุกครั้งก่อนส่งออก) */
function currentPlan() {
  const store = layoutStore.getState();
  const validation = store.runValidation();
  return { layout: store.layout, validation };
}

function planSvg() {
  const { layout, validation } = currentPlan();
  return { layout, svg: renderPlanSvg(layout, { severityById: summarizeIssues(validation.issues).severityById }) };
}

export function FilePanel() {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [message, setMessage] = React.useState<Message | null>(null);
  const [busy, setBusy] = React.useState(false);

  const exportJson = () => {
    const { layout, validation } = currentPlan();
    downloadText(serializeLayoutFile(createLayoutFile(layout, validation)), layoutFileName(layout, new Date()), "application/json");
    setMessage({
      tone: "ok",
      title: "ส่งออกไฟล์ JSON แล้ว",
      details: validation.status === "blocked" ? ["ผังยังมีจุดที่ต้องแก้ — ไฟล์นี้เก็บงานได้ แต่ส่งต่อไปจำลอง (P2) ไม่ได้"] : [],
    });
  };

  const exportSvg = () => {
    const { layout, svg } = planSvg();
    downloadText(svg, layoutFileName(layout, new Date(), "svg"), "image/svg+xml");
  };

  const exportPng = async () => {
    setBusy(true);
    try {
      const { layout, svg } = planSvg();
      downloadBlob(await svgToPngBlob(svg, 2), layoutFileName(layout, new Date(), "png"));
    } catch (error) {
      setMessage({ tone: "error", title: "ส่งออกภาพ PNG ไม่สำเร็จ", details: [error instanceof Error ? error.message : String(error)] });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // เลือกไฟล์เดิมซ้ำได้
    if (!file) return;
    const result = importLayoutFile(await file.text(), randomId);
    if (!result.ok) {
      setMessage({ tone: "error", title: `นำเข้า “${file.name}” ไม่สำเร็จ`, details: result.errors });
      return;
    }
    layoutStore.getState().replaceLayout(result.layout);
    setMessage({ tone: "ok", title: `นำเข้า “${file.name}” แล้ว — กดย้อนกลับเพื่อกลับไปผังเดิมได้`, details: result.notes });
  };

  return (
    <div data-testid="file-panel">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={exportJson}>
          ส่งออก JSON
        </Button>
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          นำเข้า JSON
        </Button>
        <Button variant="secondary" size="sm" onClick={exportPng} disabled={busy}>
          ภาพ PNG
        </Button>
        <Button variant="secondary" size="sm" onClick={exportSvg}>
          ภาพ SVG
        </Button>
        <Button variant="secondary" size="sm" className="col-span-2" onClick={() => window.print()} aria-keyshortcuts="Control+P Meta+P">
          พิมพ์รายงาน / บันทึก PDF
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-label="เลือกไฟล์ผังร้าน JSON"
        data-testid="import-input"
        onChange={onFile}
      />
      <div aria-live="polite" data-testid="file-message">
        {message && (
          <div
            className={
              message.tone === "ok"
                ? "mt-3 rounded-[8px] bg-blue-soft px-3 py-2 text-[12px] leading-[1.75] text-ink"
                : "mt-3 rounded-[8px] bg-[#fdeeed] px-3 py-2 text-[12px] leading-[1.75] text-[#9d3a33]"
            }
          >
            <p className="m-0 font-semibold">{message.title}</p>
            {message.details.length > 0 && (
              <ul className="m-0 mt-1 list-disc pl-4">
                {message.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
