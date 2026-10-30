# Animation foundation module map — feat-102

วันที่: 2026-10-29 (Asia/Bangkok) · contract: `animation-contract-v1.md` · ฐาน101: `ad1d3b3`

## สถานะและขอบเขต

Foundation101/102พร้อมใช้งาน ยังไม่มีอาหาร5แบบ คลิปถือ/กิน/เช็ด/เลื่อนเก้าอี้ใหม่ หรือระบบแดดตามเวลา ฟีเจอร์ใหม่ทั้งหมดต้องทำตามdependencyของ103–123 ไม่เริ่มจากการแก้ไฟล์กลาง

ใช้integration branch `codex/animation-foundation` ที่commit102แล้วเป็นฐาน worktree ทั้ง3คน (ดูhashในผลส่งมอบหรือ `git log -1 codex/animation-foundation`) ฐานนี้รวมการแก้เวลา1×/นาฬิกาวินาทีเดิมและแก้baseline fixtureแล้ว อย่าใช้mainเดิมหรือ101อย่างเดียว

## 1. Scene composition

```text
IsometricView — dynamic import / ssr:false (ของเดิม)
  ThreeView — renderer / กล้อง / legacyคน / legacyเฟอร์นิเจอร์ (shared owner: integrator)
    runtime/legacy-lighting.ts       createLegacyLighting / fitKeyLight
    runtime/legacy-serving-props.ts  createLegacyServingProps
    runtime/scene-runtime.ts         createSceneRuntime(context, factories)
      Feature:food                   no-op
      Feature:table-service          no-op
      Feature:staff-actions          no-op
      Feature:customer-actions       no-op
      Feature:seating                no-op
      Feature:lighting               no-op
```

`runtime/contracts.ts` เป็นสัญญาtypedที่101freezeแล้ว; moduleimportไม่มีscene/renderer/geometryเกิดเอง การสร้างจริงอยู่ในfactoryหรือcomponenteffectหลังWebGLพร้อมเท่านั้น

### Host lifecycle

| จังหวะ | การเรียก |
|---|---|
| mountWebGL | สร้างhostพร้อมrootเฉพาะfeature6กลุ่ม; factoriesที่ไม่ส่งมาใช้no-op |
| เปลี่ยนlayoutobject | `syncLayout(layout)` ครั้งเดียวต่อreferenceใหม่; หมุนกล้องไม่syncซ้ำ |
| แต่ละrenderframe | `update(SceneFrame)` ในลำดับfood→table→staff→customer→seating→lighting |
| STOP/ออกโหมดจำลอง | `reset()` คืนtransientstateของfeature |
| unmountWebGL | disposefeatureย้อนลำดับครั้งเดียว ถอดทุกroot; legacycleanupอยู่finallyแยกต่างหาก |

ใน102 `SceneFrame.presentation` ยังไม่มี, `realDeltaSeconds` เป็นเวลาจริงที่ยังไม่clampตอนrunningและเป็น0ตอนpause/non-sim; legacyanimationยังใช้deltaที่clampตามเดิม การแก้เดินและlegacydeltaอยู่115/122 ไม่แฝงในrefactorนี้ `playbackRate`อ่านจากsimulationstoreแบบread-only ไม่เพิ่มsubscriptionหรือเปลี่ยนstate

context: scene/camera/getLayout/getQuality/invalidate/invalidateShadows/root แต่ละfeatureจัดการgeometry/material/subscriptionของตัวเอง ไม่disposemeshของlegacyหรือfeatureอื่น hostไม่เดาว่าทรัพยากรของfeatureแชร์กับใคร หากfactoryล้มต้องคืนpartialresourcesของตนก่อนthrow; hostคืนfeatureก่อนหน้าและถอดrootที่ล้มให้

### จุดรวมที่122เป็นเจ้าของ

สร้างfactoryในdirectoryงานของตนและส่งให้integrator ตัวอย่างนี้เป็นรูปแบบการเชื่อม ไม่ใช่โค้ดที่ต้องแปะจากทุกbranch:

