import type { MetadataRoute } from "next";

/** Web App Manifest — ติดตั้งเป็นแอปบนมือถือ/เดสก์ท็อป เปิดตรงเข้าหน้าจัดผัง */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/playground",
    name: "วางร้าน — จัดผังร้านและจำลองลูกค้า",
    short_name: "วางร้าน",
    description: "ออกแบบผังร้านอาหารและคาเฟ่ ตรวจความพร้อมของผัง แล้วจำลองการเดินของลูกค้า",
    lang: "th",
    start_url: "/playground?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["business", "productivity", "design"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "จัดผังร้าน", url: "/playground", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "ผังของฉัน", url: "/projects", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
