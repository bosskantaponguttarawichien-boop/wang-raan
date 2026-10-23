/**
 * PWA ฝั่งหน้าเว็บ: ลงทะเบียน Service Worker และเก็บสถานะ "ติดตั้งแอปได้ไหม"
 * แยกจาก React เพื่อทดสอบได้ — หน้าเว็บอ่านสถานะผ่าน useInstallState
 */
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/** เหตุการณ์ beforeinstallprompt (Chrome/Edge/Android) — ยังไม่มีใน lib.dom ของ TypeScript */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallState {
  /** เปิดเป็นแอปที่ติดตั้งแล้ว (standalone) */
  installed: boolean;
  /** เบราว์เซอร์ให้ปุ่มติดตั้งของเราเรียกหน้าติดตั้งได้ */
  promptEvent: BeforeInstallPromptEvent | null;
  /** iPhone/iPad Safari — ไม่มี beforeinstallprompt ต้องติดตั้งผ่านปุ่มแชร์ */
  iosManual: boolean;
}

export const installStore = createStore<InstallState>()(() => ({ installed: false, promptEvent: null, iosManual: false }));

export function useInstallState<T>(selector: (s: InstallState) => T): T {
  return useStore(installStore, selector);
}

export function isStandalone(win: Window = window): boolean {
  return win.matchMedia?.("(display-mode: standalone)").matches || (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  // iPadOS 13+ รายงานตัวเองเป็น Macintosh แต่มีจอสัมผัส
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  // Chrome/Firefox/Edge บน iOS ใส่ CriOS/FxiOS/EdgiOS — ติดตั้งผ่านปุ่มแชร์ได้เฉพาะ Safari (iOS < 16.4)
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** เปิดหน้าติดตั้ง — คืน true เมื่อผู้ใช้กดติดตั้ง */
export async function promptInstall(): Promise<boolean> {
  const event = installStore.getState().promptEvent;
  if (!event) return false;
  installStore.setState({ promptEvent: null });
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

let started = false;

/** เริ่มครั้งเดียวตอนเปิดหน้า: ฟังเหตุการณ์ติดตั้ง + ลงทะเบียน SW (เฉพาะ production เพื่อไม่ให้แคชค้างตอนพัฒนา) */
export function startPwa(win: Window = window, register = process.env.NODE_ENV === "production") {
  if (started) return;
  started = true;

  installStore.setState({
    installed: isStandalone(win),
    iosManual: !isStandalone(win) && isIosSafari(win.navigator.userAgent, win.navigator.maxTouchPoints),
  });
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installStore.setState({ promptEvent: event as BeforeInstallPromptEvent });
  });
  win.addEventListener("appinstalled", () => installStore.setState({ installed: true, promptEvent: null, iosManual: false }));

  if (!register || !("serviceWorker" in win.navigator)) return;
  const onLoad = () => {
    win.navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => win.navigator.serviceWorker.ready)
      .then((registration) => {
        // ไฟล์ที่หน้านี้โหลดไปก่อน SW เริ่มคุม — ส่งให้ SW เก็บแคช เพื่อเปิดออฟไลน์ครั้งถัดไปได้ทันที
        const urls = win.performance.getEntriesByType("resource").map((entry) => entry.name);
        registration.active?.postMessage({ type: "CACHE_URLS", urls });
      })
      .catch(() => {});
  };
  if (win.document.readyState === "complete") onLoad();
  else win.addEventListener("load", onLoad, { once: true });
}
