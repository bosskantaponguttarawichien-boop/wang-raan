/**
 * HTTP server ของ proxy ฉีดความขัดข้อง (fault-proxy.ts) — ใช้รัน E2E กับ Backend จริง: `npm run e2e:real`
 * build เป็น mock-backend/dist/fault-proxy.mjs ด้วย `npm run mock:build`
 * env: REAL_BACKEND_URL (origin ของ Backend จริง), E2E_DATABASE_URL (ฐานข้อมูลเดียวกับ Backend), MOCK_BACKEND_PORT (ค่าเริ่มต้น 4010)
 */
import { createServer } from "node:http";
import pg from "pg";
import { createFaultProxy } from "./fault-proxy";

const port = Number(process.env.MOCK_BACKEND_PORT ?? 4010);
const target = process.env.REAL_BACKEND_URL;
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!target || !databaseUrl) {
  console.error("[fault-proxy] ต้องตั้ง REAL_BACKEND_URL และ E2E_DATABASE_URL (ฐานข้อมูลเดียวกับ Backend จริง)");
  process.exit(1);
}
const db = new pg.Pool({ connectionString: databaseUrl, max: 2 });

const proxy = createFaultProxy({
  target,
  async expireShare(shareKey) {
    const result = await db.query("UPDATE share_links SET expires_at = now() - interval '1 second' WHERE share_key = $1", [shareKey]);
    return result.rowCount === 1;
  },
});

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  try {
    const response = await proxy.fetch(
      new Request(`http://localhost:${port}${req.url ?? "/"}`, { method: req.method, headers, body: body && req.method !== "GET" ? body : undefined }),
    );
    // fetch คลายการบีบอัดให้แล้ว — ส่ง header เดิมต่อจะทำให้ปลายทางถอดซ้ำ
    const outHeaders = Object.fromEntries([...response.headers].filter(([name]) => name !== "content-encoding" && name !== "content-length"));
    res.writeHead(response.status, outHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("[fault-proxy]", error);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "BAD_GATEWAY", message: "real backend unreachable" } }));
  }
}).listen(port, () => console.log(`[fault-proxy] พร้อมที่ http://localhost:${port} → ${target}`));
