import type { AbilityDef } from '@skelly/engine/content';
import { type CastProjectileState, realSeconds } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';
import { CastShots } from '../src/render/castShots.ts';

const BLOCK_SIZE = 0.5;
const LOOK: AbilityDef['projectile'] = {
  core: { color: '#ffffff', radiusMetres: 0.05 },
  halo: { color: '#ffffff', radiusMetres: 0.1 },
  light: { color: '#ffffff', intensity: 1, radiusMetres: 1 },
  trail: {
    color: '#ffffff',
    spacingMetres: 0.1,
    sizeMetres: 0.01,
    lifeRealSeconds: realSeconds(0.1),
    driftMetresPerRealSecond: 0,
  },
  impact: { color: '#ffffff', radiusMetres: 0.1, lifeRealSeconds: realSeconds(0.1) },
};
const FRAME = 1 / 60;

const shot = (): CastProjectileState => ({
  casterId: 'caster',
  abilityId: 'ability',
  damageKind: 'blunt',
  damage: 1,
  pos: [3, 4, 5],
  direction: [1, 0, 0],
  speedMetresPerSimSecond: 30,
  rangeMetres: 40,
  remainingMetres: 40,
});

describe('cast shots', () => {
  it('flashes where a shot ended in its launch step, though it was never drawn in flight', () => {
    const shots = new CastShots(BLOCK_SIZE, () => LOOK);
    const ended = shot();
    shots.ended({ shot: ended, cause: 'actor' });
    shots.sync([], 0, FRAME);
    expect(shots.glows().map(({ position }) => position)).toEqual([ended.pos.map((block) => block * BLOCK_SIZE)]);
  });

  it('leaves no flash for a drawn shot that vanished without ending, as a load drops it', () => {
    const shots = new CastShots(BLOCK_SIZE, () => LOOK);
    const dropped = shot();
    shots.sync([dropped], 0, FRAME);
    expect(shots.glows()).toHaveLength(1);
    shots.sync([], 0, FRAME);
    expect(shots.glows()).toEqual([]);
  });
});
