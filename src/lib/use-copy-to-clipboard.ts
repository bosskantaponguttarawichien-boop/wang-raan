"use client";

import * as React from "react";

/** คัดลอกข้อความลง Clipboard — `copied` เป็นจริงเมื่อคัดลอกสำเร็จ (ล้างได้ด้วย `reset`) */
export function useCopyToClipboard() {
  const [copied, setCopied] = React.useState(false);
  const copy = React.useCallback(async (text: string) => {
    await navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, []);
  const reset = React.useCallback(() => setCopied(false), []);
  return { copied, copy, reset };
}
