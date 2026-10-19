---
read_if:
  - you change firearm attachment export or fitting compatibility
  - you add a muzzle device or change what a muzzle accepts
  - you change the material or mass assumptions for an attachment
  - you preview fitted attachments in the viewer
---

# Attachment exports

Gungen owns attachment compatibility because only the firearm domain can certify a fit against its port, optic-support, loading-clearance and keep-out rules. The exported compatibility list is complete and fail-closed: an absent pair is denied rather than guessed at runtime. See `src/gun/attachmentCompatibility.ts`, `attachmentCompatibilityPairs`; fitted defaults remain part of firearm metadata.

Pair checks are sufficient because overlap and keep-out are relations between two placed parts. A group conflicts only when at least one pair conflicts, so a separate triple certificate would duplicate the same geometry question. For optics, rail support follows the mount feet rather than the full visual envelope; body clearance remains a separate fit relation. See `src/gun/attachments.ts`, `railSpanNotches`, `src/gun/rules.ts`, `opticMountFitForPart`, and `deadvox/src/core/firearmFitting.ts`, `railFootprint`.

Attachment mass is a geometry-and-material estimate, not inventory weight or a product specification. Keep exact outputs unpinned until BR approves the density and fill assumptions; otherwise model choices can be mistaken for measured product weights. See `src/gun/attachmentMass.ts`, `attachmentMassKg`, and `docs/deferred-assertions.md`. Item appearance belongs to the attachment instance rather than its host so the same item can keep its own finish across firearms; see `src/gun/attachments.ts`, `attachmentInstanceForId`, and `engine/src/export/glb.ts`, `exportGlb`.

## Muzzle devices

A muzzle device fits only a muzzle cut for the bore it was built for, because fit is a property of both the gun and the device: shotguns take muzzle devices, but not rifle suppressors. Both muzzle ports declare that bore as their port `standard` (`src/gun/mounts.ts`, `MuzzleBore`). The engine's `portCompat` (`engine/src/assembly/rules.ts`) requires both sides of a connection to declare the same standard or neither, so the rule holds for designs and certificates alike, and an undeclared side fits nothing that declares one. The pump's smoothbore muzzle keeps its slot, and a device built for smoothbores certifies there without a rule change.

## Viewer previews

Use repeatable `fit` query parameters to preview attachments without editing the curated design. The viewer resolves the preview as an assembly connection (see `src/gun/attachmentPreview.ts`, `previewFittedAttachments`), so it uses the same mount transform and part geometry as a fitted attachment in an export. World bounds must include each exported node transform because accessor-local ranges omit offsets from fitted attachments; see `src/gun/exportGlb.ts`, `exportGunGlb`.
