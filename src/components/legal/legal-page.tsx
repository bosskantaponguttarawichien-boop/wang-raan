/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import Link from "next/link";

/** ผู้ให้บริการและช่องทางติดต่อ — ใช้ร่วมกันในหน้าข้อกำหนดและนโยบายความเป็นส่วนตัว */
export const LEGAL_OPERATOR = "วางร้าน";
export const LEGAL_CONTACT_EMAIL = "boss.kantapong.uttarawichien@gmail.com";
export const LEGAL_UPDATED = "17 ตุลาคม 2569";

const FOCUS = "focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2";
const LINK = `text-[#3b62f4] underline hover:text-[#1e2b40] rounded-[4px] ${FOCUS}`;

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f7f9fc] text-[#1e2b40] flex flex-col font-sans">
      <header className="w-full max-w-[1280px] mx-auto flex items-center justify-between gap-3 px-4 sm:px-8 md:px-10 py-3">
        <Link
          href="/"
          aria-label="วางร้าน — หน้าแรก"
          className={`flex items-center gap-2 font-semibold text-[18px] text-[#1e2b40] no-underline rounded-[8px] ${FOCUS}`}
        >
          <img
            src="/assets/logos/logo-wangraan-clear-channel.svg"
            alt=""
            aria-hidden="true"
            width={38}
            height={38}
            className="block size-[34px] sm:size-[38px]"
          />
          วางร้าน
        </Link>
        <nav aria-label="เอกสารทางกฎหมาย" className="flex items-center gap-1 text-[13px]">
          <Link href="/terms" className={`text-[#4e627c] hover:text-[#1e2b40] hover:bg-white rounded-[8px] px-2 min-h-[44px] flex items-center no-underline ${FOCUS}`}>
            ข้อกำหนด
          </Link>
          <Link href="/privacy" className={`text-[#4e627c] hover:text-[#1e2b40] hover:bg-white rounded-[8px] px-2 min-h-[44px] flex items-center no-underline ${FOCUS}`}>
            ความเป็นส่วนตัว
          </Link>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-[760px] mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <article className="bg-white border border-[#e2e8f1] rounded-[16px] px-5 sm:px-10 py-7 sm:py-10 text-[15px] leading-[1.85] text-[#33435a] [overflow-wrap:anywhere]">
          <h1 className="text-[26px] sm:text-[30px] font-semibold leading-[1.4] text-[#1e2b40] m-0 mb-1">{title}</h1>
          <p className="text-[13px] text-[#52637a] m-0 mb-6">ปรับปรุงล่าสุด {LEGAL_UPDATED}</p>
          {children}
        </article>
      </main>

      <footer className="w-full max-w-[1280px] mx-auto px-4 sm:px-8 md:px-10 py-4 text-[12px] leading-[1.6] text-[#52637a]">
        © {new Date().getFullYear()} วางร้าน · ออกแบบผังร้านอาหารและคาเฟ่
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-[18px] font-semibold text-[#1e2b40] m-0 mb-2">{title}</h2>
      <div className="grid gap-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:m-0 [&_ul]:grid [&_ul]:gap-1 [&_p]:m-0">{children}</div>
    </section>
  );
}

export function ContactEmail() {
  return (
    <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={LINK}>
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}

export function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={LINK}>
      {children}
    </Link>
  );
}
