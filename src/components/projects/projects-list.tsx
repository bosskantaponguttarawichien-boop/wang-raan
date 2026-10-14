"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import * as React from "react";
import {
  createSampleCafeLayout,
  createStarterLayout,
  randomId,
  type StoreLayout,
} from "@/core/layout";
import { api, type LayoutSummaryDto } from "@/lib/api-client";
import { CreateProjectDialog, type CreateProjectParams } from "./create-project-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { ProjectCard } from "./project-card";

export const LAYOUT_LIMIT = 20;

export function ProjectsList() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();

  const [layouts, setLayouts] = React.useState<LayoutSummaryDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Dialog states
  const [createOpen, setCreateOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Toast state
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const toastTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Auth Protection: หากยังไม่ล็อกอิน ให้ redirect ไป /login?next=/projects
  React.useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace("/login?next=/projects");
    }
  }, [sessionStatus, router]);

  // โหลดรายการผัง
  const fetchLayouts = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listLayouts();
      setLayouts(data);
    } catch {
      setError("โหลดรายการผังไม่ได้ ระบบจัดเก็บขัดข้องชั่วคราว ผังของคุณไม่หาย ลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (sessionStatus === "authenticated") {
      fetchLayouts();
    }
  }, [sessionStatus, fetchLayouts]);

  // ตรวจสอบโควตา
  const isLimitReached = layouts.length >= LAYOUT_LIMIT;

  // เปิด Dialog สร้างผังใหม่
  const handleOpenCreate = () => {
    if (isLimitReached) return;
    setCreateOpen(true);
  };

  // ดำเนินการสร้างผังใหม่ตามพารามิเตอร์
  const handleCreate = async ({ name, width, depth, wall }: CreateProjectParams) => {
    setCreating(true);
    try {
      const id = `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const starter = createStarterLayout({ width, depth, wall }, randomId);
      const newLayout: StoreLayout = {
        ...starter,
        id,
      };

      await api.createLayout(newLayout, name);
      setCreateOpen(false);
      router.push(`/playground/${newLayout.id}`);
    } catch {
      showToast("สร้างผังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setCreating(false);
    }
  };

  // สร้างผังจากตัวอย่าง
  const handleUseTemplate = async (name: string) => {
    setCreating(true);
    try {
      const id = `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const template: StoreLayout = {
        ...createSampleCafeLayout(randomId),
        id,
      };
      await api.createLayout(template, name);
      setCreateOpen(false);
      router.push(`/playground/${template.id}`);
    } catch {
      showToast("สร้างผังตัวอย่างไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setCreating(false);
    }
  };

  // ดำเนินการลบผัง
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteLayout(deleteTarget.id);
      setLayouts((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      showToast(`ลบผัง “${deleteTarget.name}” แล้ว`);
      setDeleteTarget(null);
    } catch {
      showToast("ลบผังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDeleting(false);
    }
  };

  const defaultNewName = `ผังร้าน ${layouts.length + 1}`;

  // หากกำลังตรวจสอบ session ให้แสดง skeleton เบื้องต้น
  if (sessionStatus === "loading") {
    return (
      <main className="mx-auto max-w-[1120px] px-3 py-6 sm:px-8 sm:py-10">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div className="h-8 w-40 bg-[#eef2f7] rounded-[8px] animate-pulse" />
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,264px),1fr))] gap-5 list-none p-0 m-0" aria-busy="true">
          {[1, 2, 3].map((n) => (
            <li key={n} className="rounded-[16px] border border-[#e2e8f1] bg-white overflow-hidden animate-pulse">
              <div className="aspect-[16/10] bg-[#eef2f7]" />
              <div className="p-3.5 space-y-2">
                <div className="h-4 bg-[#eef2f7] rounded w-3/4" />
                <div className="h-3 bg-[#eef2f7] rounded w-1/2" />
              </div>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1120px] px-3 py-6 sm:px-8 sm:py-10">
      {/* Title & Count Row */}
      <div className="title-row mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[24px] font-semibold text-[#1e2b40]">ผังของฉัน</h1>
          {!loading && !error && (
            <p id="count" className="m-0 mt-1 text-[13px] text-[#4e627c]">
              {layouts.length} ผัง
            </p>
          )}
        </div>

        {/* ปุ่มสร้างผังใหม่ด้านบน (ซ่อนเมื่อกำลังโหลดหรือ error หรือไม่มีผัง) */}
        {!loading && !error && layouts.length > 0 && (
          <button
            type="button"
            id="new-top"
            disabled={isLimitReached}
            aria-disabled={isLimitReached}
            onClick={handleOpenCreate}
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-4 text-[14px] font-medium transition-colors focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 max-[480px]:w-full ${
              isLimitReached
                ? "border border-[#e2e8f1] bg-[#f7f9fc] text-[#52637a] cursor-not-allowed opacity-60"
                : "border border-[#3b62f4] bg-[#3b62f4] text-white hover:bg-[#2e50da] cursor-pointer shadow-sm"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            สร้างผังใหม่
          </button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div id="alert" className="mb-5 flex items-start gap-3 rounded-[12px] bg-[#fdeeec] p-3.5 text-[#b23d33] leading-[1.6]" role="alert">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 text-[13px]">
            <b className="font-semibold">โหลดรายการผังไม่ได้</b>
            <br />
            {error}
          </div>
          <button
            type="button"
            onClick={fetchLayouts}
            className="inline-flex h-8 items-center justify-center rounded-[8px] border border-[#e2e8f1] bg-white px-3 text-[13px] font-medium text-[#1e2b40] hover:bg-[#f7f9fc] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff]"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {/* Quota Limit Alert */}
      {isLimitReached && (
        <div className="mb-5 flex items-start gap-3 rounded-[12px] bg-[#fdf6e7] p-3.5 text-[#8a6414] leading-[1.6]" role="status">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-[13px]">
            ผังเต็มโควตา {LAYOUT_LIMIT} ผังแล้ว ลบผังที่ไม่ใช้ก่อนจึงสร้างผังใหม่ได้
          </div>
        </div>
      )}

      {/* Content Area */}
      <div id="content" aria-live="polite">
        {/* Loading Skeleton */}
        {loading && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,264px),1fr))] gap-5 list-none p-0 m-0" aria-busy="true" aria-label="กำลังโหลดผัง">
            {[1, 2, 3].map((n) => (
              <li key={n} className="sk rounded-[16px] border border-[#e2e8f1] bg-white overflow-hidden">
                <div className="sk-t aspect-[16/10] bg-gradient-to-r from-[#eef2f7] via-[#f6f8fb] to-[#eef2f7] bg-[length:200%_100%] animate-[sh_1.2s_infinite]" />
                <div className="sk-i flex items-center gap-3 p-3.5">
                  <div className="size-8 rounded-[8px] bg-[#eef2f7] shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-3/4 rounded bg-[#eef2f7]" />
                    <div className="h-3 w-1/2 rounded bg-[#eef2f7]" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Empty State */}
        {!loading && !error && layouts.length === 0 && (
          <div className="empty rounded-[16px] border border-[#e2e8f1] bg-white p-5 sm:p-14 text-center">
            <div className="mx-auto mb-3.5 flex size-16 items-center justify-center rounded-[16px] bg-[#edf1ff] text-[#3b62f4]" aria-hidden="true">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <h2 className="m-0 mb-1.5 text-[18px] font-semibold text-[#1e2b40]">ยังไม่มีผังร้าน</h2>
            <p className="m-0 mb-5 text-[14px] text-[#4e627c] leading-[1.6]">
              เริ่มจากผังเปล่า หรือเลือกผังตัวอย่างคาเฟ่ 8×6 ม. ในหน้าออกแบบ
            </p>
            <button
              type="button"
              id="empty-create-btn"
              onClick={handleOpenCreate}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#3b62f4] bg-[#3b62f4] px-4 text-[14px] font-medium text-white hover:bg-[#2e50da] cursor-pointer shadow-sm focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              สร้างผังแรก
            </button>
          </div>
        )}

        {/* Layouts Grid */}
        {!loading && !error && layouts.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,264px),1fr))] gap-5 list-none p-0 m-0" aria-label="รายการผัง">
            {layouts.map((item) => (
              <ProjectCard
                key={item.id}
                layout={item}
                onOpen={(id) => router.push(`/playground/${id}`)}
                onDelete={(id, name) => setDeleteTarget({ id, name })}
              />
            ))}

            {/* การ์ด 'สร้างผังใหม่' แบบเส้นประท้ายรายการ */}
            <li>
              <button
                type="button"
                id="new-card"
                disabled={isLimitReached}
                aria-disabled={isLimitReached}
                onClick={handleOpenCreate}
                className={`flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-[16px] border-[1.5px] border-dashed p-4 transition-colors focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 ${
                  isLimitReached
                    ? "border-[#c8d2e2] text-[#52637a] cursor-not-allowed bg-transparent opacity-60"
                    : "border-[#c8d2e2] text-[#3b62f4] hover:border-[#3b62f4] hover:bg-[#edf1ff] cursor-pointer font-medium"
                }`}
              >
                <div
                  className={`flex size-12 items-center justify-center rounded-[12px] text-[24px] ${
                    isLimitReached ? "bg-[#f7f9fc]" : "bg-[#edf1ff]"
                  }`}
                  aria-hidden="true"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span>สร้างผังใหม่</span>
              </button>
            </li>
          </ul>
        )}
      </div>

      {/* Dialog สร้างผังใหม่ */}
      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultName={defaultNewName}
        onCreate={handleCreate}
        onUseTemplate={handleUseTemplate}
        loading={creating}
      />

      {/* Dialog ยืนยันลบผัง */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        layoutName={deleteTarget?.name ?? ""}
        onConfirm={handleConfirmDelete}
        loading={deleting}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="toast"
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-[12px] bg-[#1e2b40] px-4 py-2.5 text-[14px] text-white shadow-xl max-w-[calc(100vw-32px)] animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <svg className="w-4 h-4 text-[#34A853]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}
    </main>
  );
}
