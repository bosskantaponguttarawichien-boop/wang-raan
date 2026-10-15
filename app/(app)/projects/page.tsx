import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsHeader } from "@/components/projects/projects-header";
import { ProjectsList } from "@/components/projects/projects-list";
import { AppProviders } from "@/components/providers/app-providers";

export const metadata: Metadata = {
  title: "ผังของฉัน — วางร้าน",
  description: "จัดการและออกแบบผังร้านอาหาร คาเฟ่ ของคุณในระบบ 2D และ 3D",
};

export default function ProjectsPage() {
  return (
    <AppProviders>
      <div className="min-h-screen bg-[#f7f9fc] text-[#1e2b40] overflow-x-hidden">
        <ProjectsHeader />
        <Suspense
          fallback={
            <div className="mx-auto max-w-[1120px] p-8 text-center text-[#4e627c]">
              กำลังโหลด…
            </div>
          }
        >
          <ProjectsList />
        </Suspense>
      </div>
    </AppProviders>
  );
}
