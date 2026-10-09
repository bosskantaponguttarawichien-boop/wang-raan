import * as React from "react";

export function PanelTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="m-0 mb-4 flex items-center gap-2 text-[15px] font-semibold leading-[1.5]">
      <span aria-hidden="true" className="size-2 rounded-[2px] border-[1.5px] border-[#8d9bb0]" />
      {children}
    </h2>
  );
}
