import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { defOf, weightOf } from '../src/core/items.ts';

const base = 'src/content/base';
const sources = readdirSync(base)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown }));
const { registry, issues } = buildRegistry(sources);
const ASSAULT_RIFLE = 'rifle_assault';
const DEFAULT_SLOT = 'receiver.rail.3';
const UNCERTIFIED_ATTACHMENT = /Uncertified attachment/;

describe('fitted firearm items', () => {
  it('creates removable default attachments as owned child items and renders them through the slot frame', () => {
    expect(issues).toEqual([]);
    const inventory = new Inventory(registry);
    const rifle = inventory.create(ASSAULT_RIFLE);
    const optic = rifle.slots?.[DEFAULT_SLOT];
    expect(optic).toBeDefined();
    expect(optic!.type).toBe('optic_lpvo_1_6x');
    expect(inventory.add(rifle, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.itemByUid(optic!.uid)).toBe(optic);
    expect(weightOf(registry, rifle)).toBeGreaterThan(defOf(registry, rifle.type).weight);

    const wrong = inventory.create('optic_mini_reflex');
    expect(() => inventory.fitSlot(rifle, DEFAULT_SLOT, wrong)).toThrow(UNCERTIFIED_ATTACHMENT);
    expect(inventory.fitSlot(rifle, DEFAULT_SLOT, undefined)).toBe(optic);
    expect(inventory.itemByUid(optic!.uid)).toBeUndefined();
  });
});
