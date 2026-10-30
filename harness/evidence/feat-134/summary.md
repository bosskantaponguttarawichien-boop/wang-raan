# Evidence — feat-134: ก้อนความคิดและอิโมจิบอกสถานะตัวละครในระบบจำลอง

## สรุปผลการพัฒนาและการทดสอบ

- **Feature ID**: `feat-134`
- **สถานะ**: Done
- **ขอบเขตงาน**: แสดง Thought / Speech Emote Bubbles บอกสถานะและอารมณ์ของตัวละครในระบบจำลอง (ลูกค้า & พนักงาน)

### 1. สถานะและการแสดงผล (Customer & Staff Emotes)

| สถานะ | เงื่อนไข | Emoji | Severity | Badge/Text |
|---|---|:---:|:---:|:---:|
| **รอคิวปกติ** | หน้าร้าน < 5 นาที | 📱 | normal (ขาว) | - |
| **รอคิวนาน** | หน้าร้าน 5–10 นาที | ⏳ | warning (ส้ม) | `{mins}น.` |
| **รอคิววิกฤต** | หน้าร้าน > 10 นาที (ใกล้ walkout) | 💢 | critical (แดง) | `{mins}น.!` |
| **รอสั่งอาหาร** | นั่งโต๊ะรอพนักงาน | 🙋‍♂️ | normal / warning | - |
| **รออาหารปกติ** | นั่งโต๊ะ < 6 นาที | 🍽️ | normal | - |
| **รออาหารนาน** | นั่งโต๊ะ 6–12 นาที | ⏳ | warning (ส้ม) | `{mins}น.` |
| **รออาหารวิกฤต** | นั่งโต๊ะ > 12 นาที | 😤 | critical (แดง) | `{mins}น.!` |
| **ทานอาหาร** | ทานอาหาร | 😋 | normal | - |
| **เช็คบิล** | ทานเสร็จ พร้อมจ่ายเงิน | 💳 | normal | - |
| **พนักงานรับออร์เดอร์** | taking-order | 📝 | normal | - |
| **พนักงานเสิร์ฟ** | carrying meal | 🍲 | normal | - |
| **พนักงานเช็ดโต๊ะ** | wiping table | 🧹 | normal | - |

### 2. ผลการทดสอบ (Verification)

1. `src/core/simulation/presentation-snapshot.test.ts`:
   - 7/7 tests passed (ครอบคลุม resolveCustomerThought และ resolveStaffThought ทุกสถานะ)
2. `src/components/simulation/character-thought-bubble.test.tsx`:
   - 5/5 tests passed (accessible role, severity styling, hover tooltip)
3. `src/components/preview-3d/thought-overlay.test.ts`:
   - 2/2 tests passed (3D world projection to screen coordinates, node cleanup, dispose)
4. `src/components/simulation/iso-simulation-overlay.test.tsx`:
   - 9/9 tests passed (drawThoughtBubble canvas rendering)
5. `src/components/simulation/presentation-bridge.test.ts`:
   - 6/6 tests passed (Zod schema round-trip parsing)
6. Simulation suite:
   - 20 files / 182 tests passed 100%
7. Typecheck & Lint:
   - `npm run typecheck`: 0 errors
   - `npm run lint`: 0 errors
8. Architectural Boundaries:
   - `src/core/` เป็น Pure TS 100% ไม่มีการนำเข้า UI/React/DOM
