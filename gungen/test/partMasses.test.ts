import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Assembly, Domain, PartDef } from '@skelly/engine/assembly/schema.ts';
import { partNodeName } from '@skelly/thing-export/glb.ts';
import { expect, it } from 'vitest';
import { ATTACHMENT_IDS, attachmentInstanceForId } from '../src/gun/attachments.ts';
import { loadPartCatalogue, PART_CATALOGUE } from '../src/gun/catalogue.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { GUN_FINISH_SLOTS, GUN_PALETTE } from '../src/gun/palette.ts';
import { gunModelParts, PartMassError } from '../src/gun/physical.ts';
import {
  PART_FIXTURE_CONTENT,
  PART_FIXTURE_DOMAIN,
  PART_FIXTURE_ITEMS,
  partFixtureAssembly,
  partFixtureCatalogue,
} from './partFixture.ts';

const MASS_CONTEXT = /mass-fixture.*body.*fixture.*plain.*matched/;
const AMBIGUOUS_ROWS = /plain-body, second-body/;
const NO_TAB_ITEM = /no tab item/;
const BUILT_OTHERWISE = /built with size/;
const FINISH_AMBIGUITY = /name one of the items fixture_tab, fixture_refinished_tab/;

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

const catalogue = partFixtureCatalogue();
// The clip is the replaceable child in both fixture assemblies.
const REPLACEABLE = new Set([partNodeName('clip', 'tab')]);

const resolvedFixture = (assembly: Assembly) => {
  const resolved = resolve(assembly, PART_FIXTURE_DOMAIN);
  if (resolved.issues.length > 0) {
    throw new Error(`fixture assembly does not resolve: ${JSON.stringify(resolved.issues)}`);
  }
  return resolved;
};

const fixtureParts = (assembly: Assembly, items: Readonly<Record<string, string>> = PART_FIXTURE_ITEMS) =>
  gunModelParts(resolvedFixture(assembly), REPLACEABLE, { catalogue, items });

it('refuses export with no matching authored mass row or several matching rows', () => {
  const domain = fixtureDomain();
  const resolved = resolve(
    { name: 'mass-fixture', root: 'body', parts: { body: { family: 'fixture' } }, connections: [] },
    domain,
  );
  expect(resolved.issues).toEqual([]);
  const row = { id: 'plain-body', family: 'fixture', match: { style: 'plain' }, massKg: 1 };
  const rows = (parts: readonly object[]) => loadPartCatalogue({ placementParams: [], parts }, domain);
  expect(gunModelParts(resolved, new Set(), { catalogue: rows([row]) }).body?.massKg).toBe(row.massKg);
  const ambiguous = rows([row, { ...row, id: 'second-body', match: {} }]);
  for (const candidate of [rows([]), ambiguous]) {
    expect(() => gunModelParts(resolved, new Set(), { catalogue: candidate })).toThrow(MASS_CONTEXT);
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
  const parts = fixtureParts(partFixtureAssembly('front', 'flat'));
  expect(Object.keys(parts).sort()).toEqual(Object.keys(PART_FIXTURE_ITEMS).sort());
  for (const [id, itemId] of Object.entries(PART_FIXTURE_ITEMS)) {
    expect(parts[id]).toMatchObject({ item: itemId, massKg: catalogue.items.get(itemId)?.massKg });
  }
});

it('gives one item the same identity and mass wherever an assembly places it', () => {
  const [here, there] = [partFixtureAssembly('front', 'flat'), partFixtureAssembly('top', 'raised')].map(
    (assembly) => fixtureParts(assembly).tab,
  );
  expect(here?.item).toBe(PART_FIXTURE_ITEMS.tab);
  expect(there).toMatchObject({ item: here?.item, massKg: here?.massKg });
  expect(there?.centreOfMass).not.toEqual(here?.centreOfMass);
});

it('refuses an item reference that names another family or a part built otherwise', () => {
  const assembly = partFixtureAssembly('front', 'flat');
  expect(() => fixtureParts(assembly, { ...PART_FIXTURE_ITEMS, tab: PART_FIXTURE_ITEMS.frame })).toThrow(NO_TAB_ITEM);
  const large = { ...assembly, parts: { ...assembly.parts, tab: { family: 'tab', params: { size: 'large' } } } };
  expect(() => fixtureParts(large)).toThrow(PartMassError);
  expect(() => fixtureParts(large)).toThrow(BUILT_OTHERWISE);
});

it('keeps two finishes of one construction as distinct items and refuses a true duplicate', () => {
  const tab = PART_FIXTURE_CONTENT.parts.find(({ id }) => id === PART_FIXTURE_ITEMS.tab)!;
  const [slot] = GUN_FINISH_SLOTS;
  const [first, second] = Object.keys(GUN_PALETTE.materials ?? {});
  const finished = { ...tab, finish: { [slot!]: first! } };
  const refinished = { ...tab, id: 'fixture_refinished_tab', finish: { [slot!]: second! } };
  const content = { ...PART_FIXTURE_CONTENT, parts: [...PART_FIXTURE_CONTENT.parts, refinished] };
  const variants = partFixtureCatalogue({
    ...content,
    parts: content.parts.map((part) => (part.id === tab.id ? finished : part)),
  });
  expect(variants.items.get(refinished.id)?.finish).not.toEqual(variants.items.get(tab.id)?.finish);
  const assembly = partFixtureAssembly('front', 'flat');
  const exported = (items: Readonly<Record<string, string>>) =>
    gunModelParts(resolvedFixture(assembly), REPLACEABLE, { catalogue: variants, items });
  expect(exported({ ...PART_FIXTURE_ITEMS, tab: refinished.id }).tab?.item).toBe(refinished.id);
  expect(exported(PART_FIXTURE_ITEMS).tab?.item).toBe(tab.id);
  // A part that names no item cannot choose between finishes, so its mass is refused rather than picked.
  expect(() => exported({ frame: PART_FIXTURE_ITEMS.frame })).toThrow(FINISH_AMBIGUITY);
  expect(() =>
    partFixtureCatalogue({ ...content, parts: [...content.parts, { ...refinished, id: 'fixture_twin' }] }),
  ).toThrow('two catalogue items build the same part in the same finish');
});

it('names the missing half when a catalogue entry has construction params but no finish', () => {
  const [item] = PART_FIXTURE_CONTENT.parts;
  const { finish: _finish, ...unfinished } = item!;
  expect(() =>
    partFixtureCatalogue({ ...PART_FIXTURE_CONTENT, parts: [unfinished, ...PART_FIXTURE_CONTENT.parts.slice(1)] }),
  ).toThrow('needs both params and finish');
});
