# feat-115 — canonical playback and normal walking speed

2026-10-29 ICT; integration base `6a37025` (feat-113/114).

- Controller consumes the versioned bridge and each customer's engine velocity, including departing members whose visual exit path is still active. Staff uses the shared 1.2m/s constant. Playback rate is applied once. Modern movement consumes simulation-time deltas rather than frame/arrival deltas; legacy workers retain wall-time fallback.
- WalkPacer and StaffPacer no longer accelerate to eliminate backlog. Forward collinear samples merge without removing corners. Each actor has at most 1,024 pending points; overflow pauses playback and requests a resync at an explicit resume boundary. No continuously growing replay/state history is introduced.
- Hidden documents automatically PAUSE the worker, preserving the displayed pose/route. Showing the document resumes only an automatically paused run; a manual pause remains paused. Resume resets the time anchor, so a 60-second pause adds no movement budget. Rapid hide/show and disposal/start cancellation cannot revive an obsolete controller run.
- An unexpected wall/normalised simulation gap above 0.5s freezes the last frame and pauses before consuming the gap. Explicit resume establishes a new snapshot boundary with zero delta; it does not sprint through missing history. This exceptional resync can reposition actors at the paused boundary. Normal tab pause/resume preserves the pose.
- Modern pickup already has an engine phase, so the legacy five-second kitchen detour is not inserted again. Semantic eating/work actions are gated on displayed seating/service-point arrival. Table/meal cycles remain authoritative.

## Consumer API for feat-122

`controller.current.presentation` is the latest validated full v1 snapshot, aligned with the displayed arrival state. `current.timing` contains `simulationSeconds` (absolute), `deltaSeconds` (simulation delta, already scaled), and `playbackRate`. It is a **TICK sample**, not a delta to add again on every render frame. Scene actions should sample absolute time, honour paused state, and apply playback only once. `previous/current.at` remain interpolation anchors.

ThreeView and its legacy animation-mixer delta clamp/cadence are owned by feat-122 and were not changed here. New Carry/Eat/Wipe/chair clips, food assets and lighting are not installed by feat-115.

## Verification

- Targeted movement/controller tests: **5 files / 65 tests passed**. Matrix covers 15/30/60/120 FPS × 1/2/5/10/30 playback, a 6m staff path in 5 simulation seconds, individual 1.0/1.4m/s customer paths (also measured through controller output including the entrance corner), 30-second clock ratios, arrival jitter, dt=0.35s, a 60-second hidden pause, manual pause, rapid visibility changes, long-gap freeze, queue bounds/corner preservation, modern pickup and disposal.
- Real Chrome 156 / localhost3000: **30.051 real seconds → 30.0512 simulation seconds**, metadata v1 delivered; 3D pause/resume/stop and injected document-visibility events pause/resume the real Worker without hidden-time accumulation. Browser errors: **0**. See `browser-report.json` and `simulation-paused.png`. Visibility injection tests the production event handler; the 60-second pause is exercised with a fake clock in unit tests.
- `verify-owned-snapshot.py` archives the tracked integration base, overlays exactly the Agent 1 feat-115 files, shares installed dependencies through a temporary junction, and runs the full npm test/typecheck/lint commands. The temporary checkout is removed safely afterward. See `owned-snapshot-report.json` and `owned-*.log` for the exact base/files/results. This verifies Agent 1's deliverable without importing concurrently edited, untracked food/clip work.
- Source boundaries: 53 non-test core/Worker/BFF files, zero UI/Three/DOM violations. Harness validation passes; no public GLB or shared ThreeView edits.

## Concurrent workspace limitation

The shared-workspace full test run recorded in `unit-tests.log` had **1 failed / 1,069 passed** because the concurrent, untracked `src/components/preview-3d/staff-actions/staff-carry-clips.test.ts` expected the `_part` loader attribute at line142. Shared-workspace typecheck also reports an ArrayBuffer/SharedArrayBuffer mismatch in that file at line44. Those files belong to the clip lane and were not edited or staged by Agent 1. These are separate from the isolated Agent 1 verification and must be resolved by that lane before final multi-agent integration. Shared-workspace lint passes with the existing `_initial` warning.
