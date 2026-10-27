import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildRegistry } from '../../deadvox/src/core/content.ts';
import cartridge from '../cartridges/9x19.json' with { type: 'json' };
import { exportFileText } from '../src/cli/exportFile.ts';
import { readGlb } from './glbReader.ts';

it('exports a cycling semi-auto slide with the calibre and anchors Deadvox admits', () => {
  const exported = exportFileText(readFileSync('designs/service-nine.json', 'utf8'), {
    id: 'fixture_pistol',
    file: 'assets/models/fixture_pistol.glb',
  });
  if (!exported.ok) {
    throw new Error(exported.message);
  }
  const model = exported.modelEntry;
  const action = model.gun.action!;
  expect(model.gun.calibre).toBeTruthy();
  expect(model.grip).toBeDefined();
  expect(model.anchors?.ejection).toBeDefined();
  expect(model.anchors?.muzzle).toBeDefined();
  expect(action.triggerMode).toBe('semi');
  expect(action.hand.durationSimSeconds).toBeGreaterThan(0);
  expect(action.fire!.durationSimSeconds).toBeGreaterThan(0);
  expect(action.roundsPerSimMinute).toBeGreaterThan(0);
  const glb = readGlb(exported.glb);
  expect(Object.values(action.parts).length).toBeGreaterThan(0);
  for (const part of Object.values(action.parts)) {
    expect(part.strokeMetres).toBeGreaterThan(cartridge.overallLength.max.value / 1000);
    expect(part.modes).toContain('fire');
    expect(part.modes).toContain('hand');
    expect(glb.json.nodes.some(({ name, mesh }) => name === part.node && mesh !== undefined)).toBe(true);
  }
  const items = Object.values(model.parts).map(({ item, massKg }) => ({
    id: item,
    name: item,
    category: 'misc',
    weight: massKg * 1000,
    size: [1, 1],
    workInProgress: false,
    notLoot: true,
    economy: { usage: [], tiers: [] },
  }));
  const { registry, issues } = buildRegistry([{ source: 'fixture', data: { models: [model], items } }]);
  expect(issues).toEqual([]);
  expect(registry.models.get(model.id)?.gun?.action?.triggerMode).toBe(action.triggerMode);
});
