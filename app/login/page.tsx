/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppProviders } from "@/components/providers/app-providers";
import { LoginForm } from "@/components/auth/login-form";
import { googleLoginEnabled } from "@/server/auth-config";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ — วางร้าน",
  description: "เข้าสู่ระบบวางร้านด้วย Google หรืออีเมล OTP บันทึกผังร้านไว้ในบัญชี เปิดต่อได้จากทุกเครื่อง",
};

// ปุ่ม Google ขึ้นกับ env ตอนรัน ไม่ใช่ตอน build
export const dynamic = "force-dynamic";

const BENEFITS = [
  "บันทึกผังร้านไว้ในบัญชี เปิดต่อได้จากทุกเครื่อง",
  "ผังที่ทำไว้ก่อนเข้าสู่ระบบย้ายเข้าบัญชีให้อัตโนมัติ",
  "ไม่ต้องตั้งรหัสผ่าน — ใช้ Google หรือรหัสทางอีเมล",
];

const FOCUS = "focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2";

export default function LoginPage() {
  return (
    <AppProviders>
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
          <Link
            href="/playground"
            className={`text-[#4e627c] hover:text-[#1e2b40] hover:bg-white text-[13px] flex items-center gap-1 rounded-[8px] px-2 min-h-[44px] transition-colors no-underline ${FOCUS}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            กลับไปออกแบบต่อ
          </Link>
        </header>

        <main className="flex-1 w-full max-w-[1100px] mx-auto px-4 sm:px-8 md:px-10 py-6 sm:py-10 lg:py-12 grid gap-8 lg:gap-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div className="flex justify-center lg:order-2">
            <React.Suspense
              fallback={
                <div className="w-full max-w-[420px] h-[420px] bg-white border border-[#e2e8f1] rounded-[16px] motion-safe:animate-pulse" />
              }
            >
              <LoginForm hasGoogleProvider={googleLoginEnabled()} />
            </React.Suspense>
          </div>

          <aside
            aria-labelledby="login-aside-title"
            className="w-full max-w-[420px] lg:max-w-none mx-auto lg:order-1 min-w-0"
          >
            <p className="flex items-center gap-2 text-[13px] font-medium text-[#3b62f4] m-0 mb-2 before:content-[''] before:w-[18px] before:h-[2px] before:rounded-full before:bg-[#3b62f4]/55">
              จัดร้านก่อน แล้วค่อยจำลองลูกค้า
            </p>
            <h2
              id="login-aside-title"
              className="text-[22px] sm:text-[26px] lg:text-[30px] font-semibold leading-[1.45] tracking-[-0.5px] m-0 mb-4 text-balance [overflow-wrap:anywhere]"
            >
              ผังร้านของคุณ <span className="text-[#3b62f4]">อยู่ครบทุกเครื่อง</span>
            </h2>
            <ul className="list-none p-0 m-0 mb-6 grid gap-2">
              {BENEFITS.map((text) => (
                <li key={text} className="flex items-start gap-[10px] text-[14px] sm:text-[15px] leading-[1.85] text-[#4e627c]">
                  <svg className="w-5 h-5 shrink-0 mt-[4px] text-[#2e9b78]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="min-w-0">{text}</span>
                </li>
              ))}
            </ul>
            <div className="hidden min-[480px]:block rounded-[16px] bg-white border border-[#e2e8f1] overflow-hidden shadow-[0_17px_40px_-32px_rgba(29,57,97,0.27)]">
              <img
                src="/assets/store-planning-illustration.jpg"
                alt="ภาพประกอบ: เจ้าของร้านจัดผังคาเฟ่ ลูกค้าเดินตามทางเดินเข้าร้าน"
                width={1774}
                height={887}
                className="block w-full h-auto"
              />
            </div>
          </aside>
        </main>

        <footer className="w-full max-w-[1280px] mx-auto px-4 sm:px-8 md:px-10 py-4 text-[12px] leading-[1.6] text-[#52637a]">
          © {new Date().getFullYear()} วางร้าน · ออกแบบผังร้านอาหารและคาเฟ่
        </footer>
      </div>
    </AppProviders>
  );
}
