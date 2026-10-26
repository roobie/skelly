---
read_if:
  - you change bolt-rifle handling, magazine-plus-chamber capacity or open-action saves
  - you change turn-bolt posing or integral-magazine loading presentation
---

# Bolt-rifle rationale

## Manual handling and ownership

A bolt rifle must require a deliberate cycle after firing rather than acquire an automatic action merely because its ammunition uses one projectile. Integral loading shares the pump's queue and ammunition owner, while the open bolt remains an item fact: cancelling a hand job must not silently close it. See `src/game/firearmHandling.ts`, `FirearmMechanics`, and `src/core/firearmState.ts`, `snapshotFirearm`.

A top-up must conserve the extracted live round without spending magazine capacity, otherwise the magazine-plus-chamber identity is unreachable. Item ownership keeps that retained round safe across interruption, saves and unloading; closing must restore it before taking a magazine round. A cancelled insertion must not consume the visible cartridge. Closing after a completed load and cancelling a partly completed round are different intentions, so cancellation must not silently close an interrupted action. See `src/core/firearmState.ts`, `FirearmState`, and `src/game/firearmHandling.ts`, `feed`, `cancelLoad`, and `stripBolt`.

The save copy cancels manual motion, not committed ammunition transfers. An open action cannot retain a chambered cartridge or case. Save restoration validates the item mechanism as well as the structural state; see `src/core/items.ts`, `assertAmmunition`, and `src/core/firearmState.ts`, `assertFirearmState`.

## Content and presentation

The civilian cartridge remains separate from military ammunition, and fitting the scope remains the player's choice. No rifle loot placement is authorized until d317 resolves #699's item-tier dependency. Debug range stock is capability-driven rather than a loot placement; see `src/game/testHouseRange.ts`, `testHouseRangeSupply`.

Content owns handling and combat estimates so a mod can tune a rifle without changing mechanisms. The pump's insertion time uses the same content boundary rather than a shell-specific code constant. See `src/content/base/models-firearms.libsonnet`, `items`, and `src/core/schema.ts`, `FirearmSchema`.

The exported pivot, turn and stroke own the motion. Unlock must precede extraction, and the firing hand follows the knob instead of borrowing the pump's support-hand rack. The loading round approaches the top mouth rather than the pump's underside. Rendering samples the existing job clock and never moves ammunition. See `src/render/firearmModel.ts`, `poseActionParts`, `src/render/actorAnimator.ts`, `poseBoltHand`, and `src/render/shellLoadPose.ts`, `shellLoadPose`. The export rationale is in `packages/gun-authoring-tool/docs/bolt-action-export.md`.
