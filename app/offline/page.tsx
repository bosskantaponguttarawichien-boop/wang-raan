import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "ออฟไลน์" };

/** Service Worker แสดงหน้านี้เมื่อไม่มีเน็ตและยังไม่เคยเปิดหน้าที่ขอไว้ */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-center justify-center gap-3 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" aria-hidden="true" width={72} height={72} className="size-[72px]" />
      <h1 className="m-0 text-2xl font-semibold text-ink">ยังไม่ได้เชื่อมต่ออินเทอร์เน็ต</h1>
      <p className="m-0 text-[14px] leading-[1.6] text-secondary-strong">
        หน้านี้ต้องใช้เน็ต แต่หน้าจัดผังเปิดออฟไลน์ได้ (ผังที่แก้ไว้เก็บเป็นร่างในเครื่องนี้)
      </p>
      <Link href="/playground" className="mt-2 rounded-[10px] bg-blue px-4 py-2.5 text-[14px] font-semibold text-white no-underline">
        ไปหน้าจัดผัง
      </Link>
    </main>
  );
}