```ts
const runtime = createSceneRuntime(context, {
  "table-service": createTableService,
  "staff-actions": createStaffActions,
  "customer-actions": createCustomerActions,
  seating: createSeating,
  lighting: createLighting,
});
```

factoryใช้APIตามcontracts.tsเพื่อรับroot/layout/quality/context; หากต้องมีserviceportข้ามfeature ให้coordinatorกำหนดtypedportก่อนmerge ไม่แก้privateimplementationของlaneอื่น และไม่ส่งTHREEเข้าWorker/Core/BFF

## 2. Character model generation

| ไฟล์ | หน้าที่ | ผู้แก้หลัง102 |
|---|---|---|
| `scripts/create-cafe-customer-model.mjs` | CLI/options/providerloading และmain guard | integrator122เท่านั้น |
| `scripts/model-generation/rig.mjs` | freshskeleton/skin/partcolours/staffcapจากBlender sourceเดิม | foundation/integrator |
| `scripts/model-generation/base-clips.mjs` | Idle/Walk/Sit/Workเดิมทุกtrack | foundation/integrator |
| `scripts/model-generation/build.mjs` | providercontext/clipvalidation/buildหนึ่งroleหนึ่งvariant/resourcecleanup | foundation/integrator |
| `scripts/model-generation/export.mjs` | GLTFExporter+meshoptcompressionและเขียนหนึ่งoutput | foundation/integrator |
| `scripts/character-clips/<lane>.mjs` | providerคลิปใหม่;ยังไม่มีใน102 |109/110/111/112ตามscope |

### CLI ที่รองรับ

```text
node scripts/create-cafe-customer-model.mjs --role customer --output-dir <temporary-dir>
node scripts/create-cafe-customer-model.mjs --role staff --lite --output-dir <temporary-dir>
node scripts/create-cafe-customer-model.mjs --staff --lite --output-dir <temporary-dir>
node scripts/create-cafe-customer-model.mjs --role staff --output-dir <temporary-dir> --clips scripts/character-clips/staff-carry.mjs --clips scripts/character-clips/staff-clean.mjs
```

ทุกคำสั่งสร้างเพียง `cafe-<role>[-lite].glb` หนึ่งไฟล์ ไม่สร้างrole/variantอื่น CLIเดิมไม่มีoutput-dirยังไปpublic/assets/modelsตามเดิม; งานคลิป109–112 **ต้อง** ใช้temporaryoutput ห้ามเขียนassetกลาง ส่วน117exportstaffสองvariantและ118exportcustomerสองvariantตามowner

`--role`รับcustomer/staffเท่านั้น; `--staff --role customer`/unknownflag/missingvalueต้องfailก่อนexport Pathsของprovider/outputอ้างcwdเมื่อเป็นrelative ไม่มีshellต่อคำสั่งจากpath

### Provider example (เฉพาะรูปแบบ ไม่ใช่คลิปที่สร้างเสร็จ)

```js
// Optional role guard; omit only when the provider genuinely supports both roles.
export const roles = ["staff"];
export default function createClips({ role, lite, model, bones, baseClips }) {
  // Build real THREE.AnimationClip instances. baseClips are clones of legacy clips.
  // role/lite select geometry-independent motion; bones is a fresh map to the rig.
  return { clips, markers: { PickUp: [{ name: "hand-contact", time: 0.5 }] } };
}
```

ดูcontext/resultตามcontractv1 Providerimportต้องไม่writeFile/buildเอง `runCharacterBuild`รับmoduledefaultfunctionและoptionalrolesguard; programmatic `buildCharacter`รับproviderfunctionsโดยตรงและต้องส่งoutputDirectoryชัดเจน

validateก่อนเขียน: clipต้องมีชื่อไม่ซ้ำกับbase/คลิปอื่น durationfinite>0 tracktargetมีอยู่จริง markersอ้างclipที่มี time[0,1]และชื่อไม่ซ้ำต่อclip ผลmarkersเก็บในCafeMannequin.userData.animationMarkers ของGLB

