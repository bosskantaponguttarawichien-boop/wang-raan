import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  display: "swap",
  variable: "--font-noto-sans-thai",
});

export const metadata: Metadata = {
  title: {
    default: "วางร้าน — จัดร้านก่อน แล้วค่อยจำลองลูกค้า",
    template: "%s · วางร้าน",
  },
  description:
    "ออกแบบผังร้านอาหารและคาเฟ่ ตรวจความพร้อมของผัง แล้วจำลองการเดินของลูกค้า",
  icons: { icon: "/assets/logos/logo-wangraan-clear-channel.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body>{children}</body>
    </html>
  );
}
