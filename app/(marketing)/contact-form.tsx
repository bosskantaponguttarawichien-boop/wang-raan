"use client";

/**
 * ฟอร์มติดต่อบน Landing (feat-032) — React Hook Form + Zod (schema เดียวกับ BFF) ส่งไป POST /api/contact
 * คง markup / class ของ prototype (.contact-form) เพื่อให้หน้าตาเหมือนเดิม
 */
import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm } from "react-hook-form";
import { ContactSchema, type ContactInput } from "@/lib/contact-schema";

type Result = { tone: "ok" | "error"; text: string } | null;

export function ContactForm() {
  const [result, setResult] = React.useState<Result>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({ resolver: zodResolver(ContactSchema), defaultValues: { name: "", email: "", message: "", website: "" } });

  const onSubmit = async (values: ContactInput) => {
    setResult(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (res.ok) {
        reset();
        setResult({ tone: "ok", text: "ส่งข้อความแล้ว ขอบคุณที่ติดต่อเรา เราจะตอบกลับทางอีเมล" });
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setResult({ tone: "error", text: body?.error?.message ?? "ส่งข้อความไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } catch {
      setResult({ tone: "error", text: "เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" });
    }
  };

  const fieldProps = (name: "name" | "email" | "message") => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `contact-${name}-error` : undefined,
  });

  return (
    <form className="contact-form" aria-label="แบบฟอร์มติดต่อ" noValidate onSubmit={handleSubmit(onSubmit)} data-testid="contact-form">
      <fieldset disabled={isSubmitting}>
        <label htmlFor="contactName">
          ชื่อ
          <input id="contactName" type="text" placeholder="ชื่อของคุณ" autoComplete="name" {...fieldProps("name")} {...register("name")} />
          {errors.name && (
            <span id="contact-name-error" className="field-error">
              {errors.name.message}
            </span>
          )}
        </label>
        <label htmlFor="contactReply">
          อีเมล
          <input id="contactReply" type="email" placeholder="name@example.com" autoComplete="email" {...fieldProps("email")} {...register("email")} />
          {errors.email && (
            <span id="contact-email-error" className="field-error">
              {errors.email.message}
            </span>
          )}
        </label>
        <label htmlFor="contactMessage">
          ข้อความ
          <textarea id="contactMessage" rows={3} placeholder="อยากให้เราช่วยเรื่องอะไร" {...fieldProps("message")} {...register("message")} />
          {errors.message && (
            <span id="contact-message-error" className="field-error">
              {errors.message.message}
            </span>
          )}
        </label>
        {/* Honeypot สำหรับ bot — ซ่อนจากผู้ใช้และ Screen Reader */}
        <div className="hp" aria-hidden="true">
          <label htmlFor="contactWebsite">
            เว็บไซต์
            <input id="contactWebsite" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
          </label>
        </div>
        <button className="cta" type="submit">
          {isSubmitting ? "กำลังส่ง…" : "ส่งข้อความ"}
        </button>
      </fieldset>
      <p aria-live="polite" className={result ? `form-note ${result.tone === "ok" ? "is-ok" : "is-error"}` : "form-note"} data-testid="contact-result">
        {result?.text}
      </p>
    </form>
  );
}
