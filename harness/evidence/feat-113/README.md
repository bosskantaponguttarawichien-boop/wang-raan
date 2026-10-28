# feat-113 — Core semantic metadata

Base: `c66611d`, `codex/animation-foundation`; 2026-10-29 ICT.

- `Simulation.presentationSnapshot({runId,layoutRevision,sequence})` returns a fresh contract-v1 full snapshot. Call `trackPaths()` before playback to include physical staff phase plans; late activation reconstructs active plans from stored task start/total.
- Every render member has an explicit table/chair/cycle binding. Seated buffer positions use their assigned chair centres, and `drainPaths()` emits the same member ids with free-grid junctions for sitting/standing. Repeated drains without movement remain empty.
- Task ids, cycle counters, food selection and archived departed parties are observational. No simulation RNG calls, service formulas, queue ordering or metrics were changed. Archives are bounded to one departed party and at most four task kinds per table.
- Staff plans separate kitchen pickup, carrying, put-down, return, and wiping. Walking uses the physical 1.2m/s where the task travel budget permits; real app defaults provide the interaction time. Very short synthetic task budgets remain capped at the task duration; feat-115 must cap displayed movement rather than speeding up to catch a target.
- Placement and business delivery completion are distinct. Already placed dishes remain if the diner cancels; no late food is produced for cancelled work. Used dishes/stains survive departure and the return walk after wiping, and clear only at authoritative cleaning completion. New cycles cannot inherit old dishes/tasks.
- Counter-order keeps its existing business flow: food is placed when seated, and surfaces reset when no active diners remain, without inventing table-service cleaning tasks.

Verification: `presentation-snapshot.test.ts` covers parties1/2/4, identities/positions, full lifecycle, late tracking/counter-order, repeatable food and per-step metrics/buffer parity (1,800 steps). `staff-visual.test.ts` checks all20 staff homes on both cafe tables for 1.2m/s and pickup/put-down within unchanged total time.

Full workspace tests at this checkpoint: 87 files / 1,023 tests passed (includes concurrent food-lane tests). Lint and typecheck exit0; lint retains the pre-existing `_initial` warning. Source boundary scan/Harness validated. Other agents' food/clip assets are outside this task and must not be staged by Agent1.
