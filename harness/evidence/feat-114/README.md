# feat-114 — Worker transport / presentation bridge

2026-10-29 ICT; dependency113=`516f7f8`.

- STARTED carries an optional runId and initial.presentation snapshot(sequence0). Every modern TICK carries runId/sequence/full presentation; all existing Float32Array strides and transfer lists are unchanged. Each START and each runtime instance gets a distinct id; PAUSE/RESUME preserves it. STOP/blocked-sync invalidates the run.
- Snapshots contain fresh plain objects, not transferable/shared engine buffers. Transfer/detachment tests verify that the engine can continue ticking after structuredClone transfers all frame buffers.
- `PresentationBridge.begin(layoutRevision,{runId,presentation})`, `.accept(tick)`, `.current` and `.reset()` form the consumer API. Reset on STOP; begin after STARTED. Reject wrong run/layout, duplicate/reversed sequence, mismatched envelope, time reversal, non-finite/progress-invalid data, duplicated identities/chairs and invalid meal cycles.
- Missing legacy metadata or unknown future versions can still render compatible motion but current semantic state is null; never infer Eat/clean from legacy state4. Identified modern runs reject unidentified old TICKs. The controller connects the bridge in115.
- Current-state storage is bounded: no event replay queue, one snapshot in the bridge, and producer task/departure records bounded by tables. Test fixtures measure1/40/80actor payloads, with80unseated actor records below40KB; this is not a claim that a fully populated meal/staff scene has the same size.

Verification: presentation-bridge.test.ts covers initial/TICK transfer, run/sequence/layout validation, malformed/legacy/unknown versions, pause/restart, blocked sync and payload scaling. Full workspace suite88files/1029tests passed; lint/typecheck/Harness/boundaries passed, with the same pre-existing lint warning.
