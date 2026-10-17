/* eslint-disable @next/next/no-img-element */
import * as React from "react";
import Link from "next/link";

/** ผู้ให้บริการและช่องทางติดต่อ — ใช้ร่วมกันในหน้าข้อกำหนดและนโยบายความเป็นส่วนตัว */
export const LEGAL_OPERATOR = "วางร้าน";
export const LEGAL_CONTACT_EMAIL = "boss.kantapong.uttarawichien@gmail.com";
export const LEGAL_UPDATED = "17 ตุลาคม 2569";

const FOCUS = "focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2";
const LINK = `text-[#3b62f4] underline underline-offset-2 hover:text-[#1e2b40] rounded-[4px] ${FOCUS}`;

const DOCS = [
  { key: "terms", href: "/terms", label: "ข้อกำหนด" },
  { key: "privacy", href: "/privacy", label: "ความเป็นส่วนตัว" },
] as const;

type LegalDoc = (typeof DOCS)[number]["key"];

type TocItem = { id: string; title: string };

/** id ของหัวข้อ เช่น "3. บัญชีของคุณ" → "section-3" */
function sectionId(title: string, index: number) {
  const num = /^(\d+)\./.exec(title)?.[1];
  return `section-${num ?? index + 1}`;
}

/** ดึงรายการหัวข้อจาก <LegalSection> ที่เป็นลูกโดยตรง เพื่อทำสารบัญ */
function collectToc(children: React.ReactNode): TocItem[] {
  return React.Children.toArray(children)
    .filter((child): child is React.ReactElement<{ title: string }> =>
      React.isValidElement(child) && child.type === LegalSection,
    )
    .map((child, i) => ({ id: sectionId(child.props.title, i), title: child.props.title }));
}

function TocList({ items }: { items: TocItem[] }) {
  return (
    <ol className="list-none m-0 p-0 flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className={`block rounded-[8px] px-3 py-1.5 text-[14px] leading-[1.6] text-[#4e627c] no-underline hover:bg-[#eef2f8] hover:text-[#1e2b40] ${FOCUS}`}
          >
            {item.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function LegalPage({
  title,
  current,
  children,
}: {
  title: string;
  current: LegalDoc;
  children: React.ReactNode;
}) {
  const toc = collectToc(children);

  return (
    <div className="min-h-dvh bg-[#f7f9fc] text-[#1e2b40] flex flex-col font-sans">
      <header className="sticky top-0 z-10 bg-[#f7f9fc]/90 backdrop-blur border-b border-[#e2e8f1]">
        <div className="w-full max-w-[1120px] mx-auto flex items-center justify-between gap-3 px-4 sm:px-8 h-14 sm:h-16">
          <Link
            href="/"
            aria-label="วางร้าน — หน้าแรก"
            className={`flex items-center gap-2 font-semibold text-[17px] sm:text-[18px] text-[#1e2b40] no-underline rounded-[8px] shrink-0 ${FOCUS}`}
          >
            <img
              src="/assets/logos/logo-wangraan-clear-channel.svg"
              alt=""
              aria-hidden="true"
              width={38}
              height={38}
              className="block size-[30px] sm:size-[36px]"
            />
            วางร้าน
          </Link>
          <nav aria-label="เอกสารทางกฎหมาย" className="flex items-center gap-1 rounded-full bg-[#eef2f8] p-1">
            {DOCS.map((doc) => {
              const active = doc.key === current;
              return (
                <Link
                  key={doc.key}
                  href={doc.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 sm:px-4 min-h-[36px] flex items-center text-[13px] sm:text-[14px] no-underline whitespace-nowrap ${
                    active ? "bg-white text-[#1e2b40] font-semibold shadow-sm" : "text-[#4e627c] hover:text-[#1e2b40]"
                  } ${FOCUS}`}
                >
                  {doc.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="flex-1 w-full max-w-[1120px] mx-auto px-4 sm:px-8 py-6 sm:py-10 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
        {toc.length > 0 && (
          <aside className="hidden lg:block">
            <nav aria-label="สารบัญ" className="sticky top-24">
              <p className="m-0 mb-2 px-3 text-[12px] font-semibold uppercase tracking-wide text-[#52637a]">ในหน้านี้</p>
              <TocList items={toc} />
            </nav>
          </aside>
        )}

        <main className="min-w-0 max-w-[760px]">
          <article className="bg-white border border-[#e2e8f1] rounded-[16px] px-5 py-6 sm:px-10 sm:py-10 text-[15px] sm:text-[16px] leading-[1.8] text-[#33435a] [overflow-wrap:anywhere]">
            <h1 className="m-0 text-[24px] sm:text-[32px] font-semibold leading-[1.35] text-[#1e2b40]">{title}</h1>
            <p className="m-0 mt-2 text-[13px] sm:text-[14px] text-[#52637a]">ปรับปรุงล่าสุด {LEGAL_UPDATED}</p>

            {toc.length > 0 && (
              <details className="group lg:hidden mt-5 rounded-[12px] border border-[#e2e8f1] bg-[#f7f9fc]">
                <summary
                  className={`cursor-pointer select-none px-4 min-h-[44px] flex items-center justify-between gap-2 text-[14px] font-semibold text-[#1e2b40] rounded-[12px] list-none [&::-webkit-details-marker]:hidden ${FOCUS}`}
                >
                  สารบัญ ({toc.length} หัวข้อ)
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="size-4 shrink-0 text-[#52637a] transition-transform group-open:rotate-180"
                  >
                    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <nav aria-label="สารบัญ" className="px-1 pb-2">
                  <TocList items={toc} />
                </nav>
              </details>
            )}

            <div className="mt-6 flex flex-col gap-3">{children}</div>
          </article>
        </main>
      </div>

      <footer className="border-t border-[#e2e8f1]">
        <div className="w-full max-w-[1120px] mx-auto px-4 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[13px] leading-[1.6] text-[#52637a]">
          <span>© {new Date().getFullYear()} วางร้าน · ออกแบบผังร้านอาหารและคาเฟ่</span>
          <Link href="/" className={`text-[#4e627c] hover:text-[#1e2b40] no-underline rounded-[4px] ${FOCUS}`}>
            ← กลับหน้าแรก
          </Link>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = sectionId(title, 0);
  return (
    <section id={id} className="scroll-mt-24 mt-5 pt-6 border-t border-[#eef2f8]">
      <h2 className="m-0 mb-3 text-[18px] sm:text-[20px] font-semibold leading-[1.45] text-[#1e2b40]">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** รายการแบบมีจุดนำหน้า — ใส่ class เองทุกชั้น ไม่พึ่ง style ของ ul/li จากที่อื่น */
export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="m-0 pl-5 list-disc flex flex-col gap-2 marker:text-[#8a9ab0]">{children}</ul>;
}

export function LegalItem({ children }: { children: React.ReactNode }) {
  return <li className="list-item pl-1">{children}</li>;
}

export function ContactEmail() {
  return (
    <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={LINK}>
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}

export function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={LINK}>
      {children}
    </Link>
  );
}
