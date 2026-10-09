"use client";

import { useEffect } from "react";

/**
 * Motion layer ของหน้า Landing (port จาก <script> ใน design-html/index.html)
 * - reveal เมื่อเลื่อนถึง (IntersectionObserver) และ intro ค่อย ๆ ปรากฏ
 * - แสงตามเมาส์บนผังตัวอย่าง (เฉพาะเมาส์ละเอียด)
 * - ปิดทั้งหมดเมื่อ prefers-reduced-motion (และเปิด/ปิดตามการเปลี่ยนค่าแบบสด)
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".landing");
    if (!root) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const targets = [
      ...root.querySelectorAll<HTMLElement>(".visual, .section-heading, .feature-card, .how-step, .faq-list details, .contact-copy, .contact-form"),
    ];
    let observer: IntersectionObserver | null = null;
    let pointerFrame = 0;
    let lastPointer: { x: number; y: number } | null = null;

    function applyMotion() {
      observer?.disconnect();
      root!.classList.remove("motion-ready");
      targets.forEach((el) => el.classList.remove("reveal", "is-visible"));
      if (preference.matches) return;
      root!.classList.add("motion-ready");
      if (!("IntersectionObserver" in window)) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.08 },
      );
      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        if (rect.top >= window.innerHeight || rect.bottom <= 0) {
          el.classList.add("reveal");
          observer.observe(el);
        }
      }
    }
    applyMotion();
    preference.addEventListener("change", applyMotion);

    const preview = root.querySelector<HTMLElement>(".editor");
    const onPointerMove = (event: PointerEvent) => {
      if (preference.matches || event.pointerType !== "mouse" || !preview) return;
      lastPointer = { x: event.clientX, y: event.clientY };
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if (!lastPointer) return;
        const rect = preview.getBoundingClientRect();
        preview.style.setProperty("--pointer-x", `${lastPointer.x - rect.left}px`);
        preview.style.setProperty("--pointer-y", `${lastPointer.y - rect.top}px`);
      });
    };
    const onPointerLeave = () => {
      lastPointer = null;
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      preview?.style.removeProperty("--pointer-x");
      preview?.style.removeProperty("--pointer-y");
    };
    preview?.addEventListener("pointermove", onPointerMove);
    preview?.addEventListener("pointerleave", onPointerLeave);

    // กดลิงก์ภายในหน้า: แสดงปลายทางทันทีโดยไม่ต้องรอ observer
    const onAnchorClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      const section = link && document.getElementById(link.getAttribute("href")!.slice(1));
      if (!section) return;
      targets
        .filter((el) => section === el || section.contains(el))
        .forEach((el) => {
          el.classList.add("is-visible");
          observer?.unobserve(el);
        });
    };
    root.addEventListener("click", onAnchorClick);

    return () => {
      observer?.disconnect();
      preference.removeEventListener("change", applyMotion);
      preview?.removeEventListener("pointermove", onPointerMove);
      preview?.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("click", onAnchorClick);
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
    };
  }, []);

  return null;
}
