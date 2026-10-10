"use client";

/**
 * Object Inspector (architecture.md §5.4 ข้อ 2) — แก้ตำแหน่ง/การหมุน (ทุกชิ้น) และขนาด (ครัว/เคาน์เตอร์)
 * โต๊ะ/เก้าอี้ย้ายและหมุนทั้งชุดตาม Core; การกด "นำไปใช้" ครั้งหนึ่ง = Undo หนึ่งขั้น
 */
import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm } from "react-hook-form";
import { OBJECT_MIN_SIZE, SIZE_STEP, footprint, snapToGrid, type LayoutObject, type Rotation } from "@/core/layout";
import { Button } from "@/components/ui";
import { objectLabel } from "@/components/editor-2d/stage-math";
import { layoutStore, selectSelectedObject, useLayoutStore } from "@/store/use-layout-store";
import { Field, inputClass } from "./field";
import { ObjectInspectorSchema, type ObjectInspectorValues } from "./schemas";

const actions = () => layoutStore.getState();

export function ObjectInspector() {
  const picked = useLayoutStore(selectSelectedObject);
  // เก้าอี้ไม่ใช่วัตถุอิสระ (และพิกัดไม่ลงกริดเพราะสอดใต้โต๊ะ) → แก้ที่โต๊ะแม่ของชุด
  const selected = useLayoutStore((s) =>
    picked?.type === "chair" ? (s.layout.objects.find((o) => o.id === picked.tableId) ?? picked) : picked,
  );
  if (!selected) {
    return <p className="m-0 text-[13px] leading-[1.75] text-secondary">เลือกชิ้นงานบนผังเพื่อแก้ตำแหน่ง ขนาด หมุน หรือลบ</p>;
  }
  // key: สร้างฟอร์มใหม่เมื่อชิ้นงานถูกย้าย/หมุน/ปรับขนาดจากที่อื่น
  const key = `${selected.id}|${selected.x}|${selected.y}|${selected.rotation}|${selected.width}|${selected.depth}`;
  return <InspectorForm key={key} obj={selected} />;
}

function InspectorForm({ obj }: { obj: LayoutObject }) {
  const formId = React.useId();
  const resizable = obj.type === "kitchen" || obj.type === "counter";
  const isSet = obj.type === "table" || obj.type === "chair";
  const fp = footprint(obj);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<ObjectInspectorValues>({
    resolver: zodResolver(ObjectInspectorSchema),
    // ค่าเริ่มต้นลงกริดเสมอ: ชิ้นที่พิกัด/ขนาดไม่ลงกริด (เช่น ข้อมูลเก่า) ยังแก้ช่องอื่นได้โดยช่องที่ไม่ได้แตะไม่ทำให้ฟอร์มไม่ผ่าน
    defaultValues: {
      x: snapToGrid(obj.x),
      y: snapToGrid(obj.y),
      rotation: String(obj.rotation) as ObjectInspectorValues["rotation"],
      width: Math.max(OBJECT_MIN_SIZE, snapToGrid(obj.width, SIZE_STEP)),
      depth: Math.max(OBJECT_MIN_SIZE, snapToGrid(obj.depth, SIZE_STEP)),
    },
  });

  const onSubmit = (values: ObjectInspectorValues) => {
    const store = actions();
    store.beginInteraction();
    const rotation = Number(values.rotation) as Rotation;
    if (rotation !== obj.rotation) store.rotateObject(obj.id, rotation - obj.rotation);
    if (resizable && (dirtyFields.width || dirtyFields.depth)) store.resizeObject(obj.id, values.width, values.depth);
    // ย้ายเฉพาะเมื่อผู้ใช้แก้ x/y — การหมุนอย่างเดียวต้องหมุนรอบจุดศูนย์กลางตาม Core ไม่ใช่กลับไปมุมเดิม
    if (dirtyFields.x || dirtyFields.y) {
      const now = store.layout.objects.find((o) => o.id === obj.id) ?? obj;
      store.updateObjectPosition(obj.id, dirtyFields.x ? values.x : now.x, dirtyFields.y ? values.y : now.y);
    }
    store.endInteraction();
  };

  const numberProps = { type: "number", inputMode: "decimal" as const, className: inputClass };

  return (
    <div data-testid="object-inspector">
      <p className="m-0 text-[16px] font-semibold leading-[1.5]">{objectLabel(obj)}</p>
      <p className="m-0 mb-3 text-[12px] leading-[1.75] text-secondary">
        พื้นที่บนผัง {fp.width.toFixed(2)} × {fp.depth.toFixed(2)} ม.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label={`แก้ไข${objectLabel(obj)}`}>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
          <Field id={`${formId}-x`} label="ตำแหน่ง x (ม.)" error={errors.x?.message}>
            {(aria) => <input {...aria} {...numberProps} step={0.25} {...register("x", { valueAsNumber: true })} />}
          </Field>
          <Field id={`${formId}-y`} label="ตำแหน่ง y (ม.)" error={errors.y?.message}>
            {(aria) => <input {...aria} {...numberProps} step={0.25} {...register("y", { valueAsNumber: true })} />}
          </Field>
          {resizable && (
            <>
              <Field id={`${formId}-w`} label="กว้าง (ม.)" error={errors.width?.message}>
                {(aria) => <input {...aria} {...numberProps} step={0.05} min={0.3} {...register("width", { valueAsNumber: true })} />}
              </Field>
              <Field id={`${formId}-d`} label="ลึก (ม.)" error={errors.depth?.message}>
                {(aria) => <input {...aria} {...numberProps} step={0.05} min={0.3} {...register("depth", { valueAsNumber: true })} />}
              </Field>
            </>
          )}
          <Field id={`${formId}-r`} label="หมุน" className="col-span-2" error={errors.rotation?.message}>
            {(aria) => (
              <select {...aria} className={inputClass} {...register("rotation")}>
                {["0", "90", "180", "270"].map((r) => (
                  <option key={r} value={r}>
                    {r}°
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Button type="submit" variant="secondary" size="sm" className="mt-3 w-full" disabled={!isDirty}>
          นำไปใช้
        </Button>
      </form>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={() => actions().rotateObject(obj.id, -90)}>
          ↺ 90°
        </Button>
        <Button variant="secondary" size="sm" onClick={() => actions().rotateObject(obj.id, 90)}>
          ↻ 90°
        </Button>
        <Button variant="danger" size="sm" className="col-span-2" onClick={() => actions().deleteObject(obj.id)}>
          × ลบ{isSet ? "ทั้งชุดโต๊ะ" : "ชิ้นงานนี้"}
        </Button>
      </div>
      {isSet && <p className="mb-0 mt-3 text-[12px] leading-[1.75] text-secondary">ย้าย หมุน และลบ ทำกับโต๊ะและเก้าอี้ทั้งชุด · ขนาดโต๊ะใช้ตามชุดที่เลือก</p>}
    </div>
  );
}
