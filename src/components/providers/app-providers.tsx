"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import * as React from "react";
import { createQueryClient } from "@/lib/layout-queries";

/** Session (Auth.js) + TanStack Query สำหรับหน้าแอป — QueryClient หนึ่งตัวต่อหน้าต่างเบราว์เซอร์ */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(createQueryClient);
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}
