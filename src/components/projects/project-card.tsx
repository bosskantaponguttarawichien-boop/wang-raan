"use client";

import Link from "next/link";
import * as React from "react";
import { renderPlanSvg } from "@/core/export/plan-svg";
import type { LayoutSummaryDto } from "@/lib/api-client";
import { ProjectCardMenu } from "./project-card-menu";

export interface ProjectCardProps {
  layout: LayoutSummaryDto;
  onOpen: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}

export function formatRelativeThai(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return "แก้ไขเมื่อสักครู่";
    if (diffSec < 3600) return `แก้ไขเมื่อ ${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
    if (diffSec < 86400) return `แก้ไขเมื่อ ${Math.floor(diffSec / 3600)} ชั่วโมงที่แล้ว`;

    const day = date.getDate();
    const months = [
      "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
      "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
    ];
    const month = months[date.getMonth()];
    const year = date.getFullYear() + 543;
    return `แก้ไขเมื่อ ${day} ${month} ${year}`;
  } catch {
    return "แก้ไขล่าสุด";
  }
}

export function ProjectCard({ layout, onOpen, onDelete }: ProjectCardProps) {
  const { id, name, width, depth, updatedAt, layout: planData } = layout;

  const svgString = React.useMemo(() => {
    if (!planData) return null;
    try {
      return renderPlanSvg(planData, { grid: false });
    } catch {
      return null;
    }
  }, [planData]);

  const editedText = formatRelativeThai(updatedAt);

  return (
    <li className="group relative rounded-[16px] border border-[#e2e8f1] bg-white overflow-hidden shadow-sm hover:border-[#c8d2e2] hover:shadow-md transition-all">
      {/* ภาพย่อผังร้าน (Thumbnail) */}
      <div className="relative aspect-[16/10] bg-[#eef2f7] border-b border-[#e2e8f1] flex items-center justify-center p-3.5 overflow-hidden">
        {svgString ? (
          <div
            className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:drop-shadow-[0_2px_6px_rgba(30,43,64,0.10)]"
            dangerouslySetInnerHTML={{ __html: svgString }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[#52637a] text-[13px]">
            <svg className="w-8 h-8 mb-1 text-[#4e627c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            <span>{width} × {depth} ม.</span>
          </div>
        )}

        {/* ปุ่มเมนู ⋯ มุมขวาบน */}
        <div className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-[768px]:opacity-100 transition-opacity">
          <ProjectCardMenu
            layoutId={id}
            layoutName={name}
            onOpen={() => onOpen(id)}
            onDelete={() => onDelete(id, name)}
          />
        </div>
      </div>

      {/* ลิงก์ครอบเพื่อเปิดผัง */}
      <Link
        href={`/playground/${id}`}
        aria-label={`เปิดผัง ${name} ขนาด ${width} × ${depth} เมตร ${editedText}`}
        className="block p-3.5 focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#3b62f4] text-white" aria-hidden="true">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-[15px] font-semibold text-[#1e2b40]">
              {name}
            </h2>
            <p className="m-0 mt-0.5 truncate text-[13px] text-[#4e627c]">
              {width} × {depth} ม. · {editedText}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}
