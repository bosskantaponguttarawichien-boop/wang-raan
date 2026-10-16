"use client";

/**
 * ซูมด้วยสองนิ้ว (pinch) บนพื้นที่ Canvas — ใช้กับทั้งผัง 2D และมุมมอง 3D
 * ระยะห่างสองนิ้วเทียบกับตอนเริ่ม × zoom ตอนเริ่ม → setZoom (store clamp ZOOM_MIN..ZOOM_MAX เอง)
 */
import * as React from "react";
import { layoutActions as actions, layoutStore } from "@/store/use-layout-store";

type TouchPoint = { clientX: number; clientY: number };

export function pinchDistance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

const twoFingerDistance = (touches: TouchList) => {
  const [a, b] = [touches[0], touches[1]];
  return a && b ? pinchDistance(a, b) : 0;
};

/** zoom ใหม่จากระยะสองนิ้ว — ปัดเป็น 2 ตำแหน่งเพื่อไม่ให้ store เปลี่ยนถี่เกินจำเป็น */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  if (startDistance <= 0) return startZoom;
  return Math.round(startZoom * (distance / startDistance) * 100) / 100;
}

export function usePinchZoom(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { distance: number; zoom: number } | null = null;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      start = { distance: twoFingerDistance(event.touches), zoom: layoutStore.getState().zoom };
    };
    const onMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 2) return;
      event.preventDefault();
      const next = pinchZoom(start.zoom, start.distance, twoFingerDistance(event.touches));
      if (next !== layoutStore.getState().zoom) actions().setZoom(next);
    };
    const onEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) start = null;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref]);
}
