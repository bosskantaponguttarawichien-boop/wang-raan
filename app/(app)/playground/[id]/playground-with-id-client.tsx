"use client";

import dynamic from "next/dynamic";
import * as React from "react";
import type { StoreLayout } from "@/core/layout";
import { layoutStore } from "@/store/use-layout-store";

export interface PlaygroundWithIdClientProps {
  layout: StoreLayout;
  name?: string;
}

export function PlaygroundWithIdClient({ layout, name }: PlaygroundWithIdClientProps) {
  React.useEffect(() => {
    layoutStore.getState().loadLayout(layout, name, layout.id);
  }, [layout, name]);

  return <PlaygroundEditorDynamic />;
}

const PlaygroundEditorDynamic = dynamic(
  () => import("@/components/editor/playground-editor").then((m) => m.PlaygroundEditor),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[calc(100dvh-60px)] place-items-center bg-blue-tint-3" role="status" aria-live="polite">
        <p className="m-0 text-[14px] text-secondary-strong">กำลังเปิดพื้นที่จัดผัง…</p>
      </div>
    ),
  },
);
