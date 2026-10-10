"use client";

/**
 * Room & Entrance Settings (architecture.md §5.4 ข้อ 1) — React Hook Form + Zod
 * ช่องกรอกเป็น uncontrolled: การพิมพ์ไม่แตะ store จึงไม่ re-render Canvas จนกว่าจะกด "นำไปใช้"
 */
import { zodResolver } from "@hookform/resolvers/zod";
import * as React from "react";
import { useForm } from "react-hook-form";
import { ENTRANCE_DEFAULT_WIDTH, type Wall } from "@/core/layout";
import { Button } from "@/components/ui";
import { WALL_LABEL } from "@/components/editor-2d/stage-math";
import { layoutStore, useLayoutStore } from "@/store/use-layout-store";
import { Field, inputClass } from "./field";
import { RoomSettingsSchema, type RoomSettingsValues } from "./schemas";

function currentValues(): RoomSettingsValues {
  const { layout } = layoutStore.getState();
  return {
    width: layout.width,
    depth: layout.depth,
    entranceWall: layout.entrance?.wall ?? "south",
    entrancePosition: layout.entrance?.position ?? 0,
    entranceWidth: layout.entrance?.width ?? ENTRANCE_DEFAULT_WIDTH,
  };
}

/** สร้างฟอร์มใหม่เมื่อค่าใน store เปลี่ยนจากที่อื่น (ลากทางเข้า, Undo) เพื่อให้ค่าเริ่มต้นตรงกับผังจริง */
export function RoomSettingsForm() {
  const signature = useLayoutStore(
    (s) => `${s.layout.width}|${s.layout.depth}|${s.layout.entrance?.wall}|${s.layout.entrance?.position}|${s.layout.entrance?.width}`,
  );
  return <RoomSettingsFormInner key={signature} />;
}

function RoomSettingsFormInner() {
  const formId = React.useId();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<RoomSettingsValues>({
    resolver: zodResolver(RoomSettingsSchema),
    defaultValues: currentValues(),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const onSubmit = (values: RoomSettingsValues) => {
    const store = layoutStore.getState();
    // ขนาดร้าน + ทางเข้า = Undo ขั้นเดียว
    store.beginInteraction();
    store.setRoomDimensions(values.width, values.depth);
    // แตะทางเข้าเฉพาะเมื่อผู้ใช้แก้ช่องทางเข้า — ผังที่ยังไม่มีทางเข้าต้องไม่ได้ทางเข้าโผล่มาเองตอนปรับขนาดร้าน
    if (dirtyFields.entranceWall || dirtyFields.entrancePosition || dirtyFields.entranceWidth) {
      store.setEntrance({ wall: values.entranceWall, position: values.entrancePosition, width: values.entranceWidth });
    }
    store.endInteraction();
  };

  const numberProps = { type: "number", inputMode: "decimal" as const, step: 0.25, className: inputClass };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="ขนาดร้านและทางเข้า" data-testid="room-settings-form">
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <Field id={`${formId}-w`} label="กว้าง (ม.)" error={errors.width?.message}>
          {(aria) => <input {...aria} {...numberProps} min={2} max={30} {...register("width", { valueAsNumber: true })} />}
        </Field>
        <Field id={`${formId}-d`} label="ลึก (ม.)" error={errors.depth?.message}>
          {(aria) => <input {...aria} {...numberProps} min={2} max={30} {...register("depth", { valueAsNumber: true })} />}
        </Field>
        <Field id={`${formId}-wall`} label="ผนังทางเข้า" className="col-span-2" error={errors.entranceWall?.message}>
          {(aria) => (
            <select {...aria} className={inputClass} {...register("entranceWall")}>
              {(Object.keys(WALL_LABEL) as Wall[]).map((wall) => (
                <option key={wall} value={wall}>
                  {WALL_LABEL[wall]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id={`${formId}-pos`} label="ระยะจากมุม (ม.)" error={errors.entrancePosition?.message}>
          {(aria) => <input {...aria} {...numberProps} min={0} {...register("entrancePosition", { valueAsNumber: true })} />}
        </Field>
        <Field id={`${formId}-ew`} label="ประตูกว้าง (ม.)" error={errors.entranceWidth?.message}>
          {(aria) => <input {...aria} {...numberProps} min={0.6} max={3} step={0.05} {...register("entranceWidth", { valueAsNumber: true })} />}
        </Field>
      </div>
      <Button type="submit" variant="secondary" size="sm" className="mt-3 w-full" disabled={!isDirty}>
        นำไปใช้
      </Button>
      <p className="mb-0 mt-2 text-[12px] leading-[1.75] text-secondary">ร้าน 2–30 ม. · ลากป้าย “เข้า” ไปตามขอบร้าน หรือโฟกัสแล้วใช้ลูกศร</p>
    </form>
  );
}
