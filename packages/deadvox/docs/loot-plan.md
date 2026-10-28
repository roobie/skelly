---
read_if:
  - you change default loot tables, scenario loot tables or how a scenario enables them
  - you place loot on a roof or give one point a tier other than its building's
  - you tag items Hunting or Military, or change NVG tiers or placement
  - you write or change the dead-row or untabled-item loot checks
  - you extend a loot table from a mod, a setting or a scenario
tags: [deadvox, loot, content, mods, validation]
---

# Loot plan rulings

Rulings on the loot work for the playtest scenarios and the default tables. Each states what
was ruled and why. How loot rolls and is checked is in `src/core/loot.ts`, `economyEligible`
and `admissionIssue`; the economy description is in `content.md`, "Loot economy descriptions".

## Default tables and how a scenario enables them

The default tables live in a bundled mod, so a scenario takes them by depending on it. The
rule: a scenario that wants the default tables depends on the mod and by that applies its
tables; a mod that does not want them does not depend on it. The dependency states the choice
and load checks it, so no automatic enabling rule and no opt-out list is needed. A scenario
that skips the defaults owns its tables.

A scenario changes a default table by deriving a new table from it, under the model in
`docs/decisions/0007-typed-field-patches.md`, "Decision". A derived table lists only what it
changes and still receives core rows added later, which a copy at compile time would lose.
Patching the base table stays available for a change meant to be shared by every place bound
to it.

## Rows

A table row has a stable id, so a patch addresses one row and the model covers every keyed
list, not loot only. Changing a row's weight, or any other field of the row, is a set at the
row's address. Removing a row by id is an override, because its outcome would otherwise depend
on order; the remover depends on the table's owner and declares the removal. Restating a table
to change one row is the defect the model removes.

## Roof places

A roof crate gets Tier2. A tier set on the anchor, and on a fixed-loot override of it, reaches
that point alone and leaves the building's other points at the building's tier. The anchor
carries it, beside its usage, because one tier on one point is the whole need. A region concept
or a full context per anchor is not built until a second need shows the first cannot state it.

A roof place rolls items that reach exactly Tier2. Items eligible only below Tier2 do not roll
there, so the roof's contents are the Tier2-reaching items and its odds are not tuned together
with the cabins'. The roof is not guaranteed to hold anything; it is a place that can.

## Night-vision goggles

NVGs take Tier4 in place of their earlier tiers. Replacing, not adding, makes "Tier4" mean what
it says: kept at lower tiers they would stay common, which the Tier4 tag was written to end.

The NVG keeps a Tier4 row, as rare random loot in Tier4 places, and the gauntlet also places
it by hand. In the gauntlet the NVGs are placed loot, so they do not have to spawn
organically; the placement is extra and does not replace the row. Every loot item has a row
so that the untabled-item check below can fail on an untabled item, and NVGs are no exception:
placement does not stand in for the row. Fixed loot is
admission-checked, so the placement must pass the item's new tiers and usage at its point.
That is an implementation gate. The row must also be admitted by some Tier4 place, or the
dead-row check below fails it.

## Checks

The untabled-item check fails any item with a non-empty economy that has no table row, whatever
else names it: a fixed-loot entry or a recipe output does not excuse the missing row. The rule
and the check agree, and drift in an economy tag is caught. An item that must never roll is
marked `notLoot`, which gives it a clean exit. The check says nothing about places.

A dead row is a row of a table that no binding of the table admits. A place refusing a row is
ordinary filtering, such as a Tier2 scope in a Tier1 cabin, and never makes a row dead. The
dead-row check fails validation. If it comes to cost more than it gives, change it to a report.
The scope is the union of the places in every playable bundled stack: a row is dead only if no
stack's place admits it. A row used by one scenario and unreached in another is therefore not
flagged, so scenarios need not skip or accept each other's default rows.

## Open

- **Patch-based table extension.** Starts when the engine patch merge of
  `docs/decisions/0007-typed-field-patches.md`, "Implementation ownership" lands.
