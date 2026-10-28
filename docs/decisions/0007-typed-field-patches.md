---
read_if:
  - you build or change how one mod changes a value of another mod's definition
  - you change the content merge, its origins or the conflict messages it reports
  - you decide which values the schema refuses to patch, or add a patch operation
  - you add a derived entry or a keyed list of identified elements
  - you write a mod that needs one value of a base or other mod's entry changed
  - you schedule field-patch implementation or the mod tool's editing prerequisites
tags: [deadvox, adr, mods, content, schema, validation]
---

# 7. Typed patches addressed by content id, checked at load

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
changes, not the one cheapest to build first. The reason behind it is `PILLARS.md`, "Moddability".

## Decision

One addressing model and two classes of operation, checked when the pack is admitted. Per-field
and per-operation rules are rejected because each new need then adds an exception.

**Addressing.** Every value has an address: a content id, then a field path, then the element
id inside a keyed list. Row ids make loot table rows the first keyed list, and the model covers
every list of identified elements. A patch whose address does not exist is a load error
naming the mod, the target and the fix. This is the strictness the content schema already
has: reject, never clamp or ignore. A renamed base entry then breaks its patches loudly in the
mod that owns them.

**Operations.** Adding an element commutes. Setting a value at an address, removing an element
by id, replacing a list and replacing an entry are overrides. Removal is an override because
its outcome would otherwise depend on whether another mod's change to the same element loads
first. The schema and code own the operation list; this record owns the two classes.

**Default reach.** Every address is patchable according to its type. The schema refuses a patch
only for values the engine owns, by the split `PILLARS.md`, "Content forward compatibility"
already draws between code and content: save integrity, physics, geometry and true
impossibilities. There is no marking per field. Marking each field would make "flexible" a
chore of opening fields one by one, and leave a mod that needs an unmarked field with a
whole-entry copy and the frozen base that comes with it. A refusal category set by rule still
bounds what a mod can break and what validation must explain, which was the reason for marking,
and keeps engine internals from becoming a contract.

**Derive.** An entry may extend another entry of the same kind. The new entry holds only its
changes, made with the same operations, and is resolved at load after all patches to its base,
so it is never a frozen copy. A core row added by any mod then reaches every derived table. A
derived entry serves a per-place variant. Patching the base entry stays available for a change
that is meant to be shared by everything built on it. The cost is that a derived entry can
change when an unrelated mod patches its base, so the origin trail must show every step.

**Conflicts.** A mod may override another mod's value or entry only if it depends on that
mod, directly or transitively, and declares the override. Commuting additions never conflict:
two mods adding to one list both keep their additions, in pack order. The load fails closed,
with a message naming the target, the mods and the fix, in three cases: two mods with no
dependency path between them override the same address, a mod overrides a dependency without
declaring it, or a derive chain cannot resolve. A mod that depends on every setter of an
address may settle the clash, so two popular mods coexist through a third.

Load order alone never decides, because the order in which a player enables mods says
nothing about which one meant to win. The dependency decides instead: the overriding mod
always loads after the owner. This is the rule for competing skill providers in
`packages/deadvox/docs/pack-split.md`, "Skill providers", and the stacking-against-setting split
for effects in `docs/decisions/0004-content-language.md`, "Mod rules", so one rule covers every
place where two mods claim one thing. The declaration is needed as well, because a dependency
alone lets a mod overwrite its owner's value by accident with nothing to flag it. Declaring each
override makes it deliberate and checkable at load, and failing closed stops a silent change
from reaching play.

**Growth.** A new operation is added by decision, when a need cannot be stated with the existing
ones. Each must declare whether it commutes or overrides against every existing operation, so
no pair of operations has an unspecified order. Every operation must be something validation
can check before applying and explain afterwards.

## Rejected

- **Whole-entry replacement only, or patches written in Jsonnet that compile to whole
  entries.** Each copy freezes the base entry as of its writing, so a later base change to
  that entry is lost without any error, and two mods touching one entry still collide
  whole.
- **Untyped field patches applied at load.** A patch whose target was renamed matches
  nothing and fails silently. Every game that took that route later had to build a tool
  to find dead patches or to learn which mod set a value.
- **Fields patchable only where the schema marks them.** A field nobody marked forces the
  whole-entry copy again, and the marks grow into the per-field exception list this record
  replaces.
- **Everything patchable with no refusal category.** Engine internals would become a contract
  that every refactor breaks.
- **Free removal.** An order-dependent outcome that nobody specified.

## Implementation ownership

Build the patch merge as a Deadvox engine feature, design-checked against this ADR and against
the content in `packages/deadvox/src/core/content.ts` before implementation and scheduled ahead of
other queued Deadvox work. It owns addressing, the refusal category, derive resolution and
per-address origins. The mod authoring tool's editing slices wait for that feature to merge; its
overview and read-only inspection can proceed. See `docs/decisions/0008-mod-authoring-tool.md`,
"Build plan".

The engine feature must deliver or explicitly depend on conflict enforcement and the
pack-dependency admission of #637; see
`packages/deadvox/docs/pack-split.md`, "Round split". Documented conflict rules are not
loader enforcement: the design must verify those prerequisites so patch admission
cannot silently accept an undeclared override. The separate literal set-target rule
belongs to `docs/decisions/0004-content-language.md`, "Mod rules", and its runtime work
in #313, not to patch application. Nothing needs migrating before v1.0 beta (#1023).

In-repo packs and mods use two extend paths until the merge lands. Once it does, the in-repo
packs move to the same patch helpers mods use, so there is one mechanism; a tracked follow-up
item owns that move.

## Consequences

Validation needs an origin per patched address, not only per entry, so a diagnostic can name
every mod that changed a value and every step of a derive chain. A conflict between two mods
becomes a load error a player can act on, at the cost of requiring mod authors to declare
overrides and dependencies, and a mod that removes a base element must depend on its owner and
declare the removal.

Default reach makes the schema's field names part of the contract for mods. A schema rename
breaks the mods that touched the renamed value. That is free before v1.0 beta (#1023).

The player cannot settle a clash without a compatibility mod that does.

Save identity records the ordered pack list, which fixes the patched result; see
`packages/deadvox/src/core/saveFormat.ts`, `currentSaveVersionIdentity`. The pack-list identity is the rule until #1395 moves
identity to the evaluated content, as
`packages/deadvox/docs/decisions/0008-deterministic-world.md`, "Decision" rules.

## Open

- **Schema renames after v1.0 beta.** A rename then needs a deprecation story. Decide at #1023.
- **Settling a clash in the player's UI.** A winner chosen per conflict and recorded in save
  identity would loosen "load order never decides", so it needs a ruling of its own before any
  such UI is built.
- **Derive across kinds or upward across layers, and a depth cap on a derive chain.** The model
  forbids derive across kinds and upward across layers: dependencies point down only, so a
  setting table may extend a core table and not the reverse (`packages/deadvox/docs/pack-split.md`,
  "Layers"). Whether the chain needs a depth cap awaits a ruling; build neither until then.
- **Order independence of patch admission.** When #1395 moves save identity to the evaluated
  content, an order-only difference stops showing in identity. Add a test of order
  independence over patch admission then.
- **Effect set-verbs.** The first set-verb of #313 uses this addressing model, so effects and
  patches share one override rule.
