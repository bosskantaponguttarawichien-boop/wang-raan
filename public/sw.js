/* Service Worker ของวางร้าน — ทำให้เปิดแอปได้แม้ออฟไลน์ (ผังเก็บร่างในเบราว์เซอร์อยู่แล้ว)
 *
 * - ไฟล์ build (/_next/static), รูป/โมเดล (/assets), ไอคอน: เก็บแคชครั้งแรกที่โหลด แล้วใช้จากแคช (ชื่อไฟล์มี hash)
 * - หน้าเว็บ: ขอจากเน็ตก่อน ถ้าออฟไลน์ใช้ฉบับที่เคยเปิด → ไม่มีก็แสดงหน้า /offline
 * - /api และคำขอ RSC ไม่แคช (ข้อมูลบัญชีต้องสดเสมอ)
 * เปลี่ยน VERSION เมื่อแก้ไฟล์นี้ เพื่อล้างแคชเก่า
 */
const VERSION = "v2";
const STATIC_CACHE = `wangraan-static-${VERSION}`;
const PAGE_CACHE = `wangraan-pages-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/playground", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
/** ไฟล์ build มี hash ใหม่ทุก deploy — เก็บแค่ล่าสุดเท่านี้ ลบตัวเก่าสุดก่อน (Cache เรียงตามลำดับที่ใส่) */
const STATIC_MAX = 300;
/** หน้าที่เก็บไว้เปิดออฟไลน์ได้ — หน้าอื่น (เช่น ผังของฉัน) มีข้อมูลบัญชี จึงไม่เก็บ */
const OFFLINE_PAGES = new Set(["/", "/playground", OFFLINE_URL]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("wangraan-") && k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/");

async function trimStatic(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - STATIC_MAX)).map((key) => cache.delete(key)));
}

async function cacheFirst(event, request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.status === 200) {
    event.waitUntil(cache.put(request, response.clone()).then(() => trimStatic(cache)));
  }
  return response;
}

async function networkFirstPage(request, url) {
  const cache = await caches.open(PAGE_CACHE);
  const keep = OFFLINE_PAGES.has(url.pathname);
  try {
    const response = await fetch(request);
    // response ที่ผ่าน redirect ส่งให้ navigation ซ้ำไม่ได้ (เบราว์เซอร์ปฏิเสธ) จึงไม่เก็บ
    if (keep && response.ok && !response.redirected) cache.put(url.pathname, response.clone());
    return response;
  } catch (error) {
    const cached = (keep && (await cache.match(url.pathname))) || (await cache.match(OFFLINE_URL));
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  // คำขอ RSC ของการเปลี่ยนหน้าแบบ client — ปล่อยให้ Next จัดการ (ถ้าล้มเหลว Next จะโหลดหน้าเต็มซึ่งเรารับต่อด้านล่าง)
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request, url));
  } else if (isStatic(url)) {
    event.respondWith(cacheFirst(event, request));
  }
});

/** หน้าเว็บส่งรายชื่อไฟล์ที่โหลดไปแล้วมาให้ (ก่อน SW จะคุมหน้า) — เก็บไว้ใช้ออฟไลน์ */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(
        data.urls
          .map((u) => new URL(u, self.location.origin))
          .filter((u) => u.origin === self.location.origin && isStatic(u))
          .map((u) => cache.match(u.href).then((hit) => hit || cache.add(u.href).catch(() => {}))),
      ).then(() => trimStatic(cache)),
    ),
  );
});
