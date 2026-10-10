import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { renderPlanSvg, severityByObject, summarizeLayout } from "@/core/export";
import { StatusBadge, buttonVariants } from "@/components/ui";
import { ShareViewer } from "@/components/share/share-viewer";
import { BackendError } from "@/server/backend";
import { clientIpFrom } from "@/server/rate-limit";
import { shareRepository } from "@/server/share-repository";

/**
 * หน้าแชร์ผังร้านแบบสาธารณะ (feat-030) — Server Component, ไม่ต้องเข้าสู่ระบบ, อ่านอย่างเดียว
 * ลิงก์เป็นความลับระดับ "ใครมีลิงก์ก็ดูได้" จึงไม่ให้ search engine เก็บ (noindex)
 * ลิงก์ที่ถูกยกเลิก/หมดอายุ (feat-040) แสดงหน้าแจ้งแทนผัง
 */
type Props = { params: Promise<{ shareKey: string }> };

export const dynamic = "force-dynamic";

/**
 * metadata กับหน้าเรียกซ้ำกันในคำขอเดียว → ดึงจาก Backend ครั้งเดียว
 * Backend ล่ม/ยังไม่ได้ตั้งค่า → "unavailable" (แสดงหน้าแจ้งภาษาไทย ไม่ใช่หน้า error ของ Next.js)
 */
const loadShare = cache(async (shareKey: string) => {
  try {
    return await shareRepository.getPublic(shareKey, clientIpFrom(await headers()));
  } catch (error) {
    console.error("[wang-raan] เปิดลิงก์แชร์ไม่ได้", error instanceof BackendError ? { status: error.status, code: error.code, cause: error.detail.cause } : error);
    return "unavailable" as const;
  }
});

const NOTICE = {
  revoked: { title: "ลิงก์นี้ถูกยกเลิกแล้ว", detail: "เจ้าของผังยกเลิกการแชร์ลิงก์นี้แล้ว ขอลิงก์ใหม่จากเจ้าของผังได้" },
  expired: { title: "ลิงก์นี้หมดอายุแล้ว", detail: "ลิงก์นี้ใช้งานได้ถึงวันที่เจ้าของผังกำหนดไว้ ขอลิงก์ใหม่จากเจ้าของผังได้" },
  unavailable: { title: "เปิดผังไม่ได้ชั่วคราว", detail: "ระบบจัดเก็บผังขัดข้อง ลองเปิดลิงก์นี้ใหม่อีกครั้งในอีกสักครู่" },
} as const;
type Notice = keyof typeof NOTICE;
const isNotice = (value: unknown): value is Notice => typeof value === "string" && value in NOTICE;

/**
 * origin สำหรับ URL ของ OG image — บน Cloudflare Workers Next.js เดา origin เองไม่ได้ (จะได้ localhost:3000)
 * production ใช้ SITE_URL เท่านั้น: Host header มาจากผู้ใช้ ถ้าใช้สร้าง URL แล้วมี cache คั่น จะถูกฝัง URL ปลอมได้
 * dev/test ที่ไม่ตั้ง SITE_URL → ใช้ host ของคำขอ
 */
