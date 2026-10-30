# Cloud handoff — restaurant animation integration

Updated 2026-10-29, Asia/Bangkok. User chose **wait for Cloud**; do not implement the remaining features in the local chat.

## Repository and starting point

- Repository: `bosskantaponguttarawichien-boop/wang-raan`.
- Branch: `codex/animation-foundation`. Latest implementation commit verified locally: `6e0c527` (lighting120–121); use the latest branch tip, including these handoff notes.
- Publishing these notes was attempted, but Git push failed because GitHub authentication was not completed (`could not read Username`). The handoff commit remains local; no successful upload is claimed. Authenticate and push the branch, or paste these instructions into the Cloud task. The cached origin branch still points to6e0c527.
- Read `AGENTS.md`, `PRD.md`, `architecture.md`, `design-system.md`, `SKILL.md`, Harness state/progress/session handoff, `restaurant-animation-plan.md`, `animation-contract-v1.md`, and `animation-module-map.md` before editing. Run startup checks in the Cloud workspace. Do not reuse Windows absolute paths from evidence scripts without adapting them.
- Local pre-handoff verification: **100 test files / 1,117 tests passed**, whole-workspace typecheck passed. The previous clip-lane `_part`/ArrayBuffer failures are resolved in the current branch. Existing jsdom canvas warnings are not test failures. Local Bash startup is unavailable/broken (`dirname` lookup / Windows launcher error); rerun `harness/init.sh` in Cloud rather than claiming the local shell check succeeded.

## Authorised work and order

1. Review received food/table/clip/lighting work and interfaces. Preserve lane ownership and complete one feature at a time.
2. `feat-117`: dependencies109/111/114 are done. Combine staff-carry + staff-clean providers; export only staff full/lite GLBs; implement staff actions/props from semantic phases and service-cycle identity.
3. `feat-118`: dependencies110/112/114 are done. Combine Eat + seating providers; export only customer full/lite GLBs; implement customer action/pose API. Waiting for food must not play Eat.
4. `feat-119`: dependencies112/115 are done. Implement seating/chair transitions using the shared timing API and explicit chair bindings; preserve layout/history/validation geometry.
5. `feat-122`: begin only after115/116/117/118/119/121 pass. Sole writer for shared scene/generator registration files. Connect food, table service, staff/customer actions, seating and lighting; correct render delta handling, preserve lazy loading/2D/SVG/reduced-motion/print fallbacks, and update relevant documentation.
6. `feat-123`: end-to-end lifecycle and visual/timing/lighting/performance QA. Verify pickup → carry → put-down → eating → stains → wiping → clean, parties1/2/4, cancellation/new cycles, pause/stop/restart/view switching, all rates, four camera directions, five foods, lighting times, responsive/a11y/resource cleanup. Require complete tests/lint/typecheck/Harness/boundary checks before marking done.

The integrator owns scene assembly and complete lifecycle checks. Defects in Agent2 food/table/lighting or Agent3 clips should go back to their owning lanes, with concrete reproduction and acceptance checks. Do not edit their private implementation concurrently. If those agents are separate local chats, their working files are not automatically shared with Cloud: use committed/pushed changes and an authorised communication path. Never claim another agent has received a defect without actually dispatching it through an available authorised tool.

## Known integration points

- **Table surface mismatch:** current rendered surface and table-service/clip implementations use **0.76m**. Contract v1 says tabletop0.74m (the box centre, not its top). Resolve/document this explicitly before binding props and interaction heights. See Agent3's latest session handoff; do not silently shift one lane by0.02m.
- Staff carry profile currently fixes palms for a root-attached tray. If117 attaches the tray to a hand bone, adjust the root/bone ownership together to avoid applying motion twice.
- PullChair releases after0.16m of grip travel. Match119 chair movement to provider grip markers/profile, including cramped-space fallback.
- SitDown/StandUp preserve the old Sit lower-body motion, which slides ankles forward about0.407m. Review and repair the integrated foot contact where required; a successful GLB load is not visual acceptance.
- Read actual provider exports: `STAFF_CARRY_PROFILE`, `CUSTOMER_EAT_PROFILE`, `EAT_UTENSILS`, `utensilGripOffset`, `eatPhaseOffset`, `STAFF_CLEAN_PROFILE`, `WIPE_FOOTPRINT`, `SEAT_MOTION_PROFILE`, and evidence109–112 contact metrics.
- `controller.current.presentation` is the validated v1 semantic snapshot; `current.timing` is a **TICK sample** with absolute simulationSeconds, already-scaled deltaSeconds, and playbackRate. Do not add its delta again every RAF. Respect paused state, run/sequence/cycle identity, and authoritative cleaning completion.
- Core/Worker/BFF must remain pure TS. Scene modules are presentation-only and lazy loaded. Lighting uses wall time independently of simulation playback.
- Cloud GPU/browser capability must be checked. feat123 requires the original reference GPU/performance baseline; software rendering alone cannot close that acceptance criterion. Use measured evidence from the reference machine/owning lane where Cloud cannot provide it; report remaining QA honestly.

## Usage budget and 05:00 continuation

- User's wording is interpreted as **stop when remaining usage reaches10%**, i.e. usedPercent>=90 for the primary5-hour account window. Initial reading at about02:00ICT: used70%, remaining30%; weekly used19%.
- Inspect the actual usage tool between meaningful work/checkpoints. This is an account-wide allowance shared with other work; do not promise an exact atomic10% cutoff. If already at/below10% remaining, do not start another implementation stage.
- Before stopping, commit/checkpoint safe work and update feature evidence/status, progress, session handoff, exact next steps, failures and branch/commit. Do not mark unfinished work done to meet the usage threshold. Do not burn unused quota after the authorised work is complete.
- Resume the remaining work at the next **05:00 Asia/Bangkok** after the quota checkpoint. For a stop before05:00 on29October2026, that means **2026-10-29 05:00ICT**; if the time has passed, use the next occurrence.
- **No automation has been created in the local chat.** User selected wait for Cloud. The currently exposed local thread scheduler must not be presented as a Cloud execution guarantee. In Cloud, check supported scheduling tools and save a real continuation schedule if supported; otherwise tell the user exactly what cannot be scheduled and what action is required. Do not invent an automation, assume persistence, or silently substitute a local job.
- A continuation must read this file and the latest Harness state, then resume only unfinished authorised tasks, honour gates/ownership and the usage cutoff, and stop scheduling once the requested work is complete.
