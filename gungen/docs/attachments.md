---
read_if:
  - you change firearm attachment export or fitting compatibility
  - you change the material or mass assumptions for an attachment
  - you preview fitted attachments in the viewer
---

# Attachment exports

Gungen owns attachment compatibility because only the firearm domain can certify a fit against its port, optic-support and keep-out rules. The exported compatibility list is complete and fail-closed: an absent pair is denied rather than guessed at runtime. See `src/gun/attachmentCompatibility.ts`, `attachmentCompatibilityPairs`; fitted defaults remain part of firearm metadata.

Pair checks are sufficient because overlap and keep-out are relations between two placed parts. A group conflicts only when at least one pair conflicts, so a separate triple certificate would duplicate the same geometry question. Optic feet determine rail support; body clearance is a separate fit relation. See `src/gun/rules.ts`, `opticMountFitForPart`, and `deadvox/src/core/firearmFitting.ts`, `railFootprint`.

Attachment mass is a geometry-and-material estimate, not inventory weight or a product specification. Keep exact outputs unpinned until BR approves the density and fill assumptions; otherwise model choices can be mistaken for measured product weights. See `src/gun/attachmentMass.ts`, `attachmentMassKg`, and `docs/deferred-assertions.md`. Item appearance belongs to the attachment instance rather than its host so the same item can keep its own finish across firearms; see `src/gun/attachments.ts`, `attachmentInstanceForId`, and `engine/src/core/glb.ts`, `exportGlb`.

The viewer's fitted preview follows the same assembly transform as export; see `src/gun/attachmentPreview.ts`, `previewFittedAttachments`. World bounds must include each exported node transform because accessor-local ranges omit offsets from fitted attachments; see `src/gun/exportGlb.ts`, `exportGunGlb`.
