// Web Crypto มีใน Node ≥ 20, Cloudflare Workers, Web Worker และเบราว์เซอร์ —
// tsconfig ของ package ไม่มี lib "dom" จึงประกาศเฉพาะส่วนที่ src/core ใช้
// eslint-disable-next-line no-var -- ต้องเป็น var จึงจะเป็น property ของ globalThis (src/core เรียก globalThis.crypto)
declare var crypto: { randomUUID(): string };
