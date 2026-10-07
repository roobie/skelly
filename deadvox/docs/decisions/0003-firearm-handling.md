---
id: deadvox::adr-0003-firearm-handling
description: Decision for how gungen exports what a gun needs to be handled and fired, and how deadvox plays the cycle, ejection, spent cases and magazines
tags: [deadvox, gungen, adr, firearms, ammo, export, feel]
created: 2026-10-02
status: accepted
---

# 3. Firearm handling: what gungen exports, what deadvox plays

[[THIS is_grounded_by: ../../EPIC.md]]
[[THIS is_grounded_by: ../../DESIGN.md]]
[[THIS is_grounded_by: ../../../gungen/PROJECT.md]]

**Status:** accepted (2026-10-02). BR's rulings are recorded under [Rulings](#rulings-2026-10-02).

## Context

BR's goal: handling and firing a gun in deadvox should *feel* right, for example casings ejecting and hitting the floor. At 600 rounds a minute one shot is over in about 100 ms, so the feel comes from a few short beats:

1. the shot: sound, muzzle flash, recoil kick;
2. the moving parts snapping back and forward;
3. the case leaving the ejection port, spinning, and hitting the ground with a tink;
4. the magazine: the top round changes as it empties, and on a reload the magazine comes out with its rounds visible.

What exists today:

