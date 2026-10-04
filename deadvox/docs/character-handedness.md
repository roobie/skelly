---
read_if:
  - changing character creation, restoration or dominant-hand policies
  - changing inventory work admission or physical hand slots
---

# Character handedness

Handedness is character identity, not an origin-local preference. Keeping it in
`src/core/character.ts`, `CharacterState`, prevents Continue from changing an
actor because a creation form or browser setting changed. `Character` fixes the
choice at creation; `src/core/saveFormat.ts`, `progression`, requires it in saves
rather than inventing identity for malformed data. There is no migration obligation
before the compatibility milestone in the repository's `AGENTS.md`.

Inventory and its consumers read the actual actor, not a copied preference. See
`src/game/session.ts`, `createSession`, and `src/core/inventory.ts`, `Inventory`.
Restoring the actor before Inventory keeps private work admission aligned with the
same character used by gameplay. `DEFAULT_HANDED_CHARACTER` in
`src/core/character.ts` exists for standalone fixtures, not production wiring.

Physical hand slots remain physical so explicit inventory moves and saved action
snapshots keep their meaning. Core preferences resolve through `dominantSide` and
`offSide` in `src/core/character.ts`; tree traversal does not change order. Craft
escrow and continuation use the dominant slot and require the other hand free
(see `src/core/craftWork.ts`, `craftActionHooks`). This enforces the two-handed work
constraint at its owner, rather than relying on a menu to choose a valid target.
