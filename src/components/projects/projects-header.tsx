"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import * as React from "react";

export function ProjectsHeader() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const user = session?.user;
  const displayName = user?.name || user?.email?.split("@")[0] || "ผู้ใช้";
  const displayEmail = user?.email || "";
  const initialLetter = displayName.charAt(0).toUpperCase() || "ผ";

  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b border-[#e2e8f1] bg-white px-3 sm:px-8">
      <Link
        href="/"
        className="flex items-center gap-2 text-[18px] font-semibold text-[#1e2b40] no-underline focus-visible:outline-3 focus-visible:outline-[#a4b6ff]"
      >
        <span className="flex size-7 items-center justify-center rounded-[8px] bg-[#3b62f4] text-[14px] font-bold text-white shrink-0" aria-hidden="true">
          ว
        </span>
        <span className="shrink-0">วางร้าน</span>
      </Link>

      <div className="flex-1" />

      {/* Account Menu */}
      <div className="relative shrink-0">
        <button
          ref={buttonRef}
          type="button"
          id="acct"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="เมนูบัญชี"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex max-w-[200px] items-center gap-1.5 rounded-full border border-transparent p-1 pl-1 pr-2 hover:bg-[#f7f9fc] hover:border-[#e2e8f1] cursor-pointer transition-colors focus-visible:outline-3 focus-visible:outline-[#a4b6ff]"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#edf1ff] text-[14px] font-semibold text-[#3b62f4]" aria-hidden="true">
            {initialLetter}
          </span>
          <span className="truncate text-[13px] text-[#4e627c] max-[640px]:hidden">
            {displayEmail || displayName}
          </span>
          <svg className="w-4 h-4 text-[#4e627c] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            id="acct-menu"
            role="menu"
            aria-label="เมนูผู้ใช้งาน"
            className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[220px] rounded-[12px] border border-[#e2e8f1] bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="border-b border-[#e2e8f1] p-2.5 pb-2 mb-1">
              <b className="block text-[14px] font-semibold text-[#1e2b40]">{displayName}</b>
              {displayEmail && (
                <small className="block break-all text-[12px] text-[#52637a] mt-0.5">
                  {displayEmail}
                </small>
              )}
            </div>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                signOut({ callbackUrl: "/login" });
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] border-0 bg-transparent px-3 py-2 text-left text-[14px] text-[#b23d33] hover:bg-[#fdeeec] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff] transition-colors"
            >
              <svg className="w-4 h-4 text-[#b23d33]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              ออกจากระบบ
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