- **gungen** exports a GLB and a `DeadvoxModelEntry` (`gungen/src/gun/exportGlb.ts`): `id`, `file`, `grip: { at, turn }` and optional named `anchors` (points). The 3.0a export types are frozen (`gungen/PROJECT.md`, "3.0a contracts"); `muzzle` anchors are accepted by deadvox but unused. Parts carry `PartMotion` (start/end, renamed in g28), and keep-outs already describe the ejection path.
- **Cartridges:** `gungen/cartridges/7.62x39.json` with sources, its parser and rules (#109 step 1). #127 added revolved solids and per-domain units.
- **Spikes:** `gungen/ammo-geometry-spike` (round and case profiles, a staggered round column along a curved magazine, a filled detached magazine) and `gungen/action-spike` (a hand cocking timeline for the AK carrier). Both are being rebuilt as g34 and g35.
- **deadvox:** `firearm` is a capability marker on items with no fields (`src/core/schema.ts`), and d10 reserved the `firearm` primary action. Ammo and magazines are planned for slice 3 (`EPIC.md`: "firearms from gungen assemblies: ammo, magazines, reloading as handling").

## Decision

### 1. A handling range before damage

The first deadvox milestone is a **debug-only handling range**: fire the held AK or M4 with no hits and no ammo economy, to tune the feel before slice 3's gameplay. It includes a simple **gun range site** placed next to the hamlet like the other sites (`src/core/site.ts`): a firing line, a few targets, a table. Real firing with damage comes later and reuses everything below.

### 2. The action is data, per gun, and guns differ

Each gun's export describes its action, and deadvox plays it; nothing is hand-animated per gun in deadvox.

- **Cycle:** a firing cycle (gas-driven rearward stroke, a short dwell, spring return to battery) and a hand cycle (cocking), as timelines over the moving part's stroke. Numbers are estimates checked by eye in slow motion (BR: "we'll eyeball it").
- **Hold-open on empty:** the AR's bolt catch holds the carrier at the rear after the last round; the AK returns to battery on an empty magazine. BR: a big part of the feel is the difference between guns.
- **What moves visibly:** on the AK the carrier and its charging handle reciprocate; on the AR the carrier moves inside the receiver (seen through the ejection port) and the charging handle stays forward.

### 3. Spent cases: one counter per block, not one object per case

This is a survival game and reloading ammunition is part of it, so spent cases are **simulation state** and are saved. But deadvox does **not** model each case. Instead:

- Each shot adds 1 to the **spent-case pile** item for that calibre on the block where that shot's case lands, starting a pile there if there is none. BR's 2026-10-07 ruling (below) replaced the first ruling's counter per area of about 20 m; see DESIGN.md, "Spent cases per block".
- The increment happens **at the shot**, from the simulation, never from the flying case's physics, so it is deterministic and survives save and restore.
- The pile is an ordinary pile with a stack of `spent_case_<calibre>` items with a count; picking it up gives the cases (for reloading later).
- **Rendering the pile** uses the count: up to a cap, a scatter of instanced case models laid out deterministically from the pile's seed and count, spreading wider as the count grows. Beyond the cap the scatter stays as is.
- The **flying case** is presentation only: spawned at the ejection port with the gun's eject direction plus a little random spread and spin, simple bounce physics against blocks, a tink by block material, then it disappears when it settles. It is outside the simulation fingerprint and never saved, from a small capped pool.

### 4. The gungen–Deadvox model contract

This project is pre-pre-alpha; no backwards compatibility is owed. Gungen and Deadvox may change their export and model schema together, without legacy paths or migrations. The acceptance gate is that a model exported by gungen is validated by Deadvox and loads in its model runtime. Gungen fills the following data from each design and its selected cartridge.

- `calibre`: the cartridge id (e.g. `7.62x39`) from gungen's cartridge data.
- `anchors` gain named points: `muzzle` (already accepted), `ejection` (where the case leaves) and `magwell` (where the magazine seats). Each point is `[x, y, z]` in metres in the model frame (+x forward, +y up, +z right).
- `action`:
  - `parts`: the moving roles as **separate named nodes** in the GLB, each with `node` (exact glTF name), `axis` (unit travel direction), `strokeMetres`, and required `modes` (a nonempty, distinct list of `fire`/`hand` timing references). Nodes follow the shared timeline in each listed mode and stay home in other modes. The AR carrier lists both; its separate T-handle lists only `hand`, pulls through the same stroke, and returns/latches home. The AK handle remains part of its carrier node, which lists both. This needs no separate per-node animation scheduler;
  - `fire` (optional) and `hand`: cycle timelines (rear, dwell, forward seconds, or sampled curves). A pump exports hand only, with carrier/forend coupled on both hand-driven legs; no gas-driven fire timeline or cyclic rpm;
  - `ejectAt`: the stroke fraction at which the case leaves, and `ejectDirection`: a unit vector in the model frame; both are fields of `action`;
  - `holdOpen`: whether the carrier stays back on an empty magazine;
  - `rpm`.
- **Magazines** are separate items with their own model entry: `calibre`, `capacity`, and the round column (`rounds: [{ at, tilt }]`, from the top round down). `at` is the round centre in metres in magazine-model coordinates; `tilt` is degrees about +z (nose-up positive). Left/right stagger is encoded by the sign of `at[2]`, not a separate field, so deadvox can draw remaining rounds by instancing the round model.
- **Integral tube:** optional `tube: { capacity }` on the gun, excluding the chamber,
  with `anchors.loading_port` in metres for loading single shells. It requires calibre
  and the loading anchor, and does not carry a detached-box `capacity`/`rounds`
  column. Geometry-derived fit and visual reserve estimates are documented in
  `gungen/docs/pump-action-export.md`; runtime loading remains later work.
- **Cartridge models:** `round_<calibre>` and `case_<calibre>` GLBs with their own entries, at real dimensions (#109). In model ids and filenames `<calibre>` means the deterministic slug of the cartridge id (e.g. `round_7_d_62x39`); the entry's `calibre` remains the exact source id (`7.62x39`).

Three.js sanitizes `Object3D.name` (including stripping colons). Runtime node discovery must match `node` against `parser.json.nodes`, then use `parser.associations`' node index to find the actual loaded object, rather than calling `getObjectByName` with the raw glTF name.

Gungen's resolved action description is the shared source for part discovery, coupling and ejection data in viewer/export. Its pump carrier/forend hand cycle is manual on both legs. The separate static open pose remains view-only, with cycle controls hidden there: validation and export stay at rest, and no pump firing timeline is implied.

The exact field names and units are settled in the gungen work items (g34, g35, g38) and recorded in `gungen/PROJECT.md` next to the 3.0a contracts; this ADR fixes what the contract must carry.

### 5. Simulation and presentation

| Simulation (saved, fingerprinted) | Presentation (not saved, excluded) |
| --- | --- |
| rounds in the magazine and chamber, hold-open state | carrier animation, flying cases, muzzle flash, recoil kick, sound |
| spent-case pile counts and positions | the pile's scatter of case models |
| the shot's time and direction (later: hits) | camera and hand motion |

The existing fingerprint rules (`SIMULATION_EXCLUSIONS`) apply: presentation code lives in excluded modules, with canaries both ways.

## Rulings (2026-10-02)

- Casings: not per case; a counter per area of about 20 m that also drives rendering (BR's pushback on decorative-only cases). Superseded by BR, 2026-10-07 11:27, asked whether to save cases per block with a deterministic scatter or each at its exact landing point: "keep it simple in code, so i guess per block?" The counter is now per block.
- A handling range first, damage later; a gun range site next to the hamlet.
- Hold-open on empty modelled; the guns should feel different.
- Cycle numbers are eyeballed.
- Owners: g34 (ammo and magazines, coder4), g35 (firing cycle, coder1), the deadvox handling range afterwards.

## Consequences

- No compatibility version, migration, or byte-identity requirement is implied. Gungen export and Deadvox model validation/runtime loading evolve together; an exported model that Deadvox validates and loads is the gate.
- The GLB export must keep moving parts as separate nodes for guns that declare an action.
- deadvox needs a small presentation-only physics for flying cases (a few dozen at most), and a pile scatter renderer.
- Reloading ammunition, ammo economy and damage stay in slice 3; this ADR only makes them possible.

## Open questions

- Steel-cased 7.62x39 (lacquered, grey-green) as well as brass: a finish variant of the case model, and does the pile keep them apart?
- Recoil: a camera kick and hand motion now; anything physical later?
- Sounds: shot, mechanical clack, case tink per material; sourced like the other sounds and listed on the audio sheet.
