import { readFileSync } from 'node:fs';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Domain, PartDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import { partNodeName } from '@skelly/thing-export/glb.ts';
import { expect, it } from 'vitest';
import { ATTACHMENT_IDS, attachmentInstanceForId } from '../src/gun/attachments.ts';
import catalogueContent from '../src/gun/catalogue.json' with { type: 'json' };
import { loadPartCatalogue, PART_CATALOGUE } from '../src/gun/catalogue.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { gunModelParts, type PartItems, PartMassError } from '../src/gun/physical.ts';

const MASS_CONTEXT = /mass-fixture.*body.*fixture.*plain.*matched/;
const AMBIGUOUS_ROWS = /plain-body, second-body/;
const NO_GRIP_ITEM = /no grip item/;
const BUILT_OTHERWISE = /built with length/;

const fixtureDomain = (): Domain => {
  const part: PartDef = { family: 'fixture', solids: [], ports: [], axes: [], keepOuts: [] };
  return {
    name: 'fixture',
    units: { metresPerUnit: 1, grid: 1, bevel: 0 },
    axisRules: [],
    families: {
      fixture: { name: 'fixture', params: { style: { values: ['plain'], default: 'plain' } }, build: () => part },
    },
  };
};

// The pilot design: its body parts name catalogue items, its magazine and optic are replaceable children.
const pilot = (): { readonly resolved: Resolved; readonly items: PartItems; readonly replaceable: Set<string> } => {
  const loaded = loadGunDesign(readFileSync(new URL('../designs/archetype-ar.json', import.meta.url), 'utf8'));
  if (!(loaded.ok && loaded.design.items)) {
    throw new Error('the pilot design does not load with item references');
  }
  const { assembly, items } = loaded.design;
  const resolved = resolve(assembly, gunDomain);
  const replaceable = new Set(
    Object.entries(assembly.parts)
      .filter(([id]) => items[id] === undefined)
      .map(([id, part]) => partNodeName(id, part.family)),
  );
  return { resolved, items, replaceable };
};

it('refuses export with no matching authored mass row or several matching rows', () => {
  const domain = fixtureDomain();
  const resolved = resolve(
    { name: 'mass-fixture', root: 'body', parts: { body: { family: 'fixture' } }, connections: [] },
    domain,
  );
  expect(resolved.issues).toEqual([]);
  const row = { id: 'plain-body', family: 'fixture', match: { style: 'plain' }, massKg: 1 };
  const catalogue = (parts: readonly object[]) => loadPartCatalogue({ placementParams: [], parts }, domain);
  expect(gunModelParts(resolved, new Set(), { catalogue: catalogue([row]) }).body?.massKg).toBe(row.massKg);
  const ambiguous = catalogue([row, { ...row, id: 'second-body', match: {} }]);
  for (const rows of [catalogue([]), ambiguous]) {
    expect(() => gunModelParts(resolved, new Set(), { catalogue: rows })).toThrow(MASS_CONTEXT);
  }
  expect(() => gunModelParts(resolved, new Set(), { catalogue: ambiguous })).toThrow(AMBIGUOUS_ROWS);
});

it('gives every choice of every body family param a mass row that admits it', () => {
  // Fitted attachments and the magazine are replaceable items; gunModelParts takes their mass from the item.
  const replaceable = new Set(['magazine', ...ATTACHMENT_IDS.map((id) => attachmentInstanceForId(id).family)]);
  const unmassed: string[] = [];
  for (const [family, def] of Object.entries(gunDomain.families)) {
    if (replaceable.has(family)) {
      continue;
    }
    const familyRows = PART_CATALOGUE.entries.filter((row) => row.family === family);
    if (familyRows.length === 0) {
      unmassed.push(family);
    }
    for (const [name, param] of Object.entries(def.params)) {
      for (const value of param.values) {
        if (!familyRows.some((row) => row.match[name] === undefined || row.match[name] === value)) {
          unmassed.push(`${family}.${name}=${value}`);
        }
      }
    }
  }
  expect(unmassed).toEqual([]);
});

it('weighs a fitted item by its own mass and leaves replaceable children out of the body', () => {
  const { resolved, items, replaceable } = pilot();
  expect(replaceable.size).toBeGreaterThan(0);
  const parts = gunModelParts(resolved, replaceable, { items });
  expect(Object.keys(parts).sort()).toEqual(Object.keys(items).sort());
  for (const [id, itemId] of Object.entries(items)) {
    expect(parts[id]).toMatchObject({ item: itemId, massKg: PART_CATALOGUE.items.get(itemId)?.massKg });
  }
});

it('gives one item the same identity and mass wherever an assembly places it', () => {
  const { resolved, items, replaceable } = pilot();
  const moved = resolve({ ...resolved.assembly, root: 'barrel' }, gunDomain);
  const [here, there] = [resolved, moved].map((r) => gunModelParts(r, replaceable, { items }).receiver);
  expect(here?.item).toBe(items.receiver);
  expect(there).toMatchObject({ item: here?.item, massKg: here?.massKg });
  expect(there?.centreOfMass).not.toEqual(here?.centreOfMass);
});

it('refuses an item reference that names another family or a part built otherwise', () => {
  const { resolved, items, replaceable } = pilot();
  expect(() => gunModelParts(resolved, replaceable, { items: { ...items, grip: items.stock! } })).toThrow(NO_GRIP_ITEM);
  const barrel = PART_CATALOGUE.items.get(items.barrel!)!;
  const length = gunDomain.families.barrel!.params.length!.values.find((value) => value !== barrel.params.length)!;
  const rebuilt = loadPartCatalogue({
    ...catalogueContent,
    parts: catalogueContent.parts.map((entry) =>
      entry.id === barrel.id
        ? { ...entry, match: { ...entry.match, length }, params: { ...barrel.params, length } }
        : entry,
    ),
  });
  expect(() => gunModelParts(resolved, replaceable, { catalogue: rebuilt, items })).toThrow(PartMassError);
  expect(() => gunModelParts(resolved, replaceable, { catalogue: rebuilt, items })).toThrow(BUILT_OTHERWISE);
});

it('refuses a catalogue in which two items build the same part', () => {
  const [item] = PART_CATALOGUE.items.values();
  expect(() =>
    loadPartCatalogue({ ...catalogueContent, parts: [...catalogueContent.parts, { ...item, id: 'fixture_twin' }] }),
  ).toThrow('two catalogue items build the same part');
});
