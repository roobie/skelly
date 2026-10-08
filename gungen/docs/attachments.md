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
absent. The fitted defaults remain in the firearm's `attachments` metadata. Each
standalone attachment also exports the local normal and up axes of its male mount
connector. A fitted transform derived from the slot's direction and up alone can
leave a scope upright; exporting the connector frame lets Deadvox align every
attachment to the same mount contract without per-kind rotation guesses.

`src/gun/attachmentMass.ts` derives `massKg` from each part's solid geometry,
palette material assignment and part-kind fill treatment. Its cited density rows
are keyed by the material identifiers in `GUN_PALETTE`. Visual finish context does
not change mass metadata, so standalone and fitted forms of the same design agree.
The improvised suppressor's larger body uses the same role density and hollow-body
treatment as the real suppressor. This geometry follows BR's rulings for
`src/gun/attachmentParts.ts`:

> 2026-10-07 10:23: “the supporessor should be approx 100% longer and have a 25% larger radius”
>
> 2026-10-07 10:59: “also, the improvised suppressor must be larger - even larger and more unwieldy than the real suppressor”

`src/gun/attachmentCompatibility.ts`, `attachmentCompatibilityPairs`, certifies
every geometry-clear pair of single-fit choices at distinct slots, including
dynamic fits beside installed defaults. Each
choice must already pass its port and optic-support/loading-clearance rules alone;
the pair check then tests pair-dependent solid overlap and keep-out on both placed
choices. A pair is allowed only when both singles and their pair are certified;
absence denies, and the present list is complete. Solid overlap and keep-out are
relations between two parts, so a set of three attachments conflicts only if at
least one of its pairs conflicts; no triple certificate is needed. Deadvox separately enforces rail-notch
ownership and overlap. Attachment
`massKg` is a model fact, not Deadvox inventory `weight`; d118 owns deriving or
validating item weight against this single source.

Computed class comparisons and their review trigger are tracked in
`docs/deferred-assertions.md`; BR tunes those assumptions before they become
pinned assertions.
