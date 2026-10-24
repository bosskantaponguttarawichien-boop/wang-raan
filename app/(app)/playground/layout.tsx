import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";

export const metadata: Metadata = { title: "Playground — จัดผังร้าน" };

export default function PlaygroundLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // fixed inset-0: ล็อกเต็มจอ ไม่ให้ทั้งหน้าเลื่อนขึ้น/ลงได้ (iPhone PWA ถ้าใช้ h-dvh หน้าสูงเกินจอเท่าแถบสถานะ เลยลากเลื่อนได้)
    <div data-surface="playground" className="fixed inset-0 overflow-hidden overscroll-none bg-surface print:static print:h-auto print:overflow-visible print:bg-white">
      <AppProviders>{children}</AppProviders>
    </div>
  );
}
