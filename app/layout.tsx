import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { BrowserSupportNotice } from "@/components/ui/browser-support-notice";
import { PwaRegister } from "@/components/providers/pwa-register";
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
  applicationName: "วางร้าน",
  icons: {
    icon: [
      { url: "/assets/logos/logo-wangraan-clear-channel.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  // iPhone/iPad: เปิดจากไอคอนหน้าโฮมแบบเต็มจอเหมือนแอป
  appleWebApp: { capable: true, title: "วางร้าน", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // ใช้พื้นที่เต็มจอรวมขอบโค้ง/แถบโฮมของ iPhone — แถบล่างของ Playground เว้นระยะด้วย safe-area-inset
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body>
        <BrowserSupportNotice />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
