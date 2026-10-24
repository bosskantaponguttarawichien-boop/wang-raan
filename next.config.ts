import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Service Worker ต้องไม่ถูกแคช — ไม่งั้นผู้ใช้ค้างอยู่กับเวอร์ชันเก่า (Cloudflare ใช้ public/_headers ชุดเดียวกัน)
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
