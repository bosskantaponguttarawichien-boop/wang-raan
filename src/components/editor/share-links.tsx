"use client";

/**
 * จัดการลิงก์แชร์ของผัง (feat-040) — ดูสถานะ, ตั้งอายุใหม่ (ต่ออายุลิงก์ที่หมดอายุได้), คัดลอก, ยกเลิก
 * ลิงก์ที่ยกเลิกแล้วแก้ไม่ได้ (สร้างลิงก์ใหม่แทน)
 */
import * as React from "react";
import { Button, ErrorText, LoadError } from "@/components/ui";
import { apiErrorText, type ShareDto } from "@/lib/api-client";
import { DAY_MS, formatDateTime } from "@/lib/format";
import { useRevokeShareMutation, useSharesQuery, useUpdateShareMutation } from "@/lib/layout-queries";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { inputClass } from "./forms/field";

export const EXPIRY_OPTIONS = [
  { value: "none", label: "ไม่หมดอายุ", days: null },
  { value: "1", label: "1 วัน", days: 1 },
  { value: "7", label: "7 วัน", days: 7 },
  { value: "30", label: "30 วัน", days: 30 },
] as const;

export type ExpiryChoice = (typeof EXPIRY_OPTIONS)[number]["value"];

/** วันหมดอายุจากตัวเลือก (นับจากตอนกด) — null = ไม่หมดอายุ */
export function expiresAtFor(choice: ExpiryChoice, now = Date.now()): string | null {
  const days = EXPIRY_OPTIONS.find((o) => o.value === choice)?.days ?? null;
  return days === null ? null : new Date(now + days * DAY_MS).toISOString();
}

export function shareStatusText(share: Pick<ShareDto, "status" | "expiresAt">): string {
  if (share.status === "revoked") return "ยกเลิกแล้ว";
  if (share.status === "expired") return "หมดอายุแล้ว";
  return share.expiresAt ? `ใช้งานได้ถึง ${formatDateTime(share.expiresAt)}` : "ใช้งานได้ · ไม่หมดอายุ";
}

const STATUS_COLOR: Record<ShareDto["status"], string> = {
  active: "text-[#1f7a5c]",
  expired: "text-[#8a5a00]",
  revoked: "text-[#b8433b]",
};

interface ExpirySelectProps<T extends string> {
  id: string;
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** ตัวเลือกว่างที่ต้องเลือกก่อน (ค่า "") — กันกดยืนยันโดยไม่ได้ตั้งใจเลือกอายุ */
  placeholder?: string;
}

export function ExpirySelect<T extends string = ExpiryChoice>({ id, value, onChange, label, placeholder }: ExpirySelectProps<T>) {
  return (
    <select id={id} aria-label={label} className={inputClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {EXPIRY_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * visible = ผังนี้อยู่ในบัญชีแล้ว (แสดงส่วนนี้)
 * fetchEnabled = โหลดจาก Backend ได้แล้ว — ระหว่างบันทึกยังแสดงข้อมูลเดิมต่อ (ไม่ยุบหายแล้วโผล่ใหม่ทุกครั้งที่บันทึก)
 */
export function ShareLinks({ layoutId, visible, fetchEnabled }: { layoutId: string; visible: boolean; fetchEnabled: boolean }) {
  const shares = useSharesQuery(layoutId, fetchEnabled);
  const update = useUpdateShareMutation();
  const revoke = useRevokeShareMutation();

  if (!visible) return null;
  return (
    <section aria-labelledby="share-links-title" className="mt-4">
      <h3 id="share-links-title" className="m-0 mb-2 text-[13px] font-semibold">
        ลิงก์แชร์ของผังนี้
      </h3>
      {shares.isPending ? (
        <p role="status" className="m-0 text-[12px] text-secondary">
          กำลังโหลดลิงก์แชร์…
        </p>
      ) : shares.isError ? (
        <LoadError message={`โหลดลิงก์แชร์ไม่สำเร็จ: ${apiErrorText(shares.error)}`} onRetry={() => shares.refetch()} />
      ) : shares.data.length === 0 ? (
        <p className="m-0 text-[12px] text-secondary">ยังไม่มีลิงก์แชร์</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0" data-testid="share-links">
          {shares.data.map((share) => (
            <ShareItem
              key={share.shareKey}
              share={share}
              busy={(update.isPending && update.variables?.shareKey === share.shareKey) || (revoke.isPending && revoke.variables?.shareKey === share.shareKey)}
              onUpdate={(expiresAt) => update.mutate({ shareKey: share.shareKey, expiresAt })}
              onRevoke={() => {
                if (window.confirm("ยกเลิกลิงก์นี้? คนที่มีลิงก์จะเปิดดูผังไม่ได้อีก")) revoke.mutate(share);
              }}
            />
          ))}
        </ul>
      )}
      <div aria-live="polite" className="text-[12px]">
        {update.isError && (
          <ErrorText className="mt-2">ตั้งอายุลิงก์ไม่สำเร็จ: {apiErrorText(update.error)}</ErrorText>
        )}
        {revoke.isError && (
          <ErrorText className="mt-2">ยกเลิกลิงก์ไม่สำเร็จ: {apiErrorText(revoke.error)}</ErrorText>
        )}
      </div>
    </section>
  );
}

interface ShareItemProps {
  share: ShareDto;
  busy: boolean;
  onUpdate: (expiresAt: string | null) => void;
  onRevoke: () => void;
}

function ShareItem({ share, busy, onUpdate, onRevoke }: ShareItemProps) {
  const id = React.useId();
  // เริ่มที่ "ยังไม่เลือก" — ค่าเริ่มต้น "ไม่หมดอายุ" ทำให้กดทีเดียวลิงก์ที่ตั้งเวลาไว้กลายเป็นถาวร
  const [choice, setChoice] = React.useState<ExpiryChoice | "">("");
  const { copied, copy } = useCopyToClipboard();
  const created = formatDateTime(share.createdAt);

  return (
    <li className="rounded-[8px] border border-[#e4e9f2] px-3 py-2 text-[12px] leading-[1.6]" data-testid="share-item" data-status={share.status}>
      <p className={`m-0 font-semibold ${STATUS_COLOR[share.status]}`} data-testid="share-status">
        {shareStatusText(share)}
      </p>
      <p className="m-0 text-secondary">สร้างเมื่อ {created}</p>
      <a href={share.url} className="block break-all text-blue-hover underline" target="_blank" rel="noopener" data-testid="share-item-link">
        {share.url}
      </a>
      {share.status !== "revoked" && (
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <ExpirySelect<ExpiryChoice | "">
            id={`${id}-expiry`}
            value={choice}
            onChange={setChoice}
            label={`อายุใหม่ของลิงก์ที่สร้างเมื่อ ${created}`}
            placeholder="เลือกอายุใหม่…"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || choice === ""}
            onClick={() => {
              if (choice === "") return;
              onUpdate(expiresAtFor(choice));
              setChoice("");
            }}
          >
            ตั้งอายุใหม่
          </Button>
          {share.status === "active" && (
            <Button variant="secondary" size="sm" onClick={() => copy(share.url)}>
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            className={share.status === "active" ? "" : "col-span-2"}
            onClick={onRevoke}
            aria-label={`ยกเลิกลิงก์ที่สร้างเมื่อ ${created}`}
          >
            ยกเลิกลิงก์
          </Button>
        </div>
      )}
    </li>
  );
}
