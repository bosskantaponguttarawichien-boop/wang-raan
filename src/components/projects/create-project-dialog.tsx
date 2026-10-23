"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import { snapToGrid, type Wall } from "@/core/layout";

export interface CreateProjectParams {
  name: string;
  width: number;
  depth: number;
  wall: Wall;
}

export interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreate: (params: CreateProjectParams) => void | Promise<void>;
  onUseTemplate: (name: string) => void | Promise<void>;
  loading?: boolean;
}

const WALL_OPTIONS: Array<{ wall: Wall; label: string }> = [
  { wall: "north", label: "บน" },
  { wall: "south", label: "ล่าง" },
  { wall: "west", label: "ซ้าย" },
  { wall: "east", label: "ขวา" },
];

export function CreateProjectDialog({
  open,
  onOpenChange,
  defaultName = "ผังร้าน 1",
  onCreate,
  onUseTemplate,
  loading = false,
}: CreateProjectDialogProps) {
  const [name, setName] = React.useState<string>(defaultName);
  const [widthStr, setWidthStr] = React.useState<string>("8");
  const [depthStr, setDepthStr] = React.useState<string>("6");
  const [wall, setWall] = React.useState<Wall>("south");

  const [nameError, setNameError] = React.useState<string | null>(null);
  const [sizeError, setSizeError] = React.useState<string | null>(null);

  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const widthInputRef = React.useRef<HTMLInputElement>(null);
  const depthInputRef = React.useRef<HTMLInputElement>(null);

  // รีเซ็ตค่าเมื่อเปิด dialog ใหม่ (ทำระหว่าง render — ไม่ต้องรอ effect แล้ว render ซ้ำ)
  const [resetFor, setResetFor] = React.useState({ open, defaultName });
  if (resetFor.open !== open || resetFor.defaultName !== defaultName) {
    setResetFor({ open, defaultName });
    if (open) {
      setName(defaultName);
      setWidthStr("8");
      setDepthStr("6");
      setWall("south");
      setNameError(null);
      setSizeError(null);
    }
  }

  const validate = (): { ok: true; cleanName: string; validW: number; validD: number } | { ok: false } => {
    const cleanName = name.trim();
    if (!cleanName) {
      setNameError("กรุณาระบุชื่อผังร้าน");
      nameInputRef.current?.focus();
      return { ok: false };
    }
    if (cleanName.length > 80) {
      setNameError("ชื่อผังต้องไม่เกิน 80 ตัวอักษร");
      nameInputRef.current?.focus();
      return { ok: false };
    }
    setNameError(null);

    const wNum = parseFloat(widthStr);
    const dNum = parseFloat(depthStr);

    if (isNaN(wNum) || wNum < 2 || wNum > 30) {
      setSizeError("ความกว้างต้องอยู่ระหว่าง 2 ถึง 30 เมตร");
      widthInputRef.current?.focus();
      return { ok: false };
    }
    if (isNaN(dNum) || dNum < 2 || dNum > 30) {
      setSizeError("ความลึกต้องอยู่ระหว่าง 2 ถึง 30 เมตร");
      depthInputRef.current?.focus();
      return { ok: false };
    }
    setSizeError(null);

    const validW = snapToGrid(wNum);
    const validD = snapToGrid(dNum);
    return { ok: true, cleanName, validW, validD };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (!v.ok) return;
    await onCreate({ name: v.cleanName, width: v.validW, depth: v.validD, wall });
  };

  const handleTemplateClick = async () => {
    const cleanName = name.trim() || defaultName;
    if (cleanName.length > 80) {
      setNameError("ชื่อผังต้องไม่เกิน 80 ตัวอักษร");
      nameInputRef.current?.focus();
      return;
    }
    await onUseTemplate(cleanName);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#1e2b40]/40 backdrop-blur-[2px] transition-opacity" />
        <Dialog.Content
          aria-labelledby="nm-t"
          aria-describedby="nm-d"
          onOpenAutoFocus={(e) => {
            // โฟกัสไปที่ช่องใส่ชื่อผัง
            e.preventDefault();
            nameInputRef.current?.focus();
            nameInputRef.current?.select();
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-[#e2e8f1] bg-white p-6 shadow-2xl focus:outline-none"
        >
          <form id="nm-form" onSubmit={handleSubmit} noValidate>
            <Dialog.Title id="nm-t" className="m-0 mb-1 text-[18px] font-semibold text-[#1e2b40]">
              สร้างผังใหม่
            </Dialog.Title>
            <Dialog.Description id="nm-d" className="mb-4 text-[13px] leading-[1.5] text-[#4e627c]">
              ใส่ค่าประมาณได้ แก้ทีหลังได้เสมอที่แท็บ &ldquo;ร้าน&rdquo;
            </Dialog.Description>

            {/* ช่องชื่อผัง */}
            <div className="mb-1 flex flex-col gap-1.5">
              <label htmlFor="nm-input" className="text-[13px] font-medium text-[#4e627c]">
                ชื่อผัง
              </label>
              <input
                id="nm-input"
                ref={nameInputRef}
                type="text"
                autoComplete="off"
                value={name}
                aria-invalid={nameError ? "true" : "false"}
                aria-describedby="nm-help"
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                className={`h-11 w-full rounded-[10px] border px-3 text-[14px] text-[#1e2b40] bg-white focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-1 transition-colors ${
                  nameError ? "border-[#e4685d]" : "border-[#e2e8f1] focus:border-[#3b62f4]"
                }`}
              />
            </div>
            <p id="nm-help" className={`mb-4 flex items-center justify-between text-[12px] ${nameError ? "text-[#b23d33]" : "text-[#52637a]"}`}>
              <span>{nameError ?? "เช่น ชื่อร้านหรือสาขา"}</span>
              <span id="nm-count" className={`tabular-nums ${name.length > 80 ? "text-[#b23d33] font-semibold" : ""}`}>{name.length}/80</span>
            </p>

            {/* ฟิลด์เซต: ขนาดร้าน */}
            <fieldset className="mb-4 border-0 p-0 m-0 min-w-0">
              <legend className="mb-1.5 p-0 text-[13px] font-medium text-[#4e627c]">
                ขนาดร้าน <span className="font-normal text-[#52637a]">(2–30 ม.)</span>
              </legend>
              <div className="flex items-center gap-2">
                <div
                  className={`flex flex-1 items-center gap-1.5 h-11 rounded-[10px] border px-3 text-[13px] text-[#4e627c] bg-white focus-within:border-[#3b62f4] focus-within:outline-3 focus-within:outline-[#a4b6ff] focus-within:outline-offset-1 ${
                    sizeError ? "border-[#e4685d]" : "border-[#e2e8f1]"
                  }`}
                >
                  <label htmlFor="nm-w" className="sr-only">
                    ความกว้าง (เมตร)
                  </label>
                  <span aria-hidden="true" className="shrink-0">กว้าง</span>
                  <input
                    id="nm-w"
                    ref={widthInputRef}
                    type="number"
                    inputMode="decimal"
                    min={2}
                    max={30}
                    step={0.25}
                    value={widthStr}
                    aria-invalid={sizeError ? "true" : "false"}
                    onChange={(e) => {
                      setWidthStr(e.target.value);
                      if (sizeError) setSizeError(null);
                    }}
                    className="flex-1 min-w-0 border-0 bg-transparent p-0 text-right text-[15px] font-medium text-[#1e2b40] outline-none"
                  />
                  <span aria-hidden="true" className="shrink-0">ม.</span>
                </div>

                <span className="text-[#52637a] font-medium" aria-hidden="true">×</span>

                <div
                  className={`flex flex-1 items-center gap-1.5 h-11 rounded-[10px] border px-3 text-[13px] text-[#4e627c] bg-white focus-within:border-[#3b62f4] focus-within:outline-3 focus-within:outline-[#a4b6ff] focus-within:outline-offset-1 ${
                    sizeError ? "border-[#e4685d]" : "border-[#e2e8f1]"
                  }`}
                >
                  <label htmlFor="nm-dp" className="sr-only">
                    ความลึก (เมตร)
                  </label>
                  <span aria-hidden="true" className="shrink-0">ลึก</span>
                  <input
                    id="nm-dp"
                    ref={depthInputRef}
                    type="number"
                    inputMode="decimal"
                    min={2}
                    max={30}
                    step={0.25}
                    value={depthStr}
                    aria-invalid={sizeError ? "true" : "false"}
                    onChange={(e) => {
                      setDepthStr(e.target.value);
                      if (sizeError) setSizeError(null);
                    }}
                    className="flex-1 min-w-0 border-0 bg-transparent p-0 text-right text-[15px] font-medium text-[#1e2b40] outline-none"
                  />
                  <span aria-hidden="true" className="shrink-0">ม.</span>
                </div>
              </div>
              {sizeError && (
                <p id="size-err" className="mt-1 text-[12px] text-[#b23d33]">
                  {sizeError}
                </p>
              )}
            </fieldset>

            {/* ฟิลด์เซต: ผนังประตู */}
            <fieldset className="mb-5 border-0 p-0 m-0 min-w-0">
              <legend className="mb-1.5 p-0 text-[13px] font-medium text-[#4e627c]">
                ประตูอยู่ด้าน
              </legend>
              <div role="radiogroup" aria-label="เลือกผนังทางเข้า" className="flex rounded-[10px] border border-[#e2e8f1] overflow-hidden">
                {WALL_OPTIONS.map((opt, idx) => {
                  const isChecked = wall === opt.wall;
                  return (
                    <button
                      key={opt.wall}
                      type="button"
                      role="radio"
                      aria-checked={isChecked}
                      onClick={() => setWall(opt.wall)}
                      className={`flex-1 h-10 border-0 text-[14px] font-medium cursor-pointer transition-colors ${
                        idx > 0 ? "border-l border-[#e2e8f1]" : ""
                      } ${
                        isChecked
                          ? "bg-[#edf1ff] text-[#183cbd] font-semibold"
                          : "bg-white text-[#1e2b40] hover:bg-[#f7f9fc]"
                      } focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-[-2px]`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Action buttons */}
            <div className="flex items-center justify-between gap-2 border-t border-[#e2e8f1] pt-4 mt-2 max-[480px]:flex-col-reverse max-[480px]:items-stretch">
              <button
                id="nm-tpl"
                type="button"
                disabled={loading}
                onClick={handleTemplateClick}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#e2e8f1] bg-white px-3 text-[13px] font-medium text-[#1e2b40] hover:border-[#c8d2e2] hover:bg-[#f7f9fc] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4 text-[#3b62f4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
                ใช้ผังตัวอย่างแทน
              </button>

              <div className="flex items-center gap-2 max-[480px]:grid max-[480px]:grid-cols-2">
                <button
                  id="nm-cancel"
                  type="button"
                  disabled={loading}
                  onClick={() => onOpenChange(false)}
                  className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#e2e8f1] bg-white px-4 text-[14px] font-medium text-[#1e2b40] hover:border-[#c8d2e2] hover:bg-[#f7f9fc] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  id="nm-submit"
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-[#3b62f4] bg-[#3b62f4] px-4 text-[14px] font-medium text-white hover:bg-[#2e50da] cursor-pointer focus-visible:outline-3 focus-visible:outline-[#a4b6ff] focus-visible:outline-offset-2 transition-colors disabled:opacity-50"
                >
                  {loading ? "กำลังสร้าง…" : "สร้างผัง"}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
