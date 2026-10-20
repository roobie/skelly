import { expect, it } from 'vitest';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';

it('matches keys to actual kit-piece doors and rejects a missing key or an unused lock declaration', () => {
  const data = {
    doorMaterials: [{ id: 'fixture_material', methods: [] }],
    furniture: [
      {
        id: 'kit_door',
        name: 'Kit door',
        size: [1, 1, 1],
        color: '#666666',
        door: { material: 'fixture_material', methods: {}, handlingSimSeconds: 0.3 },
      },
    ],
    items: [
      {
        id: 'kit_key',
        name: 'Kit key',
        category: 'tool',
        weight: 10,
        size: [1, 1],
        key: { lock: 'kit_lock' },
      },
    ],
    mapStyles: [{ id: 'kit_style', bindings: { air: { role: 'opening', block: 'air' } } }],
    mapPieces: [
      {
        id: 'kit_door',
        size: [1, 1, 1],
        layers: [['D']],
        style: 'kit_style',
        lootContext: { usage: [], tier: 'Tier1' },
        palette: {
          D: { furniture: 'kit_door', lock: { id: 'kit_lock', locked: true } },
          '.': { role: 'opening', material: 'air' },
        },
        ownership: { layers: [['S']] },
        anchors: {},
        ports: [],
      },
    ],
  };
  expect(buildRegistry([{ source: 'kit-lock.json', data }]).issues).toEqual([]);
  expect(buildRegistry([{ source: 'kit-lock.json', data: { ...data, items: [] } }]).issues).toContainEqual({
    source: 'kit-lock.json',
    path: 'mapPieces[0].palette',
    message: 'no key names lock "kit_lock"',
  });
  const unused = {
    ...data,
    mapPieces: data.mapPieces.map((piece) => ({ ...piece, layers: [['.']], ownership: { layers: [['A']] } })),
  };
  expect(buildRegistry([{ source: 'kit-lock.json', data: unused }]).issues).toContainEqual({
    source: 'kit-lock.json',
    path: 'items[0].key.lock',
    message: 'no door has lock "kit_lock"',
  });
});
