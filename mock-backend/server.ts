/**
 * HTTP server ของ Backend จำลอง (feat-038) — ใช้กับ E2E และ dev ที่อยากเห็นคำขอวิ่งผ่านเครือข่ายจริง
 * รัน: `npm run mock:start` (build เป็น mock-backend/dist/server.mjs ก่อนด้วย `npm run mock:build`)
 * env: MOCK_BACKEND_PORT (ค่าเริ่มต้น 4010), INTERNAL_TOKEN_SECRET (ต้องตรงกับ BFF)
 */
import { createServer } from "node:http";
import { createMockBackend } from "./handler";

const port = Number(process.env.MOCK_BACKEND_PORT ?? 4010);
const secret = process.env.INTERNAL_TOKEN_SECRET;
if (!secret) {
  console.error("[mock-backend] ต้องตั้ง INTERNAL_TOKEN_SECRET ให้ตรงกับ BFF");
  process.exit(1);
}
const backend = createMockBackend({ secret });

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  const response = await backend.fetch(
    new Request(`http://localhost:${port}${req.url ?? "/"}`, { method: req.method, headers, body: body && req.method !== "GET" ? body : undefined }),
  );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`[mock-backend] พร้อมที่ http://localhost:${port} (ข้อมูลอยู่ในหน่วยความจำ)`));