ไม่เปลี่ยนattribute `_part`, skeleton/bindpose, Workของstaff, walkCycleDistance, quantizationpatternหรือcompression settingsของเดิม providerไม่ควรแก้model/bonesเดิมนอกจากเพิ่มpropanchorที่contractอนุญาต ไม่แก้Blender mesh sourceโดยไม่ตกลงownershipใหม่

## 3. เจ้าของงานสำหรับ3agent

| Agent | งานต่อจากฐาน102 | พื้นที่หลัก |
|---|---|---|
|1 ระบบ/รวมงาน |113→114→115 แล้ว122→123เมื่อทุกdependencyครบ |coremetadata/transport/pacers;sharedsceneตอน122 |
|2 อาหาร/โต๊ะ/แสง |103→104–108→116 และ120→121 |foodassets/catalogue/table-service/lighting |
|3 ตัวละคร |109–112 แล้ว117–119เมื่อdependenciesพร้อม |clipproviders/staff-actions/customer-actions/seating |

คน2/3ไม่แก้three-view/generatorentry/runtimecontractsกลาง แต่ส่งfactory/providerให้122รวม เมื่อdependenttaskต้องใช้commitของlaneอื่นให้coordinatorรวมขึ้นintegrationbaseและอัปเดตworktreeก่อนเริ่ม ไม่สร้างstubแทนdependencyที่ยังไม่done

Harnessกลุ่มกลางรวมทีละงานโดยcoordinator;งานstatusอื่น103–123ยังnot-startedทั้งหมด ไม่มีagentที่2/3ถูกเปิดในsessionนี้

## 4. หลักฐานตรวจรับ102

- `evidence/feat-102/model-equivalence.json`: GLBทั้ง4ชื่อเท่าpublicassetsทุกไบต์;ไม่มีpublicassetsเปลี่ยน Temporaryduplicatesลบหลังบันทึกhashแล้ว unitทดสอบสร้างซ้ำในOS temp
- `runtime/model-generation.test.ts`: importไม่มีexport/FileReader sideeffect,4role/variant byteequivalence,writeisolation,externalprovider/marker,roleconflict,duplicateclip/unknowntarget/badmarkerrejectก่อนwrite
- `runtime/scene-runtime.test.ts`: no-op6roots,layoutdedup/frame/reset,reversedispose/idempotency,factoryrollbackและcleanupthrowไม่ข้ามfeatureอื่น
- `evidence/feat-102/unit-tests.log`:80files/1,001testsผ่าน;lint/typecheckผ่าน lintexit0มีwarningเดิม1รายการ `_initial` ที่simulation-gate.test.tsx
- `evidence/feat-102/browser-after/`: Chrome156.0.8078.48, NVIDIA GTX1050Ti/ANGLE/D3D11,modelresponses200และerror0;ดูภาพก่อนที่101/browser-before
- `evidence/feat-102/visual-comparison.json`:canvas1032×844 ก่อน/หลังมีpixelต่างเกินthreshold15เพียง1pixel (staffWorkยังเป็นliveanimation) ฉาก/กล้อง/เงาคงเดิม
- `evidence/feat-102/flow-report.json` และsimulation-paused.png:2Dไม่โหลดmodel,หมุน4ด้าน,START→3D→PAUSE→RESUME→STOP,unmount/remount3รอบcanvas1ตัว,375pxreducedmotionSVGfallbackไม่มีhorizontaloverflow
- warningsThree.Clock/PCFSoftShadowMapมีอยู่ในภาพฐาน101แล้ว ไม่ได้ย้ายไปแก้APIที่เลิกใช้ในrefactorนี้;ไม่มีbrowsererrorsใหม่

ทดสอบUIใช้devserverเดิมlocalhost3000ของworkspace ไม่หยุดหรือแทนที่serverของผู้ใช้ ไม่มีBFF/database/APIcontractใหม่ในสองงานนี้
