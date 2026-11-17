import { literal, strictObject, variant } from 'valibot';
import { LootEntriesSchema } from './loot.ts';
import { Id } from './primitives.ts';

// Typed patches to entries other files define; see `docs/decisions/0007-typed-field-patches.md`, "Decision".

const LootPatchSchema = strictObject({
  section: literal('loot'),
  id: Id,
  add: strictObject({ entries: LootEntriesSchema }),
});

export const PatchSchema = variant('section', [LootPatchSchema]);
