// OpenNext สำหรับ Cloudflare Workers (feat-035)
// ยังไม่เปิด incremental cache (R2): ทุกหน้าที่มีข้อมูลเป็น force-dynamic อยู่แล้ว — ตัดสินใจอีกครั้งใน feat-044
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
