---
read_if:
  - you change firearm attachment export or fitting compatibility
  - you add a muzzle device or change what a muzzle accepts
  - you change authored attachment mass or its ownership
  - you preview fitted attachments in the viewer
---

# Attachment exports

Gungen owns attachment compatibility because only the firearm domain can certify a fit against its rules. A single fit runs every rule validation runs, so a certified fit cannot fail validation; a fit is blamed only for issues the bare firearm lacks. Rules with a per-part variant check just the candidate's interactions, which is all a fit can change. The exported compatibility list is complete and fail-closed: an absent pair is denied rather than guessed at runtime. See `src/gun/attachmentCompatibility.ts`, `PER_PART_RULES`, and `packages/engine/src/assembly/validate.ts`, `validationRules`; fitted defaults remain part of firearm metadata.

A candidate is certified as it will sit on that host: its own set params win, then the values it inherits from the host's base port, then its defaults, the order the engine resolves a fitted part in. A part built standalone is a different part from the one fitted, so judging that build can deny a fit the gun ships with or certify one that cannot sit. See `src/gun/attachmentCompatibility.ts`, `hostedCandidate`, and `packages/engine/src/assembly/resolve.ts`, `resolveParams`.

Pair checks are sufficient because each single already passes validation, and overlap and keep-out are the relations between two placed parts. A group conflicts only when at least one pair conflicts, so a separate triple certificate would duplicate the same geometry question. For optics, rail support follows the mount feet rather than the full visual envelope; body clearance remains a separate fit relation. See `src/gun/attachments.ts`, `railSpanNotches`, `src/gun/rules.ts`, `opticMountFitForPart`, and `packages/deadvox/src/core/firearmFitting.ts`, `railFootprint`.

Attachments are atoms, so their item weight remains authoritative across host-specific
mount presentation and shared visual models. A gun body sums its authored part masses;
replaceable geometry belongs to the fitted item instead of competing with its weight.
See `src/gun/physical.ts`, `gunModelParts`; `src/gun/physical.jsonnet`, `partMasses`; and
`packages/deadvox/src/core/items.ts`, `typeWeightGrams`. Geometric centres are estimates,
not a source of mass; see `packages/thing-export/src/physical.ts`, `partProperties`.

Item appearance belongs to the attachment instance rather than its host so the same item
can keep its own finish across firearms without changing its physical inputs; see
`src/gun/attachments.ts`, `attachmentInstanceForId`, and
`packages/thing-export/src/glb.ts`, `exportGlb`.

## Muzzle devices

A muzzle device fits only a muzzle cut for the bore it was built for, because fit is a property of both the gun and the device: shotguns take muzzle devices, but not rifle suppressors. Both muzzle ports declare that bore as their port `standard` (`src/gun/mounts.ts`, `MuzzleBore`). The engine's `portCompat` (`packages/engine/src/assembly/rules.ts`) requires both sides of a connection to declare the same standard or neither, so the rule holds for designs and certificates alike, and an undeclared side fits nothing that declares one. The pump's smoothbore muzzle keeps its slot, and a device built for smoothbores certifies there without a rule change.

A removable muzzle device, such as the AK's compensator, is an attachment fitted at the barrel's muzzle rather than part of the gun. The player can fit or remove it like any other muzzle attachment, so the rifle and the device are separate items, and a suppressor can take its place. The device offers no muzzle of its own because the export lists only hosts that validate, and a suppressor threaded on the device would cross the barrel's keep-out. The gun therefore fires from its barrel whichever device is fitted.

A port's `size` names its thread pattern, which the engine matches only when both sides declare one. A device cut for one pattern declares it and threads only on that barrel, while a suppressor that declares none fits any muzzle of its bore. See `src/gun/parts.ts`, `akMuzzleDevice`, and `src/gun/attachments.ts`, `akMuzzleDevices`.

## Viewer previews

Use repeatable `fit` query parameters to preview attachments without editing the curated design. The viewer resolves the preview as an assembly connection (see `src/gun/attachmentPreview.ts`, `previewFittedAttachments`), so it uses the same mount transform and part geometry as a fitted attachment in an export. World bounds must include each exported node transform because accessor-local ranges omit offsets from fitted attachments; see `src/gun/exportGlb.ts`, `exportGunGlb`.
