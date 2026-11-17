import { check, literal, nonEmpty, optional, pipe, strictObject, variant } from 'valibot';
import { LootEntriesSchema } from './loot.ts';
import { Id } from './primitives.ts';
import { keyedRows, START_ROW_KEYS, StartAbilitySchema, StartKitEntrySchema, StartPoolSchema } from './starts.ts';

// Typed patches to entries other files define; see `docs/decisions/0007-typed-field-patches.md`, "Decision".

const LootPatchSchema = strictObject({
  section: literal('loot'),
  id: Id,
  add: strictObject({ entries: LootEntriesSchema }),
});

// Adding rows by key, never replacing them, lets packs that add different rows to one start all apply.
const StartPatchSchema = strictObject({
  section: literal('starts'),
  id: Id,
  add: pipe(
    strictObject({
      kit: optional(pipe(keyedRows(StartKitEntrySchema, START_ROW_KEYS.kit), nonEmpty('needs at least one row'))),
      abilities: optional(
        pipe(keyedRows(StartAbilitySchema, START_ROW_KEYS.abilities), nonEmpty('needs at least one row')),
      ),
      pools: optional(pipe(keyedRows(StartPoolSchema, START_ROW_KEYS.pools), nonEmpty('needs at least one row'))),
    }),
    check((add) => Object.values(add).some((rows) => rows !== undefined), 'needs at least one list to add'),
  ),
});

export const PatchSchema = variant('section', [LootPatchSchema, StartPatchSchema]);
