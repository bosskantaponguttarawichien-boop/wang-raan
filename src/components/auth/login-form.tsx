"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { safeRedirectPath } from "@/lib/safe-redirect";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface LoginFormProps {
  initialNextUrl?: string;
  hasGoogleProvider?: boolean;
}

export function LoginForm({ initialNextUrl, hasGoogleProvider = true }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const nextUrl = safeRedirectPath(nextParam ?? initialNextUrl, "/projects");

  const { data: session, status } = useSession();

  const [step, setStep] = React.useState<"email" | "otp" | "done">("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [countdown, setCountdown] = React.useState(60);
  const [canResend, setCanResend] = React.useState(false);

  const emailInputRef = React.useRef<HTMLInputElement>(null);
  const codeInputRef = React.useRef<HTMLInputElement>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  // ถ้าล็อกอินเป็นผู้ใช้จริงอยู่แล้ว (ไม่ใช่ guest) -> redirect ไป nextUrl
  React.useEffect(() => {
    if (status === "authenticated" && session?.user?.id && !session.user.id.startsWith("guest-")) {
      router.replace(nextUrl);
    }
  }, [status, session, nextUrl, router]);

  // จัดการ Timer นับถอยหลัง 60 วิ
  const startTimer = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCountdown(60);
    setCanResend(false);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // เมื่อสลับ step -> focus input
  React.useEffect(() => {
    if (step === "email") {
      emailInputRef.current?.focus();
    } else if (step === "otp") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  // ส่งรหัส OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setEmailError("อีเมลไม่ถูกต้อง ลองตรวจอีกครั้ง");
      emailInputRef.current?.focus();
      return;
    }
    setEmailError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      if (res.status === 429) {
        const body = await res.json().catch(() => null);
        const retryAfter = body?.error?.retryAfter ?? 60;
        setEmailError(`ขอรหัสถี่เกินไป กรุณารออีก ${retryAfter} วินาที`);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setEmailError("ส่งรหัสไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setLoading(false);
        return;
      }
      setStep("otp");
      setCode("");
      setCodeError(null);
      startTimer();
    } catch {
      setEmailError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่ภายหลัง");
    } finally {
      setLoading(false);
    }
  };

  // ยืนยันรหัส OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.replace(/\D/g, "").slice(0, 6);
    if (cleanCode.length !== 6) {
      setCodeError("กรุณากรอกรหัส 6 หลักให้ครบถ้วน");
      codeInputRef.current?.focus();
      return;
    }
    setCodeError(null);
    setLoading(true);

    try {
      const result = await signIn("email-otp", {
        email: email.trim().toLowerCase(),
        code: cleanCode,
        redirect: false,
      });

      if (result?.error) {
        const err = result.error;
        if (err.includes("OTP_ATTEMPTS_EXCEEDED")) {
          setCodeError("กรอกรหัสผิดเกินจำนวนที่กำหนด กรุณาขอรหัสใหม่");
        } else if (err.includes("OTP_EXPIRED")) {
          setCodeError("รหัสหมดอายุแล้ว กรุณาขอรหัสใหม่");
        } else {
          setCodeError("รหัสไม่ถูกต้อง กรุณาตรวจอีกครั้ง");
        }
        setLoading(false);
        return;
      }

      setStep("done");
      setTimeout(() => {
        window.location.href = nextUrl;
      }, 1200);
    } catch {
      setCodeError("เกิดข้อผิดพลาดในการตรวจสอบรหัส ลองใหม่อีกครั้ง");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend || loading) return;
    setLoading(true);
    setCodeError(null);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.ok) {
        startTimer();
      } else {
        setCodeError("ขอรหัสใหม่ไม่สำเร็จ กรุณารอสักครู่");
      }
    } catch {
      setCodeError("เชื่อมต่อระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = () => {
    setStep("email");
    setCode("");
    setCodeError(null);
  };

  return (
    <section className="card w-full max-w-[400px] bg-white border border-[#e2e8f1] rounded-[16px] p-6 sm:p-8 shadow-[0_10px_30px_rgba(30,43,64,0.06)]" aria-live="polite">
      {/* Step 1: กรอกอีเมล */}
      {step === "email" && (
        <div id="s-email">
          <h1 className="text-[22px] font-semibold text-[#1e2b40] m-0 mb-1">เข้าสู่ระบบ</h1>
          <p className="text-[#4e627c] text-[14px] m-0 mb-[22px] leading-[1.6]">
            บันทึกผังร้านไว้ในบัญชี เปิดต่อได้จากทุกเครื่อง
          </p>

          {hasGoogleProvider && (
            <>
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: nextUrl })}
                className="btn flex items-center justify-center gap-2 w-full h-[44px] rounded-[10px] border border-[#e2e8f1] bg-white hover:border-[#c8d2e2] cursor-pointer font-medium text-[14px] text-[#1e2b40] transition-colors focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2"
              >
                <svg className="w-[18px] height-[18px]" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
                  <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z" />
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6C6.6 42.6 14.6 48 24 48z" />
                </svg>
                เข้าสู่ระบบด้วย Google
              </button>

              <div className="flex items-center gap-3 text-[#52637a] text-[12px] my-[18px] before:content-[''] before:flex-1 before:border-t before:border-[#e2e8f1] after:content-[''] after:flex-1 after:border-t after:border-[#e2e8f1]">
                หรือใช้อีเมล
              </div>
            </>
          )}

          <form id="f-email" onSubmit={handleSendOtp} noValidate>
            <div className="flex flex-col gap-[6px] mb-[14px]">
              <label htmlFor="email" className="text-[13px] text-[#4e627c] font-medium">
                อีเมล
              </label>
              <input
                id="email"
                ref={emailInputRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="you@example.com"
                aria-invalid={emailError ? "true" : "false"}
                aria-describedby={emailError ? "email-err email-hint" : "email-hint"}
                disabled={loading}
                className={`h-[44px] border ${emailError ? "border-[#e4685d]" : "border-[#e2e8f1]"} rounded-[10px] px-3 bg-white w-full text-[14px] text-[#1e2b40] focus:border-[#3b62f4] focus:outline-none focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2`}
              />
            </div>

            {emailError && (
              <p className="flex items-start gap-[6px] text-[13px] text-[#b23d33] -mt-1 mb-3 leading-[1.5]" id="email-err" role="alert">
                <svg className="w-4 h-4 shrink-0 mt-[2px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4m0 4h.01" />
                </svg>
                {emailError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 w-full h-[44px] rounded-[10px] bg-[#3b62f4] hover:bg-[#2e50da] text-white font-medium text-[14px] cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  กำลังส่งรหัส...
                </>
              ) : (
                "ส่งรหัสเข้าสู่ระบบ"
              )}
            </button>

            <p className="text-[12px] text-[#52637a] leading-[1.6] mt-[10px] mb-0" id="email-hint">
              ยังไม่มีบัญชี? ใช้อีเมลนี้ได้เลย ระบบจะสร้างบัญชีให้อัตโนมัติ — ไม่ต้องตั้งรหัสผ่าน
            </p>
          </form>
        </div>
      )}

      {/* Step 2: กรอกรหัส OTP */}
      {step === "otp" && (
        <div id="s-otp">
          <h1 className="text-[22px] font-semibold text-[#1e2b40] m-0 mb-3">กรอกรหัส 6 หลัก</h1>
          <div className="flex gap-[10px] items-start bg-[#edf1ff] rounded-[12px] p-3 mb-[18px] leading-[1.6] text-[13px] text-[#1e2b40]">
            <svg className="w-5 h-5 text-[#3b62f4] shrink-0 mt-[2px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <div>
              ส่งรหัสไปที่ <b id="sent-to" className="break-all font-semibold">{email}</b> แล้ว
              <br />
              <small className="text-[#384b66]">รหัสใช้ได้ 10 นาที · ไม่เห็นเมล ลองดูในโฟลเดอร์สแปม</small>
            </div>
          </div>

          <form id="f-otp" onSubmit={handleVerifyOtp} noValidate>
            <div className="flex flex-col gap-[6px] mb-[14px]">
              <label htmlFor="code" className="text-[13px] text-[#4e627c] font-medium">
                รหัสเข้าสู่ระบบ
              </label>
              <input
                id="code"
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]*"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(val);
                  if (codeError) setCodeError(null);
                }}
                placeholder="••••••"
                aria-invalid={codeError ? "true" : "false"}
                aria-describedby={codeError ? "code-err" : undefined}
                disabled={loading}
                className={`h-[44px] border ${codeError ? "border-[#e4685d]" : "border-[#e2e8f1]"} rounded-[10px] px-3 bg-white w-full font-semibold text-[22px] tracking-[0.6em] text-center pl-[0.6em] text-[#1e2b40] focus:border-[#3b62f4] focus:outline-none focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2`}
              />
            </div>

            {codeError && (
              <p className="flex items-start gap-[6px] text-[13px] text-[#b23d33] -mt-1 mb-3 leading-[1.5]" id="code-err" role="alert">
                <svg className="w-4 h-4 shrink-0 mt-[2px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4m0 4h.01" />
                </svg>
                {codeError}
              </p>
            )}

            <button
              type="submit"
              id="verify"
              disabled={loading || code.length !== 6}
              className="flex items-center justify-center gap-2 w-full h-[44px] rounded-[10px] bg-[#3b62f4] hover:bg-[#2e50da] text-white font-medium text-[14px] cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2"
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  กำลังตรวจรหัส...
                </>
              ) : (
                "ยืนยันรหัส"
              )}
            </button>
          </form>

          <div className="flex items-center justify-between gap-2 flex-wrap mt-3 text-[13px] text-[#66758a]">
            <button
              type="button"
              id="change"
              onClick={handleChangeEmail}
              disabled={loading}
              className="border-0 bg-transparent text-[#3b62f4] hover:underline p-1 inline-flex items-center gap-1 font-medium cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              เปลี่ยนอีเมล
            </button>

            <button
              type="button"
              id="resend"
              onClick={handleResend}
              disabled={!canResend || loading}
              aria-disabled={!canResend}
              className={`border-0 bg-transparent p-1 inline-flex items-center font-medium ${canResend ? "text-[#3b62f4] hover:underline cursor-pointer" : "text-[#52637a] cursor-not-allowed"} focus-visible:outline-3 focus-visible:outline-[#a4b6ff]`}
            >
              {canResend ? "ส่งรหัสใหม่" : `ขอรหัสใหม่ได้ใน ${countdown} วิ`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: สำเร็จ */}
      {step === "done" && (
        <div id="s-done" className="text-center py-3">
          <svg className="w-10 h-10 text-[#1f6e55] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-[22px] font-semibold text-[#1e2b40] mt-2 mb-1">เข้าสู่ระบบแล้ว</h1>
          <p className="text-[#4e627c] text-[14px] m-0 leading-[1.6]">
            ย้ายผังที่ทำไว้เข้าบัญชีเรียบร้อย กำลังพาไปที่ผังของฉัน…
          </p>
        </div>
      )}

      <p className="text-center text-[12px] text-[#52637a] mt-[18px] mb-0 leading-[1.6]">
        การเข้าสู่ระบบถือว่ายอมรับ{" "}
        <Link href="#terms" className="text-[#4e627c] underline hover:text-[#1e2b40]">
          ข้อกำหนดการใช้งาน
        </Link>{" "}
        และ{" "}
        <Link href="#privacy" className="text-[#4e627c] underline hover:text-[#1e2b40]">
          นโยบายความเป็นส่วนตัว
        </Link>
      </p>
    </section>
  );
}
