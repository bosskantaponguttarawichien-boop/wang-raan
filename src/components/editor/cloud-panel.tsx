"use client";

/**
 * บัญชีและผังออนไลน์ (feat-031 Session, feat-033 React Query, feat-030 Share)
 * ทุกสถานะ Loading / Error แสดงเป็นข้อความภาษาไทยใน live region
 */
import { signIn, signOut, useSession } from "next-auth/react";
import * as React from "react";
import { STATUS_LABEL, Button } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import {
  useDeleteLayoutMutation,
  useLayoutsQuery,
  useLoadLayout,
  useSaveLayoutMutation,
  useShareMutation,
  useSharesQuery,
} from "@/lib/layout-queries";
import { layoutStore, useLayoutStore } from "@/store/use-layout-store";
import { ExpirySelect, ShareLinks, expiresAtFor, type ExpiryChoice } from "./share-links";

/** ระบบจัดเก็บล่ม/ติดต่อไม่ได้ — ร่างผังยังอยู่ใน localStorage ของเครื่องนี้ (บันทึกอัตโนมัติ) */
const KEEPS_DRAFT = new Set(["BACKEND_ERROR", "BACKEND_NOT_CONFIGURED", "NETWORK_ERROR", "HTTP_502", "HTTP_503", "HTTP_504"]);

const errorText = (error: unknown) => {
  if (!(error instanceof ApiError)) return "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
  if (error.code === "LAYOUT_BLOCKED") return "ผังยังไม่ผ่านกฎจำเป็น จึงบันทึกไม่ได้ — แก้ตามแถบสถานะก่อน";
  if (KEEPS_DRAFT.has(error.code)) return `${error.message} — ผังยังอยู่ในเครื่องนี้ ไม่หาย`;
  return error.message;
};

const timeText = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

