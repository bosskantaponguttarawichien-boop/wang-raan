import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/**
 * GLTFLoader สำหรับไฟล์ตัวละคร — ไฟล์บีบด้วย EXT_meshopt_compression (scripts/create-cafe-customer-model.mjs) ต้องมีตัวถอดรหัส
 * แยกไฟล์จาก character-models.ts เพื่อไม่ให้หน้าที่ใช้แค่ชื่อ/คำอธิบายตัวละครดึง Three.js เข้า bundle หลัก
 */
export function createCharacterLoader() {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}
