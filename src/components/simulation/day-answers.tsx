"use client";

/**
 * การ์ดคำตอบสำหรับเจ้าของร้าน (feat-095) — จากผลวิเคราะห์ทั้งวัน (core analyzeDay)
 * 1. ต้องจ้างพนักงานกี่คน  2. อาหารต้องออกภายในกี่นาที  3. นั่งกินนานแบบนี้ โต๊ะพอไหม
 * ข้อความเป็นภาษาคน ไม่ใช้ศัพท์เทคนิค; ตัวเลขทุกตัวปัดให้อ่านง่าย
 */
import type { DayAnalysis, StaffOption } from "@/core/simulation";
import { ANALYSIS_SEEDS, GOOD_TOO_LONG_RATE, MAX_STAFF_SEARCH } from "@/core/simulation";
import { cn } from "@/lib/cn";
import { formatClock, formatNumber } from "@/lib/day-config";

const percent = (rate: number) => `${Math.round(rate * 100)}%`;
const minutes = (value: number) => `${formatNumber(value)} นาที`;
const people = (value: number) => Math.round(value).toLocaleString("th-TH");

function Question({ title, answer, tone = "neutral", children, testId }: {
  title: string;
  answer: string;
  tone?: "neutral" | "good" | "bad";
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className="border-t border-line pt-2.5 first:border-t-0 first:pt-0" data-testid={testId}>
      <h4 className="m-0 text-[11.5px] font-medium leading-[1.6] text-secondary-strong">{title}</h4>
      <p
        className={cn(
          "m-0 text-[17px] font-semibold leading-[1.5]",
          tone === "good" && "text-[#065f46]",
          tone === "bad" && "text-[#92400e]",
          tone === "neutral" && "text-ink",
        )}
      >
        {answer}
      </p>
      <div className="mt-0.5 text-[11.5px] leading-[1.75] text-secondary-strong">{children}</div>
    </section>
  );
}

/** แถบเทียบจำนวนคน −1 / แนะนำ / +1 */
function Compare({ options, label }: { options: StaffOption[]; label: (o: StaffOption) => string }) {
  if (options.length === 0) return null;
  return (
    <ul className="m-0 mt-1.5 grid list-none gap-1 p-0" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <li
          key={`${o.frontStaff}-${o.cooks}`}
          className={cn(
            "min-w-0 rounded-[6px] px-1 py-1 text-center text-[11px] leading-[1.5]",
            o.good ? "bg-[#f0fdf4] text-[#065f46]" : "bg-[#fffbeb] text-[#92400e]",
          )}
        >
          <span className="block font-semibold">{label(o)}</span>
          <span className="block">{o.outcome.fed > 0 ? `รอ ${minutes(o.outcome.avgFoodWaitMinutes)}` : "ไม่มีคนได้อาหาร"}</span>
          <span className="block">ได้อาหาร {people(o.outcome.fed)} คน</span>
          <span className="block">กลับก่อนกิน {people(o.outcome.noSeat + o.outcome.abandoned)} คน</span>
        </li>
      ))}
    </ul>
  );
}