async function siteOrigin(): Promise<URL | undefined> {
  if (process.env.SITE_URL) return new URL(process.env.SITE_URL);
  if (process.env.NODE_ENV === "production") {
    console.warn("[wang-raan] ไม่ได้ตั้ง SITE_URL — URL ของ OG image ในหน้าแชร์จะไม่ถูกต้อง (ดู .env.example)");
    return undefined;
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return undefined;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return new URL(`${proto}://${host}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shared = await loadShare((await params).shareKey);
  if (shared === "not-found") return { title: "ไม่พบลิงก์แชร์", robots: { index: false, follow: false } };
  if (isNotice(shared)) return { title: NOTICE[shared].title, robots: { index: false, follow: false } };
  const s = summarizeLayout(shared.layout, shared.validation);
  const title = `ผังร้าน ${s.width} × ${s.depth} เมตร · ${s.seats} ที่นั่ง`;
  const description = `ผังร้านที่จัดด้วยวางร้าน — ครัว ${s.counts.kitchen} · เคาน์เตอร์ ${s.counts.counter} · ชุดโต๊ะ ${s.counts.table}`;
  return {
    metadataBase: await siteOrigin(),
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const fmt = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 2 });

function ShareHeader() {
  return (
    <header className="flex h-[60px] items-center justify-between gap-4 border-b border-[#e5eaf2] bg-white px-[22px] max-[700px]:px-4">
      <Link
        href="/"
        aria-label="วางร้าน กลับหน้าแรก"
        className="flex items-center gap-2.5 text-[21px] font-semibold text-ink no-underline focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG โลโก้ขนาดเล็ก */}
        <img src="/assets/logos/logo-wangraan-clear-channel.svg" alt="" aria-hidden="true" width={34} height={34} className="block size-[34px]" />
        วางร้าน
      </Link>
      <span className="text-[12px] text-secondary-strong">ผังที่แชร์ · อ่านอย่างเดียว</span>
    </header>
  );
}

function ShareNotice({ reason }: { reason: Notice }) {
  return (
    <div data-surface="playground" className="min-h-dvh bg-blue-tint-3">
      <ShareHeader />
      <main className="mx-auto max-w-[560px] px-5 py-12 max-[700px]:px-3">
        <section className="rounded-[14px] border border-line bg-white p-6 text-center" data-testid="share-gone" data-reason={reason}>
          <h1 className="m-0 mb-2 text-[20px] font-semibold leading-[1.4]">{NOTICE[reason].title}</h1>
          <p className="m-0 mb-5 text-[14px] leading-[1.75] text-secondary-strong">{NOTICE[reason].detail}</p>
          <Link href="/playground" className={buttonVariants({ variant: "primary", size: "md" })}>
            จัดร้านของคุณเอง
          </Link>
        </section>
      </main>
    </div>
  );
}

export default async function SharePage({ params }: Props) {
  const shared = await loadShare((await params).shareKey);
  if (shared === "not-found") notFound();
  if (isNotice(shared)) return <ShareNotice reason={shared} />;
  const { layout, validation } = shared;
  const summary = summarizeLayout(layout, validation);
  const planSvg = renderPlanSvg(layout, {
    severityById: severityByObject(validation.issues),
    title: `ผังร้านขนาด ${layout.width} × ${layout.depth} เมตร`,
  });
  const rows: Array<[string, string]> = [
    ["ขนาดร้าน", `${fmt(summary.width)} × ${fmt(summary.depth)} ม. (${fmt(summary.area)} ตร.ม.)`],
    ["ที่นั่ง", `${summary.seats} ที่นั่ง`],
    ["ชุดโต๊ะ", `${summary.counts.table} ชุด`],
    ["ครัว / เคาน์เตอร์", `${summary.counts.kitchen} / ${summary.counts.counter}`],
    ["พื้นที่ต่อที่นั่ง", summary.areaPerSeat === null ? "—" : `${fmt(summary.areaPerSeat)} ตร.ม.`],
  ];

  return (
    <div data-surface="playground" className="min-h-dvh bg-blue-tint-3">
      <ShareHeader />
      <main className="mx-auto grid max-w-[1180px] gap-5 px-5 py-6 min-[1021px]:grid-cols-[minmax(0,1fr)_320px] max-[700px]:px-3">
        <section aria-labelledby="share-title" className="min-w-0 rounded-[14px] border border-line bg-white p-5 max-[700px]:p-3">
          <h1 id="share-title" className="m-0 mb-4 text-[20px] font-semibold leading-[1.4]">
            ผังร้าน {fmt(layout.width)} × {fmt(layout.depth)} เมตร
          </h1>
          <ShareViewer layout={layout} planSvg={planSvg} />
        </section>
        <aside aria-label="สรุปผังร้าน" className="h-max rounded-[14px] border border-line bg-white p-5">
          <StatusBadge status={summary.status} className="mb-4" />
          <table className="w-full border-collapse text-[13px] leading-[1.75]">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label} className="border-b border-[#e3e9f2]">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium text-secondary-strong">
                    {label}
                  </th>
                  <td className="py-1.5 tabular-nums">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mb-4 mt-3 text-[12px] leading-[1.75] text-secondary-strong">
            แชร์เมื่อ {new Date(shared.createdAt).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" })} · ภาพนี้เป็นสำเนา ณ เวลาที่แชร์
            {shared.expiresAt && (
              <>
                {" "}
                · ลิงก์ใช้ได้ถึง {new Date(shared.expiresAt).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" })}
              </>
            )}
          </p>
          <Link href="/playground" className={buttonVariants({ variant: "primary", size: "md", className: "w-full" })}>
            จัดร้านของคุณเอง
          </Link>
        </aside>
      </main>
    </div>
  );
}
