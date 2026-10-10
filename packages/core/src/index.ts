/**
 * @bosskantaponguttarawichien-boop/wang-raan-core (feat-037)
 * ไม่มีโค้ดของตัวเอง — re-export จาก src/core ของหน้าเว็บ เพื่อให้กฎมีชุดเดียว (แก้ที่ src/core แล้ว build ใหม่)
 * export เฉพาะส่วนที่ Backend ต้องใช้: โมเดลผัง, Validation Engine, Zod schemas และ schema ฟอร์มติดต่อ
 */
export * from "../../../src/core/layout";
export * from "../../../src/core/validation";
export { ContactSchema, type ContactInput } from "../../../src/lib/contact-schema";
