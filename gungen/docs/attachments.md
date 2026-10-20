---
read_if:
  - you change firearm attachment export or fitting compatibility
  - you add a muzzle device or change what a muzzle accepts
  - you change the material or mass assumptions for an attachment
  - you preview fitted attachments in the viewer
---

# Attachment exports

Gungen owns attachment compatibility because only the firearm domain can certify a fit against its port, optic-support, loading-clearance and keep-out rules. The exported compatibility list is complete and fail-closed: an absent pair is denied rather than guessed at runtime. See `src/gun/attachmentCompatibility.ts`, `attachmentCompatibilityPairs`; fitted defaults remain part of firearm metadata.

Pair checks are sufficient because overlap and keep-out are relations between two placed parts. A group conflicts only when at least one pair conflicts, so a separate triple certificate would duplicate the same geometry question. For optics, rail support follows the mount feet rather than the full visual envelope; body clearance remains a separate fit relation. See `src/gun/attachments.ts`, `railSpanNotches`, `src/gun/rules.ts`, `opticMountFitForPart`, and `packages/deadvox/src/core/firearmFitting.ts`, `railFootprint`.

Attachment physics uses canonical item geometry so host-specific mount presentation cannot
change an item's mass. Density and fill assumptions are estimates, not measured product
weights; keep exact outputs unpinned. See `src/gun/physical.ts`, `gunModelParts`;
`src/gun/physical.jsonnet`, `roles`; and `docs/deferred-assertions.md`. Shared derivation
belongs to `packages/thing-export/src/physical.ts`, `partProperties`, rather than the gun pack.

Item appearance belongs to the attachment instance rather than its host so the same item
can keep its own finish across firearms without changing its physical inputs; see
`src/gun/attachments.ts`, `attachmentInstanceForId`, and
`packages/thing-export/src/glb.ts`, `exportGlb`.

## Muzzle devices

A muzzle device fits only a muzzle cut for the bore it was built for, because fit is a property of both the gun and the device: shotguns take muzzle devices, but not rifle suppressors. Both muzzle ports declare that bore as their port `standard` (`src/gun/mounts.ts`, `MuzzleBore`). The engine's `portCompat` (`packages/engine/src/assembly/rules.ts`) requires both sides of a connection to declare the same standard or neither, so the rule holds for designs and certificates alike, and an undeclared side fits nothing that declares one. The pump's smoothbore muzzle keeps its slot, and a device built for smoothbores certifies there without a rule change.

## Viewer previews

Use repeatable `fit` query parameters to preview attachments without editing the curated design. The viewer resolves the preview as an assembly connection (see `src/gun/attachmentPreview.ts`, `previewFittedAttachments`), so it uses the same mount transform and part geometry as a fitted attachment in an export. World bounds must include each exported node transform because accessor-local ranges omit offsets from fitted attachments; see `src/gun/exportGlb.ts`, `exportGunGlb`.