export function CloudPanel() {
  const { data: session, status } = useSession();
  const [signingIn, setSigningIn] = React.useState(false);
  const [signInError, setSignInError] = React.useState<string | null>(null);

  if (status === "loading") {
    return (
      <p role="status" className="m-0 text-[13px] leading-[1.75] text-secondary" data-testid="cloud-panel">
        กำลังตรวจสอบการเข้าสู่ระบบ…
      </p>
    );
  }

  if (!session) {
    const guest = async () => {
      setSigningIn(true);
      setSignInError(null);
      const result = await signIn("guest", { redirect: false }).catch(() => null);
      if (!result || result.error) setSignInError("เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
      else window.location.reload(); // โหลด session ใหม่ทั้งหน้า (ร่างผังถูกกู้คืนจาก localStorage)
      setSigningIn(false);
    };
    return (
      <div data-testid="cloud-panel">
        <p className="m-0 mb-3 text-[13px] leading-[1.75] text-secondary">เข้าสู่ระบบเพื่อบันทึกผังไว้ในบัญชีและสร้างลิงก์แชร์</p>
        <Button variant="secondary" size="sm" className="w-full" disabled={signingIn} onClick={guest}>
          {signingIn ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบแบบผู้ใช้ทั่วไป"}
        </Button>
        {signInError && (
          <p role="alert" className="m-0 mt-2 text-[12px] text-[#b8433b]">
            {signInError}
          </p>
        )}
      </div>
    );
  }

  return <SignedIn name={session.user.name ?? "ผู้ใช้ทั่วไป"} />;
}

function SignedIn({ name }: { name: string }) {
  const layoutId = useLayoutStore((s) => s.layout.id);
  const layouts = useLayoutsQuery(true);
  const save = useSaveLayoutMutation();
  const remove = useDeleteLayoutMutation();
  const share = useShareMutation();
  const load = useLoadLayout();
  const [loadState, setLoadState] = React.useState<{ id: string; error?: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [expiry, setExpiry] = React.useState<ExpiryChoice>("none");
  const expiryId = React.useId();

  const saved = layouts.data?.some((l) => l.id === layoutId) ?? false;
  // รอให้บันทึกเสร็จจริงก่อนโหลดลิงก์: รายการผังอัปเดตล่วงหน้า (optimistic) ทำให้ saved เป็นจริงก่อน Backend สร้างผังเสร็จ
  const fetchShares = saved && !save.isPending;
  const shareList = useSharesQuery(layoutId, fetchShares);
  // ลิงก์ที่เพิ่งสร้าง: แสดงเฉพาะของผังที่เปิดอยู่ และใช้สถานะล่าสุดจากรายการ (ยกเลิก/หมดอายุแล้ว → ซ่อน)
  const created =
    share.data && share.data.layoutId === layoutId ? (shareList.data?.find((s) => s.shareKey === share.data.shareKey) ?? share.data) : null;
  const createdLink = created?.status === "active" ? created : null;

  const open = async (id: string) => {
    setLoadState({ id });
    try {
      const stored = await load(id);
      layoutStore.getState().replaceLayout(stored.layout);
      setLoadState(null);
    } catch (error) {
      setLoadState({ id, error: errorText(error) });
    }
  };

  const shareCurrent = async () => {
    setCopied(false);
    const stored = await save.mutateAsync(layoutStore.getState().layout).catch(() => null);
    if (stored) share.mutate({ layoutId: stored.layout.id, expiresAt: expiresAtFor(expiry) });
  };

  const copy = async (url: string) => {
    await navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false));
  };

  return (
    <div data-testid="cloud-panel">
      <div className="mb-3 flex items-center justify-between gap-2 text-[13px]">
        <span className="min-w-0 truncate" data-testid="signed-in-as">
          เข้าสู่ระบบแล้ว: <strong className="font-semibold">{name}</strong>
        </span>
        <Button variant="ghost" size="sm" className="shrink-0 text-secondary-strong" onClick={() => signOut({ redirectTo: "/playground" })}>
          ออกจากระบบ
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" disabled={save.isPending} onClick={() => save.mutate(layoutStore.getState().layout)}>
          {save.isPending ? "กำลังบันทึก…" : saved ? "บันทึกทับ" : "บันทึกลงบัญชี"}
        </Button>
        <Button variant="secondary" size="sm" disabled={save.isPending || share.isPending} onClick={shareCurrent}>
          {share.isPending ? "กำลังสร้างลิงก์…" : "แชร์ลิงก์"}
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-[12px]">
        <label htmlFor={expiryId} className="text-secondary-strong">
          อายุลิงก์ใหม่
        </label>
        <ExpirySelect id={expiryId} value={expiry} onChange={setExpiry} label="อายุลิงก์ใหม่" />
      </div>

      <div aria-live="polite" className="text-[12px] leading-[1.75]" data-testid="cloud-message">
        {save.isError && (
          <p className="m-0 mt-2 text-[#b8433b]" role="alert">
            {errorText(save.error)}
          </p>
        )}
        {save.isSuccess && !createdLink && <p className="m-0 mt-2 text-secondary-strong">บันทึกแล้วเมื่อ {timeText(save.data.updatedAt)}</p>}
        {share.isError && (
          <p className="m-0 mt-2 text-[#b8433b]" role="alert">
            {errorText(share.error)}
          </p>
        )}
        {createdLink && (
          <div className="mt-2 rounded-[8px] bg-blue-soft px-3 py-2">
            <p className="m-0 font-semibold text-ink">ลิงก์แชร์ (ดูได้โดยไม่ต้องเข้าสู่ระบบ)</p>
            <p className="m-0 text-ink">
              {createdLink.expiresAt ? `ใช้งานได้ถึง ${timeText(createdLink.expiresAt)}` : "ไม่หมดอายุ — ยกเลิกได้ที่รายการด้านล่าง"}
            </p>
            <a href={createdLink.url} className="block break-all text-blue-hover underline" data-testid="share-link" target="_blank" rel="noopener">
              {createdLink.url}
            </a>
            <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={() => copy(createdLink.url)}>
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </Button>
          </div>
        )}
      </div>

      <ShareLinks layoutId={layoutId} visible={saved} fetchEnabled={fetchShares} />

      <h3 className="m-0 mb-2 mt-4 text-[13px] font-semibold">ผังที่บันทึกไว้</h3>
      <SavedList
        layouts={layouts}
        currentId={layoutId}
        loadState={loadState}
        onOpen={open}
        onDelete={(id) => {
          if (window.confirm("ลบผังนี้ออกจากบัญชี?")) remove.mutate(id);
        }}
        deleteError={remove.isError ? errorText(remove.error) : null}
      />
    </div>
  );
}

interface SavedListProps {
  layouts: ReturnType<typeof useLayoutsQuery>;
  currentId: string;
  loadState: { id: string; error?: string } | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  deleteError: string | null;
}

function SavedList({ layouts, currentId, loadState, onOpen, onDelete, deleteError }: SavedListProps) {
  if (layouts.isPending) {
    return (
      <p role="status" className="m-0 text-[12px] text-secondary" data-testid="saved-layouts-loading">
        กำลังโหลดรายการผัง…
      </p>
    );
  }
  if (layouts.isError) {
    return (
      <div role="alert" className="text-[12px] text-[#b8433b]" data-testid="saved-layouts-error">
        <p className="m-0">โหลดรายการไม่สำเร็จ: {errorText(layouts.error)}</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => layouts.refetch()}>
          ลองอีกครั้ง
        </Button>
      </div>
    );
  }
  return (
    <>
      {layouts.data.length === 0 ? (
        <p className="m-0 text-[12px] text-secondary">ยังไม่มีผังที่บันทึกไว้</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0" data-testid="saved-layouts">
          {layouts.data.map((l) => (
            <li key={l.id} className="rounded-[8px] border border-[#e4e9f2] px-3 py-2 text-[12px] leading-[1.6]">
              <p className="m-0 font-semibold text-ink">
                ร้าน {l.width} × {l.depth} ม. · {l.objectCount} ชิ้น{l.id === currentId ? " · กำลังเปิดอยู่" : ""}
              </p>
              <p className="m-0 text-secondary">
                {STATUS_LABEL[l.status]} · {timeText(l.updatedAt)}
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" disabled={loadState?.id === l.id && !loadState.error} onClick={() => onOpen(l.id)}>
                  {loadState?.id === l.id && !loadState.error ? "กำลังเปิด…" : "เปิด"}
                </Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(l.id)} aria-label={`ลบผังร้าน ${l.width} × ${l.depth} ม.`}>
                  ลบ
                </Button>
              </div>
              {loadState?.id === l.id && loadState.error && (
                <p role="alert" className="m-0 mt-1 text-[#b8433b]">
                  {loadState.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {deleteError && (
        <p role="alert" className="m-0 mt-2 text-[12px] text-[#b8433b]">
          ลบไม่สำเร็จ: {deleteError}
        </p>
      )}
      {layouts.isFetching && (
        <p role="status" className="m-0 mt-2 text-[11px] text-secondary">
          กำลังอัปเดตรายการ…
        </p>
      )}
    </>
  );
}
