"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import type { IssueCategory, ValidationIssue } from "@/core/layout";
import { cn } from "@/lib/cn";
import { STATUS_LABEL } from "@/components/ui";
import { layoutStore } from "@/store/use-layout-store";
import type { LiveValidation } from "./use-live-validation";

export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  completeness: "ความครบถ้วนของผัง",
  collision: "การชนและทับซ้อน",
  clearance: "ระยะทางเดิน",
  accessibility: "การเข้าถึง",
};

const DOT = { ready: "bg-status-ready", warning: "bg-status-warning", blocked: "bg-status-blocked" } as const;

function summaryText({ result, blockedCount, warningCount }: LiveValidation): string {
  if (result.status === "blocked") return `ต้องแก้ ${blockedCount} ข้อก่อนเริ่มจำลอง`;
  if (result.status === "warning") return `เริ่มจำลองได้ · ข้อควรระวัง ${warningCount} ข้อ`;
  return "ผ่านทุกกฎ · เริ่มจำลองได้";
}

/** แถบสถานะลอยกึ่งกลางล่างของ Artboard (design-system §2.2 Floating Pill) + Drawer รายการปัญหา */
export function ValidationStatusBar({ live }: { live: LiveValidation }) {
  const [open, setOpen] = React.useState(false);
  const { result } = live;
  const total = result.issues.length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div
        className="pointer-events-auto mx-auto flex w-max max-w-[calc(100%-24px)] items-center gap-2 rounded-pill border border-[var(--status-border)] bg-[var(--status-bg)] py-1 pl-3 pr-1 text-[12px] leading-[1.55] text-ink shadow-status"
        data-status={result.status}
        data-testid="validation-status-bar"
      >
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", DOT[result.status])} />
        <span role="status" aria-live="polite" className="min-w-0">
          <b className="font-semibold">{STATUS_LABEL[result.status]}</b>
          <span className="text-secondary"> · {summaryText(live)}</span>
        </span>
        <Dialog.Trigger
          className="ml-1 min-h-7 shrink-0 rounded-pill bg-blue-soft px-3 text-[12px] font-medium text-blue-hover hover:bg-[#e2e9ff] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-offset-2"
        >
          ดูรายการ ({total})
        </Dialog.Trigger>
      </div>
      <IssueDrawer issues={result.issues} onPick={() => setOpen(false)} />
    </Dialog.Root>
  );
}

function IssueDrawer({ issues, onPick }: { issues: ValidationIssue[]; onPick: () => void }) {
  const groups = (Object.keys(CATEGORY_LABEL) as IssueCategory[])
    .map((category) => ({ category, items: issues.filter((i) => i.category === category) }))
    .filter((g) => g.items.length > 0);

  const pick = (issue: ValidationIssue) => {
    const state = layoutStore.getState();
    const target = issue.objectIds.find((id) => state.layout.objects.some((o) => o.id === id));
    if (target) state.selectObject(target);
    onPick();
  };

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-[#1e2b40]/20" />
      <Dialog.Content
        className="fixed inset-y-0 right-0 z-50 flex w-[min(380px,100vw)] flex-col border-l border-line bg-white shadow-playground focus:outline-none"
        data-surface="playground"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <Dialog.Title className="m-0 text-[16px] font-semibold leading-[1.5]">รายการที่ต้องตรวจ</Dialog.Title>
            <Dialog.Description className="m-0 text-[12px] leading-[1.75] text-secondary">
              เลือกรายการเพื่อไปยังชิ้นงานบนผัง
            </Dialog.Description>
          </div>
          <Dialog.Close
            aria-label="ปิดรายการ"
            className="grid size-9 place-items-center rounded-[8px] text-[18px] text-secondary hover:bg-blue-soft focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
          >
            ×
          </Dialog.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {groups.length === 0 ? (
            <p className="m-0 text-[14px] leading-[1.9] text-secondary">ผังผ่านทุกกฎแล้ว พร้อมเริ่มจำลองลูกค้า</p>
          ) : (
            groups.map(({ category, items }) => (
              <section key={category} className="mb-5">
                <h3 className="m-0 mb-2 text-[13px] font-semibold text-ink">
                  {CATEGORY_LABEL[category]} <span className="font-normal text-secondary">({items.length})</span>
                </h3>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {items.map((issue) => (
                    <li key={issue.id}>
                      <button
                        type="button"
                        onClick={() => pick(issue)}
                        className="flex w-full items-start gap-2 rounded-[8px] border border-[#e4e9f2] bg-white p-2.5 text-left text-[13px] leading-[1.6] text-ink hover:border-[#afbef2] hover:bg-[#f9faff] focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
                      >
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 rounded-[4px] px-1.5 text-[11px] font-semibold leading-[1.6] text-white",
                            issue.severity === "blocked" ? "bg-[#c64c45]" : "bg-[#8a6414]",
                          )}
                        >
                          {issue.severity === "blocked" ? "ต้องแก้" : "ควรดู"}
                        </span>
                        <span>{issue.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
