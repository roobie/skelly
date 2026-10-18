---
read_if:
  - you build or change how one mod changes a field of another mod's definition
  - you change the content merge, its origins or the conflict messages it reports
  - you mark schema fields as patchable or add a patch operation
  - you write a mod that needs one field of a base or other mod's entry changed
tags: [deadvox, adr, mods, content, schema, validation]
---

# 7. Typed field patches checked at load

## Context

A later pack replaces an earlier definition whole, by id, and the registry remembers one
winning file per entry. See `deadvox/src/core/content.ts`, `merge` and `contentOrigins`.
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
available for a mod that means to replace an entry.

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

**Conflicts.** List additions commute: two mods adding to one list both keep their
additions, in pack order, and never conflict. A scalar set, or a list replaced, by two
mods fails closed with a conflict message naming the field, both mods and the fix, unless
the later mod declares that it overrides the earlier one and depends on it, directly or
transitively. Load order alone never decides. This is the rule for competing skill
providers in `deadvox/docs/pack-split.md`, "Skill providers", so one rule covers every
place where two mods claim one thing.

## Rejected

- **Whole-entry replacement only, or patches written in Jsonnet that compile to whole
  entries.** Each copy freezes the base entry as of its writing, so a later base change to
  that entry is lost without any error, and two mods touching one entry still collide
  whole.
- **Untyped field patches applied at load.** A patch whose target was renamed matches
  nothing and fails silently. Every game that took that route later had to build a tool
  to find dead patches or to learn which mod set a value.

## Not decided

When the merge step is built. Whole-entry mods keep working when it lands, and nothing
needs migrating before v1.0 beta.

## Consequences

Validation needs an origin per patched field, not only per entry, so a diagnostic can name
every mod that changed a value. A conflict between two mods becomes a load error a player
can act on, at the cost of requiring mod authors to declare overrides and dependencies.
Save identity keeps recording the ordered pack list, which already fixes the patched
result. See `deadvox/src/core/saveFormat.ts`, `currentSaveVersionIdentity`.
