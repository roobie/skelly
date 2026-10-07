---
read_if:
  - you change firearm attachment export or fitting compatibility
  - you change the material or mass assumptions for an attachment
---

# Attachment exports

Gungen owns the compatibility decision because `opticMountFit` and `keepOut` in
`src/gun/rules.ts` are the geometry authority. `src/gun/attachmentCompatibility.ts`
places each exported standalone attachment at each firearm slot and exports a
complete allowlist; consumers must deny dynamic fits when that certificate is
absent. The fitted defaults remain in the firearm's `attachments` metadata.

`src/gun/attachmentMass.ts` derives `massKg` from each part's solid geometry,
palette material assignment and part-kind fill treatment. Its cited density rows
are keyed by the material identifiers in `GUN_PALETTE`. Visual finish context does
not change mass metadata, so standalone and fitted forms of the same design agree.
The improvised suppressor's larger body uses the same role density and hollow-body
treatment as the real suppressor. Attachment `massKg` is a model fact, not Deadvox
inventory `weight`; d118 owns deriving or validating item weight against this
single source.

Computed class comparisons and their review trigger are tracked in
`docs/deferred-assertions.md`; BR tunes those assumptions before they become
pinned assertions.
