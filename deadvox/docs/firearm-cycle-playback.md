# AR / AK cycle playback

Fresh debug previews: `?debug=1&loadout=ar` or `?debug=1&loadout=ak`.
The selected rifle starts in hand; the other is in the backpack. A restored game
never replaces its saved hands with this loadout. These rifles still use virtual
rounds, without hits or ammunition consumption; firearm sounds are unchanged.

- LMB fires the held rifle; holding LMB uses the exported rpm.
- To cock, select the held rifle in inventory and press U. Alternatively assign it
  to a quickbar key while inventory is open; pressing its key while already held
  cocks it. H moves a selected backpack rifle into the hands.
- Cocking is an ordinary handling action, with the exported duration. It prevents
  firing, halves movement pace and prevents sprinting. Automatic action motion is
  also handling, but is not a cancellable manual queue job.

## Export and ownership

The curated `gungen/designs/archetype-ar.json` and `archetype-ak.json` are exported
with `export:glb`, explicit `--calibre 5.56x45` / `--calibre 7.62x39`, and their
sidecar metadata copied into `src/content/base/models-firearms.json`. See Gungen's
PROJECT.md §3.5 and ADR 0003. The 7.62×39 cartridge exporter supplies the new case
and round meshes. Asset provenance is in `src/content/base/assets/manifest.json`.

Held-clone action bindings match each exact exported node name in
`parser.json.nodes`, then find its node index through `parser.associations`.
They never depend on Three.js's sanitized `Object3D.name`. Child paths bind each
independent held clone, and model-space travel is converted through its parent
transform. Ground models and prepared prototypes never animate.

The AR carrier follows fire and hand strokes; its separate T-handle follows only
hand strokes. The AK handle geometry travels with its carrier. Rearward/dwell/
return timings come from the export; fire duration is capped at `60 / rpm`.

## Ejection and saves

`ejectAt` is the rearward-stroke fraction, not a fraction of the entire cycle.
The existing simulation scheduler advances item-owned chamber/cycle facts and
commits the spent-case counter when that threshold is crossed. As with other
simulation transitions, scheduler samples process a crossed threshold on their
next step. The renderer cannot create a case or decide its admission time.

Ejection uses the exported anchor and direction through the same grip, roll and
hold transforms as the held mesh, followed by simulation eye position, pitch and
yaw. Cosmetic camera bob, roll and recoil do not change ballistics. Transient
speed (3.5 m/s), flight duration (0.48 s), debug rifle masses and case masses are
labelled gameplay estimates, not measured firearm data. Cases continue merging
into the nearest same-calibre pile within about 20 m.

Automatic cycles and pending fired cases survive a snapshot. Manual motion is
omitted from the save copy, just like manual handling jobs, without changing the
live action; its chamber contents remain saved. No generic durable queue, new
timer, migration or compatibility path exists. Save schema is 9.

The case's per-shot RNG stream/key/draw stays at shot admission; sound-picker RNG
and cooldown/hearing order are unchanged. Case-item UID allocation now happens
at ejection instead of admission: an intentional simulation timing change.
The codec/restore test saves before the threshold, then verifies one and only one
case at the threshold and matching deterministic emission. Omitting the pending
mechanical state from `snapshotItem` makes it fail with a missing case.
