---
read_if:
  - you build or change how one mod changes a field of another mod's definition
  - you change the content merge, its origins or the conflict messages it reports
  - you mark schema fields as patchable or add a patch operation
  - you write a mod that needs one field of a base or other mod's entry changed
  - you schedule field-patch implementation or the mod tool's editing prerequisites
tags: [deadvox, adr, mods, content, schema, validation]
---

# 7. Typed field patches checked at load

## Context

A later pack replaces an earlier definition whole, by id, and the registry remembers one
winning file per entry. See `packages/deadvox/src/core/content.ts`, `merge` and `contentOrigins`.
A mod that needs one field of a base entry changed must restate the entry, or build it from
the base sources in Jsonnet, which still compiles to a whole entry.

The reference mod for our modding scope is mostly new content, but a real share of its
entries change one field of a base entry, most often adding a flag or a list item to a
monster or an item, and a few restate a scalar or a whole list. Two mods changing the same
entry is the normal case for such a mod, not an edge case.

The choice made here is the one meant to still look right after a year of mods and base
changes, not the one cheapest to build first.

## Decision

A mod may change fields of another pack's definition through typed patch operations that
the loader checks when the pack is admitted. The schema marks which fields accept which
operations; a field it does not mark accepts none. Whole-definition replacement stays
available for a mod that means to replace an entry, under the same conflict rule.

**Checked at load.** A patch whose target id, field or operation does not exist, or whose
field does not accept that operation, is a load error naming the mod, the target and the
field. This is the strictness the content schema already has: reject, never clamp or
ignore. A renamed base entry then breaks its patches loudly in the mod that owns them.

**A small, fixed operation set.** Every operation must be something validation can check
before applying and explain afterwards, so the set grows only by a decision, never per
mod. The reference mod needs three: add to a list, set a scalar and replace a list. Which
fields accept which operations belongs in the schema beside each field, not in this
record.

**Schema marking.** Marking bounds what a mod can break and what validation must explain,
because only marked fields can have more than one author.

**Conflicts.** A mod may override another mod's value or object only if it depends on
that mod, directly or transitively, and declares the override. Setting a scalar,
replacing a list and replacing a whole definition are overrides. List additions are not:
they commute, so two mods adding to one list both keep their additions, in pack order,
and never conflict. The load fails closed, with a message naming the target, the mods and
the fix, in two cases: two mods with no dependency path between them
override the same value or object, or a mod overrides a dependency without declaring it.

Load order alone never decides, because the order in which a player enables mods says
nothing about which one meant to win. The dependency decides instead: the overriding mod
always loads after the owner. This is the rule for competing skill providers in
`packages/deadvox/docs/pack-split.md`, "Skill providers", so one rule covers every place where two
mods claim one thing. The declaration is needed as well, because a dependency alone lets a
mod overwrite its owner's value by accident with nothing to flag it. Declaring each
override makes it deliberate and checkable at load, and failing closed stops a silent
change from reaching play.

## Rejected

- **Whole-entry replacement only, or patches written in Jsonnet that compile to whole
  entries.** Each copy freezes the base entry as of its writing, so a later base change to
  that entry is lost without any error, and two mods touching one entry still collide
  whole.
- **Untyped field patches applied at load.** A patch whose target was renamed matches
  nothing and fails silently. Every game that took that route later had to build a tool
  to find dead patches or to learn which mod set a value.

## Implementation ownership

Build the field-patch merge as a Deadvox engine feature, design-checked against this ADR
before implementation and scheduled ahead of other queued Deadvox work. It owns patch
application, schema marking and per-field origins. The mod authoring tool's editing
slices wait for that feature to merge; its overview and read-only inspection can proceed.
See `docs/decisions/0008-mod-authoring-tool.md`, "Build plan".

The engine feature must deliver or explicitly depend on conflict enforcement and the
pack-dependency admission of #637; see
`packages/deadvox/docs/pack-split.md`, "Round split". Documented conflict rules are not
loader enforcement: the design must verify those prerequisites so patch admission
cannot silently accept an undeclared override. The separate literal set-target rule
belongs to `docs/decisions/0004-content-language.md`, "Mod rules", and its runtime work
in #313, not to patch application. Nothing needs migrating before v1.0 beta (#1023).

## Consequences

Validation needs an origin per patched field, not only per entry, so a diagnostic can name
every mod that changed a value. A conflict between two mods becomes a load error a player
can act on, at the cost of requiring mod authors to declare overrides and dependencies.
Save identity records the ordered pack list, which fixes the patched result; see
`packages/deadvox/src/core/saveFormat.ts`, `currentSaveVersionIdentity`. The pack-list identity is the rule until #1395 moves
identity to the evaluated content, as
`packages/deadvox/docs/decisions/0008-deterministic-world.md`, "Decision" rules.
