"use client";

import * as React from "react";

export interface ContainerUnits {
  /** เทียบเท่า `100cqw` */
  width: string;
  /** เทียบเท่า `100cqh` */
  height: string;
}

const NATIVE: ContainerUnits = { width: "100cqw", height: "100cqh" };

function supportsContainerUnits(): boolean {
  return typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("width", "1cqw");
}

/** ขนาด content-box (ไม่รวม padding) เหมือนที่ cqw/cqh อ้างอิง */
function contentBox(el: HTMLElement): { width: number; height: number } {
  const cs = getComputedStyle(el);
  const px = (v: string) => Number.parseFloat(v) || 0;
  return {
    width: Math.max(0, el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight)),
    height: Math.max(0, el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom)),
  };
}

/**
 * `100cqw` / `100cqh` ของ container (`[container-type:size]`) ที่ครอบ `ref` อยู่
 * เบราว์เซอร์ที่รองรับ (Chromium 105+, Safari 16+) ใช้หน่วย cq ตรง ๆ
 * เบราว์เซอร์เก่าทิ้งทั้งค่า width ที่มี cq → ผังหดเหลือ 0 จึงวัดขนาด container เองแล้วส่งเป็น px แทน
 */
export function useContainerUnits(ref: React.RefObject<HTMLElement | null>): ContainerUnits {
  const [units, setUnits] = React.useState<ContainerUnits>(NATIVE);

  React.useEffect(() => {
    if (supportsContainerUnits()) return;
    const container = ref.current?.parentElement?.closest<HTMLElement>("[data-size-container]");
    if (!container) return;
    const update = () => {
      const box = contentBox(container);
      setUnits({ width: `${box.width}px`, height: `${box.height}px` });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [ref]);

  return units;
}