export function DayAnswers({ analysis, openMinute }: { analysis: DayAnalysis; openMinute: number }) {
  const { staffing, cookTime, seating, current, plan } = analysis;
  const rec = staffing.recommended;
  const recommendedOutcome = rec ? staffing.cookOptions.find((option) => option.cooks === rec.cooks)?.outcome : undefined;
  const peak = plan.peak;
  const allowed = percent(GOOD_TOO_LONG_RATE);

  return (
    <div className="mb-4 rounded-[12px] border border-line bg-white p-3" data-testid="day-answers">
      <div className="mb-2.5">
        <b className="block text-[13px] font-semibold leading-[1.5] text-ink">คำตอบสำหรับร้านคุณ</b>
        <span className="block text-[11px] text-secondary-strong">
          ลูกค้าทั้งวันราว {people(current.arrived)} คน · {analysis.seats} ที่นั่ง
          {peak && ` · คนเยอะ ${plan.peaks.map((window) => `${formatClock(openMinute + window.startSeconds / 60)}–${formatClock(openMinute + window.endSeconds / 60)}`).join(", ")}`}
        </span>
        <p className="m-0 mt-1 text-[11px] leading-[1.7] text-secondary-strong">
          จากค่าที่ตั้งไว้: ได้อาหารประมาณ {people(current.fed)} คน · กลับเพราะไม่มีโต๊ะ {people(current.noSeat)} คน
          {current.balked > 0 && ` (รวม ${people(current.balked)} คนที่กลับทันทีเมื่อเห็นคิว)`}
          {` · กลับเพราะรออาหาร ${people(current.abandoned)} คน`}
          {current.wastedDishes > 0 && ` · อาหารที่ทำแล้วต้องทิ้งเฉลี่ย ${formatNumber(current.wastedDishes)} จาน`}
          {current.unfinished > 0 && ` · ยังไม่เสร็จ ${people(current.unfinished)} คน`}
        </p>
        {(current.noSuitableTable > 0 || current.tableWaitTimeout > 0) && <p className="m-0 text-[11px] leading-[1.7] text-secondary-strong">
          {current.noSuitableTable > 0 && `ไม่มีโต๊ะรองรับขนาดกลุ่ม ${people(current.noSuitableTable)} คน`}
          {current.noSuitableTable > 0 && current.tableWaitTimeout > 0 && " · "}
          {current.tableWaitTimeout > 0 && `รอโต๊ะไม่ไหว ${people(current.tableWaitTimeout)} คน`}
          {" (แต่ละตัวเลขปัดเศษจากค่าเฉลี่ย)"}
        </p>}
        <p className="m-0 mt-1 text-[11px] leading-[1.7] text-secondary-strong">
          ทดลอง {ANALYSIS_SEEDS.length} วัน: ลูกค้าเข้า {people(current.ranges.arrived[0])}–{people(current.ranges.arrived[1])} คน · กลับเพราะไม่มีโต๊ะ {people(current.ranges.noSeat[0])}–{people(current.ranges.noSeat[1])} คน
          {current.ranges.avgFoodWaitMinutes && ` · คนที่ได้อาหารรอเฉลี่ย ${formatNumber(current.ranges.avgFoodWaitMinutes[0])}–${formatNumber(current.ranges.avgFoodWaitMinutes[1])} นาที`}
          {" · เป็นช่วงผลจำลอง ไม่ใช่การรับประกันผลจริง"}
        </p>
      </div>

      <div className="space-y-2.5">
        <Question
          testId="answer-staff"
          title="ต้องจ้างพนักงานกี่คน"
          answer={rec ? `หน้าร้าน ${rec.frontStaff} · พ่อครัว ${rec.cooks}` : `เกิน ${MAX_STAFF_SEARCH} คนก็ยังไม่พอ`}
          tone={rec ? "good" : "bad"}
        >
          {rec ? (
            <>
              <p className="m-0">จำนวนที่มีลูกค้ารอเกินเวลาที่ยอมรับได้ไม่เกิน {allowed} โดยหาจำนวนพ่อครัวก่อน · ลูกค้าที่กลับเพราะไม่มีโต๊ะแสดงแยกด้านบน</p>
              {staffing.cashiers > 0 && <p className="m-0">จำนวนหน้าร้านนี้รวมพนักงานประจำรับเงิน {staffing.cashiers} คน</p>}
              {recommendedOutcome && <p className="m-0">หากใช้จำนวนพนักงานนี้: ได้อาหารประมาณ {people(recommendedOutcome.fed)} คน · กลับเพราะไม่มีโต๊ะ {people(recommendedOutcome.noSeat)} คน · กลับเพราะรออาหาร {people(recommendedOutcome.abandoned)} คน</p>}
              <Compare options={staffing.cookOptions} label={(o) => `พ่อครัว ${o.cooks}`} />
              {staffing.frontOptions.length > 1 && <Compare options={staffing.frontOptions} label={(o) => `หน้าร้าน ${o.frontStaff}`} />}
            </>
          ) : (
            <p className="m-0">ลูกค้าเยอะเกินกว่าที่ร้านขนาดนี้จะรับไหว ลองลดจำนวนลูกค้าต่อวัน หรือทำอาหารให้เร็วขึ้น</p>
          )}
        </Question>

        <Question
          testId="answer-cook-time"
          title="อาหารต้องออกภายในกี่นาที"
          answer={cookTime.maxMinutesPerDish !== null ? `ไม่เกิน ${minutes(cookTime.maxMinutesPerDish)} ต่อจาน` : "พนักงานที่ตั้งไว้ยังไม่พอ"}
          tone={cookTime.maxMinutesPerDish !== null && cookTime.currentMinutesPerDish <= cookTime.maxMinutesPerDish ? "good" : "bad"}
        >
          {cookTime.maxMinutesPerDish !== null ? (
            <p className="m-0">
              เพื่อให้ลูกค้ารอเกินเวลาที่ยอมรับได้ไม่เกิน {allowed} · ตอนนี้ตั้งไว้ {minutes(cookTime.currentMinutesPerDish)}
              {cookTime.currentMinutesPerDish > cookTime.maxMinutesPerDish
                ? ` มีลูกค้ารอนานเกิน ${percent(current.tooLongRate)}`
                : ` รออาหารเฉลี่ย ${minutes(current.avgFoodWaitMinutes)}`}
            </p>
          ) : (
            <p className="m-0">
              ทำเร็วแค่ไหนก็ยังมีลูกค้ารอนานเกิน {percent(current.tooLongRate)} เพราะพนักงานรับออร์เดอร์และเสิร์ฟไม่ทัน — เพิ่มพนักงานตามข้อแรกก่อน
            </p>
          )}
        </Question>

        <Question
          testId="answer-seats"
          title="นั่งกินนานแบบนี้ โต๊ะพอไหม"
          answer={seating.enough ? "พอ" : "ไม่พอ"}
          tone={seating.enough ? "good" : "bad"}
        >
          <p className="m-0">{seating.basedOn === "recommended" ? "ประเมินเมื่อใช้จำนวนพนักงานที่แนะนำ" : "ประเมินจากจำนวนพนักงานที่ตั้งไว้"}</p>
          <p className="m-0">
            อยู่ในร้านเฉลี่ย {minutes(seating.avgVisitMinutes)} ร้านนี้รับได้ราว {formatNumber(seating.capacityPerHour)} คน/ชม. · ช่วงคนเยอะเข้า{" "}
            {formatNumber(seating.busiestCustomersPerHour)} คน/ชม.
            {seating.maxEntranceQueue >= 1 && ` · คิวรอหน้าเข้าสูงสุด ${people(seating.maxEntranceQueue)} คน`}
          </p>
          {!seating.enough && <p className="m-0">ลองเพิ่มโต๊ะ หรือปรับการจัดโต๊ะให้เหมาะกับกลุ่มลูกค้า</p>}
        </Question>
      </div>
    </div>
  );
}
