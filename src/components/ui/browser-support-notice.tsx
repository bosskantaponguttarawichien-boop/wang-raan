"use client";

/**
 * แจ้งเตือนเมื่อเปิดด้วยเบราว์เซอร์ที่เก่ากว่าเกณฑ์ขั้นต่ำ (Chrome/Edge 111, Safari 16.4, Firefox 128 — baseline ของ Tailwind v4)
 * เบราว์เซอร์เก่าทิ้ง CSS หลายส่วน (range media query, cqw/cqh, dvh, translate) จนผังหดหรือเลย์เอาต์มือถือเพี้ยน
 * ใช้ inline style ทั้งหมด เพราะคลาส Tailwind อาจใช้ไม่ได้บนเบราว์เซอร์เหล่านี้
 */
import * as React from "react";

const REQUIRED_FEATURES: Array<[property: string, value: string]> = [
  ["color", "color-mix(in srgb, red, blue)"], // Chrome 111, Safari 16.2, Firefox 113
  ["width", "1cqw"], // Chrome 105, Safari 16
  ["height", "1dvh"], // Chrome 108, Safari 15.4
];

export function isBrowserSupported(css: Pick<typeof CSS, "supports"> | undefined = globalThis.CSS): boolean {
  if (!css || typeof css.supports !== "function") return false;
  return REQUIRED_FEATURES.every(([property, value]) => css.supports(property, value));
}

const subscribeNever = () => () => {};

export function BrowserSupportNotice() {
  // ฝั่ง server ถือว่ารองรับ (ไม่แสดง) — ตรวจจริงหลัง hydrate
  const unsupported = React.useSyncExternalStore(subscribeNever, () => !isBrowserSupported(), () => false);
  const [dismissed, setDismissed] = React.useState(false);

  if (!unsupported || dismissed) return null;

  return (
    <div
      role="alert"
      data-testid="browser-support-notice"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "10px 16px",
        background: "#fff4d6",
        borderBottom: "1px solid #f0c860",
        color: "#1e2b40",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <p style={{ margin: 0, flex: 1 }}>
        เบราว์เซอร์นี้เก่าเกินไป หน้าจออาจแสดงผิดเพี้ยน — กรุณาอัปเดต Chrome, Safari, Edge หรือ Firefox เป็นเวอร์ชันล่าสุด
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="ปิดคำแจ้งเตือน"
        style={{
          flexShrink: 0,
          border: 0,
          background: "transparent",
          color: "#1e2b40",
          fontSize: 18,
          lineHeight: 1,
          padding: 4,
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
