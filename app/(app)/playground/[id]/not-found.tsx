import Link from "next/link";

export default function LayoutNotFound() {
  return (
    <div className="flex min-h-[calc(100dvh-60px)] flex-col items-center justify-center bg-[#f7f9fc] px-4 text-center">
      <div className="mx-auto max-w-md rounded-[16px] border border-[#e2e8f1] bg-white p-8 shadow-sm">
        <div
          className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[#f0f3f8] text-[#8596ad]"
          aria-hidden="true"
        >
          <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="text-[20px] font-bold text-[#1e2b40] mb-2">
          ไม่พบผังร้านนี้
        </h1>
        <p className="text-[14px] leading-relaxed text-[#52637a] mb-6">
          ผังร้านนี้อาจถูกลบไปแล้ว หรือคุณไม่มีสิทธิ์เข้าถึงผังนี้ (เฉพาะเจ้าของผังเท่านั้นที่สามารถเปิดได้)
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/projects"
            className="inline-flex h-10 w-full sm:w-auto items-center justify-center rounded-[10px] bg-[#3b62f4] px-5 text-[14px] font-medium text-white hover:bg-[#2e50da] focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 transition-colors no-underline"
          >
            ไปยังหน้ารวมผังร้าน
          </Link>
          <Link
            href="/playground"
            className="inline-flex h-10 w-full sm:w-auto items-center justify-center rounded-[10px] border border-[#e2e8f1] bg-white px-5 text-[14px] font-medium text-[#1e2b40] hover:bg-[#f7f9fc] focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 transition-colors no-underline"
          >
            สร้างผังใหม่
          </Link>
        </div>
      </div>
    </div>
  );
}
