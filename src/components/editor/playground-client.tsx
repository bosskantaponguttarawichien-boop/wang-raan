"use client";

import dynamic from "next/dynamic";

/**
 * Editor ทำงานฝั่ง Client เท่านั้น: store เป็น singleton และ id สุ่มด้วย crypto
 * จึงไม่ render บน server เพื่อเลี่ยง hydration mismatch
 */
export const PlaygroundClient = dynamic(
  () =>
    import("./playground-editor").then((m) => {
      // กู้คืนร่างก่อน Editor render ครั้งแรก → ไม่เห็นผังเปล่าแวบขึ้นมา
      m.restoreDraftOnce();
      return m.PlaygroundEditor;
    }),
  {
  ssr: false,
  loading: () => (
    <div className="grid h-[calc(100dvh-60px)] place-items-center bg-blue-tint-3" role="status" aria-live="polite">
      <p className="m-0 text-[14px] text-secondary-strong">กำลังเปิดพื้นที่จัดผัง…</p>
    </div>
  ),
  },
);
