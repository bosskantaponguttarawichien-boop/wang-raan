/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppProviders } from "@/components/providers/app-providers";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ — วางร้าน",
  description: "เข้าสู่ระบบวางร้านด้วย Google หรืออีเมล OTP บันทึกผังร้านไว้ในบัญชี เปิดต่อได้จากทุกเครื่อง",
};

export default function LoginPage() {
  return (
    <AppProviders>
      <div className="min-h-screen bg-[#f7f9fc] text-[#1e2b40] flex flex-col font-sans">
      <header className="flex items-center justify-between px-4 sm:px-8 md:px-10 py-[14px]">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[18px] text-[#1e2b40] no-underline focus-visible:outline-3 focus-visible:outline-[#a4b6ff] rounded-[8px]">
          <img src="/assets/logos/logo-wangraan-minimal-flat.svg" alt="" className="w-[30px] h-[30px]" aria-hidden="true" />
          วางร้าน
        </Link>
        <Link
          href="/playground"
          className="text-[#4e627c] hover:text-[#1e2b40] hover:bg-white text-[13px] flex items-center gap-1 rounded-[8px] px-2 py-[6px] transition-colors no-underline focus-visible:outline-3 focus-visible:outline-[#a4b6ff]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          กลับไปออกแบบต่อ
        </Link>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pt-6 sm:pt-12 md:pt-16 pb-10">
        <React.Suspense
          fallback={
            <div className="w-full max-w-[400px] h-[320px] bg-white border border-[#e2e8f1] rounded-[16px] animate-pulse" />
          }
        >
          <LoginForm />
        </React.Suspense>
      </main>
    </div>
    </AppProviders>
  );
}
