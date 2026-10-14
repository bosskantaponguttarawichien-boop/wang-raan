"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { getDraftStorage, loadDraft } from "@/lib/draft-storage";
import { layoutStore } from "@/store/use-layout-store";

export interface UseGuestSyncOptions {
  onToast?: (message: string) => void;
}

export function useGuestSync({ onToast }: UseGuestSyncOptions = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const isSyncingRef = React.useRef(false);

  React.useEffect(() => {
    if (searchParams.get("sync") !== "1") return;
    if (status === "loading") return;

    const isUser = Boolean(session?.user?.id && !session.user.id.startsWith("guest-"));
    if (!isUser) return;

    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    async function syncOnline() {
      const storage = getDraftStorage();
      const draft = storage ? loadDraft(storage) : null;
      const currentStore = layoutStore.getState();

      const draftLayout = draft ? draft.history[draft.historyIndex] : null;
      const baseLayout = draftLayout ?? currentStore.layout;
      const layout = {
        ...baseLayout,
        id: `lay_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      };
      const name = draft?.name ?? currentStore.layoutName ?? `ผังร้าน ${layout.width} × ${layout.depth} ม.`;

      try {
        const created = await api.createLayout(layout, name);
        storage?.removeItem("wang-raan:pending-sync");
        storage?.clear();
        onToast?.("บันทึกผังในบัญชีของคุณเรียบร้อยแล้ว");
        router.replace(`/playground/${created.layout.id}`);
        router.refresh();
      } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        if (error.code === "LAYOUT_BLOCKED") {
          onToast?.("ผังยังไม่ผ่านกฎจำเป็น จึงบันทึกไม่ได้ — แก้ไขตามแถบสถานะก่อน");
        } else {
          onToast?.("บันทึกผังออนไลน์ไม่สำเร็จ โปรดลองใหม่อีกครั้ง");
        }
        router.replace("/playground");
      }
    }

    void syncOnline();
  }, [searchParams, session, status, router, onToast]);
}
