import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Playground — จัดผังร้าน" };

export default function PlaygroundLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div data-surface="playground" className="min-h-dvh bg-blue-tint-3">
      <header className="flex h-[60px] items-center justify-between gap-6 border-b border-[#e5eaf2] bg-white px-[22px] max-[700px]:sticky max-[700px]:top-0 max-[700px]:z-30 max-[700px]:px-4">
        <Link
          href="/"
          aria-label="วางร้าน กลับหน้าแรก"
          className="flex items-center gap-2.5 text-[23px] font-semibold text-ink no-underline focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus max-[700px]:text-[19px]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG โลโก้ขนาดเล็ก ไม่ต้อง optimize */}
          <img src="/assets/logos/logo-wangraan-clear-channel.svg" alt="" aria-hidden="true" width={38} height={38} className="block size-[38px]" />
          วางร้าน
        </Link>
        <span className="flex items-center gap-2 text-[12px] text-secondary max-[700px]:hidden">
          <span aria-hidden="true" className="size-[7px] rounded-full bg-blue" />
          โหมดออกแบบ · จัดร้านก่อน แล้วค่อยจำลองลูกค้า
        </span>
      </header>
      <main>{children}</main>
    </div>
  );
}
