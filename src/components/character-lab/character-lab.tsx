"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import * as React from "react";
import type { CharacterFacing, CharacterMotion } from "./character-lab-scene";

const CharacterLabScene = dynamic(
  () => import("./character-lab-scene").then((module) => module.CharacterLabScene),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full min-h-[360px] place-items-center rounded-[24px] border border-line bg-white text-sm text-secondary" role="status">
        กำลังเตรียมตัวละคร…
      </div>
    ),
  },
);

/** พื้นที่ตรวจสัดส่วนและท่ายืน/นั่ง/เดินของ mannequin โดยไม่แตะ Simulator หลัก */
export function CharacterLab() {
  const [facing, setFacing] = React.useState<CharacterFacing>("front");
  const [motion, setMotion] = React.useState<CharacterMotion>("idle");
  const [seated, setSeated] = React.useState(false);

  return (
    <main data-surface="playground" className="min-h-dvh bg-surface px-4 py-5 text-ink sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-sm font-medium text-blue">พื้นที่ทดลอง</p>
            <h1 className="m-0 mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Character Lab</h1>
            <p className="m-0 mt-2 max-w-xl text-sm leading-6 text-secondary">
              คลิกหรือแตะบนพื้นเพื่อกำหนดจุดหมาย ตัวละครจะหันและเดินไปยังจุดนั้น แล้วกลับมายืน
            </p>
          </div>
          <Link
            href="/playground"
            className="rounded-[10px] border border-line bg-white px-3.5 py-2 text-sm font-medium text-ink shadow-[0_1px_2px_rgba(22,32,51,0.06)] transition-colors hover:bg-surface focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus"
          >
            กลับไปจัดผังร้าน
          </Link>
        </header>

        <section className="overflow-hidden rounded-[24px] border border-line bg-white p-3 shadow-[0_12px_36px_rgba(29,45,72,0.09)] sm:p-4" aria-labelledby="scene-title">
          <h2 id="scene-title" className="sr-only">ฉากทดลองตัวละคร</h2>
          <CharacterLabScene facing={facing} seated={seated} onMotionChange={(next) => {
            setMotion(next);
            setSeated(next === "seated");
          }} />
        </section>

        <section className="rounded-[18px] border border-line bg-white p-4" aria-labelledby="pose-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="pose-title" className="m-0 text-sm font-semibold text-ink">ท่าทาง</h2>
              <p className="m-0 mt-1 text-xs text-secondary">ทดลองนั่งบนเก้าอี้หรือกลับมายืน</p>
            </div>
            <div className="flex gap-2" role="group" aria-label="เลือกท่าทางตัวละคร">
              <button
                type="button"
                aria-pressed={seated}
                onClick={() => setSeated(true)}
                className={`rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus ${seated ? "border-blue bg-blue text-white" : "border-line bg-white text-ink hover:bg-surface"}`}
              >
                นั่งบนเก้าอี้
              </button>
              <button
                type="button"
                aria-pressed={!seated}
                onClick={() => setSeated(false)}
                className={`rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus ${!seated ? "border-blue bg-blue text-white" : "border-line bg-white text-ink hover:bg-surface"}`}
              >
                ยืนขึ้น
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[18px] border border-line bg-white p-4" aria-labelledby="facing-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="facing-title" className="m-0 text-sm font-semibold text-ink">ทิศทางขณะยืน</h2>
              <p className="m-0 mt-1 text-xs text-secondary">เลือกเพื่อเช็กด้านหน้า ด้านข้าง และด้านหลังของโมเดล</p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="เลือกทิศทางของตัวละคร">
              {FACING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={facing === option.value}
                  onClick={() => setFacing(option.value)}
                  className={`rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus ${
                    facing === option.value
                      ? "border-blue bg-blue text-white"
                      : "border-line bg-white text-ink hover:bg-surface"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="grid gap-3 sm:grid-cols-3" aria-label="สถานะการทดลอง">
          <StatusCard label="โมเดล" value="Mannequin สีเทา" detail="หุ่นทรงป้อมสูงประมาณ 0.93 ม. สำหรับฉากร้าน" />
          <StatusCard
            label="ท่าปัจจุบัน"
            value={motion === "walking" ? "กำลังเดิน (Walk)" : motion === "seated" ? "นั่ง (Sit)" : "ยืน (Idle)"}
            detail={motion === "walking" ? "กำลังไปยังจุดที่เลือกบนพื้น" : motion === "seated" ? "ตัวละครนั่งอยู่บนเก้าอี้ตัวอย่าง" : "คลิกบนพื้นเพื่อเริ่มเดิน หรือใช้ปุ่มเพื่อตรวจทิศตัวละคร"}
          />
          <StatusCard label="รอบถัดไป" value="หลบสิ่งกีดขวาง" detail="เพิ่มหลังการเดินหาจุดหมายทำงาน" />
        </aside>
      </div>
    </main>
  );
}

const FACING_OPTIONS: ReadonlyArray<{ value: CharacterFacing; label: string }> = [
  { value: "front", label: "หันหน้า" },
  { value: "right", label: "หันขวา" },
  { value: "back", label: "หันหลัง" },
  { value: "left", label: "หันซ้าย" },
];

function StatusCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[16px] border border-line bg-white px-4 py-3">
      <p className="m-0 text-xs font-medium text-secondary">{label}</p>
      <p className="m-0 mt-1 text-sm font-semibold text-ink">{value}</p>
      <p className="m-0 mt-1 text-xs text-secondary">{detail}</p>
    </div>
  );
}
