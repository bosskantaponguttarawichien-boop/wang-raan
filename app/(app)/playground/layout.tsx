import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";

export const metadata: Metadata = { title: "Playground — จัดผังร้าน" };

export default function PlaygroundLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div data-surface="playground" className="relative h-dvh overflow-hidden bg-surface print:h-auto print:overflow-visible print:bg-white">
      <AppProviders>{children}</AppProviders>
    </div>
  );
}
