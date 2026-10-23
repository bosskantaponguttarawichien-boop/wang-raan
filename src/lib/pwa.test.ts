import { afterEach, describe, expect, it, vi } from "vitest";
import { installStore, isIosSafari, promptInstall, type BeforeInstallPromptEvent } from "./pwa";
import manifest from "../../app/manifest";

afterEach(() => installStore.setState({ installed: false, promptEvent: null, iosManual: false }));

describe("PWA", () => {
  it("manifest ติดตั้งได้: standalone, เปิดหน้าจัดผัง, มีไอคอน 192/512 และ maskable", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toMatch(/^\/playground/);
    const sizes = m.icons?.map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  });

  it("แยก iOS Safari (ติดตั้งผ่านปุ่มแชร์) ออกจากเบราว์เซอร์อื่นบน iOS", () => {
    expect(isIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1")).toBe(true);
    expect(isIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile Safari/604.1")).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15", 5)).toBe(true);
    expect(isIosSafari("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15", 0)).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (Linux; Android 15) Chrome/130.0 Mobile Safari/537.36")).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/14.16.0")).toBe(false);
    expect(isIosSafari("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]")).toBe(false);
  });

  it("promptInstall เรียกหน้าติดตั้งครั้งเดียวแล้วล้าง event", async () => {
    const prompt = vi.fn(async () => {});
    const event = { prompt, userChoice: Promise.resolve({ outcome: "accepted" as const }) } as unknown as BeforeInstallPromptEvent;
    installStore.setState({ promptEvent: event });
    await expect(promptInstall()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(installStore.getState().promptEvent).toBeNull();
    await expect(promptInstall()).resolves.toBe(false);
  });
});
