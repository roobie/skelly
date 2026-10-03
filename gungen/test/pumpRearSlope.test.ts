import { describe, expect, it } from 'vitest';
import { connectionMismatch, resolve } from '../src/core/resolve.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { PUMP_REAR_SLOPE } from '../src/gun/parts.ts';
import { loadFixture } from './helpers.ts';

describe('pump receiver rear lean', () => {
  it('keeps the stock interface flush below the long rear taper', () => {
    const resolved = resolve(loadFixture('archetype-pump-shotgun'), gunDomain);
    const connection = resolved.connections.find(
      ({ from, to }) =>
        (from.part === 'receiver' && from.port.id === 'stock' && to.part === 'stock') ||
        (to.part === 'receiver' && to.port.id === 'stock' && from.part === 'stock'),
    );
    expect(connection).toBeDefined();
    if (!connection) {
      throw new Error('Pump receiver stock connection is missing.');
    }
    const mismatch = connectionMismatch(connection, resolved.placed);
    expect(mismatch?.distance).toBeLessThan(1e-8);
    expect(mismatch?.angle).toBeLessThan(2e-6);
    const receiverPort = connection.from.part === 'receiver' ? connection.from.port : connection.to.port;
    const stockPort = connection.from.part === 'stock' ? connection.from.port : connection.to.port;
    expect(receiverPort.normal).toEqual([-1, 0, 0]);
    expect(stockPort.normal).toEqual([1, 0, 0]);
    expect(receiverPort.pos).toEqual([-16, -1, 0]);
    const rearTopAtPort = Math.min(
      ...PUMP_REAR_SLOPE.clip.map(({ normal, offset }) => (offset - normal[0] * receiverPort.pos[0]) / normal[1]),
    );
    expect(receiverPort.pos[1]).toBeLessThan(rearTopAtPort);
  });
});
