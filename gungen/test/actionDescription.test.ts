import { expect, it } from 'vitest';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { actionOpenOffsets, resolveGunAction } from '../src/gun/actionDescription.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { buildLayers, disposeGroup } from '../src/viewer/scene.ts';
import { loadFixture } from './helpers.ts';

it('discovers the pump open-pose pair after receiver/carrier/forend renames without moving validation or export', () => {
  const original = loadFixture('archetype-pump-shotgun');
  const rename = (id: string): string =>
    ({ receiver: 'housing', 'bolt-carrier': 'slide', forend: 'pump-grip' })[id] ?? id;
  const endpoint = (ref: string): string => {
    const [id, port] = ref.split('.');
    return `${rename(id!)}.${port}`;
  };
  const assembly: Assembly = {
    ...original,
    root: rename(original.root),
    parts: Object.fromEntries(Object.entries(original.parts).map(([id, part]) => [rename(id), part])),
    connections: original.connections.map((connection) => ({
      ...connection,
      from: endpoint(connection.from),
      to: endpoint(connection.to),
    })),
  };
  const report = validate(assembly, gunDomain);
  expect(report.issues).toEqual([]);
  const before = [...report.resolved.placed].map(([id, pose]) => [id, pose.t]);
  const action = resolveGunAction(report.resolved)!;
  expect(action.cycle.fire).toBeUndefined();
  expect(action.carrier.modes).toEqual(['hand']);
  const offsets = actionOpenOffsets(action);
  expect([...offsets.keys()]).toEqual(['slide', 'pump-grip']);
  for (const offset of offsets.values()) {
    expect(offset).toEqual([-5.5, 0, 0].map((value) => expect.closeTo(value, 12)));
  }
  const layers = buildLayers(report, [], 'role', {}, 32, offsets);
  try {
    expect([...report.resolved.placed].map(([id, pose]) => [id, pose.t])).toEqual(before);
    const exported = exportGunGlb(assembly, { id: 'pump_test', file: 'assets/models/pump_test.glb' }, {});
    expect(exported.ok).toBe(true);
    if (!exported.ok) {
      throw new Error('pump export failed');
    }
    expect(exported.modelEntry.action?.fire).toBeUndefined();
    expect(exported.modelEntry.action?.parts.forend?.node).toBe('pump-grip:forend');
    expect([...resolve(assembly, gunDomain).placed].map(([id, pose]) => [id, pose.t])).toEqual(before);
  } finally {
    for (const group of Object.values(layers)) {
      disposeGroup(group);
    }
  }
});
