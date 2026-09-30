import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { decodeSave, encodeSave, type SaveContentKind } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { SoundPicker } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import { FISTS_MELEE } from '../src/core/zombies.ts';
import { startPlayerMelee } from '../src/game/melee.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const scale = makeScale(0.5);
const contentLookup = (kind: SaveContentKind, id: string): boolean => {
  if (kind === 'block') {
    return registry.blockIds.has(id);
  }
  if (kind === 'item') {
    return registry.items.has(id);
  }
  if (kind === 'furniture') {
    return registry.furniture.has(id);
  }
  if (kind === 'zombie') {
    return registry.zombies.has(id);
  }
  if (kind === 'sound') {
    return registry.sounds.has(id);
  }
  return ['needs', 'player', 'zombies', 'handling', 'lights'].includes(id);
};
const saveVersion = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: 5,
  generators: { worldgen: 'worldgen-v1', shamblerFigure: 'shambler-figure-v1' },
  contentPacks: [{ id: 'deadvox.base', version: '1', canonicalHash: '0'.repeat(64) }],
};

const makeSession = (restore?: Parameters<typeof createSession>[0]['restore']) => {
  const audio = new SoundPicker(13, registry.sounds);
  const contacts: number[] = [];
  let session: ReturnType<typeof createSession>;
  session = createSession({
    registry,
    world: new World(),
    isSolid: () => false,
    scale,
    seed: 13,
    start: 43_200,
    spawn: [0, 4, 0],
    ready: () => false,
    controls: {
      active: () => false,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: {
      play: () => false,
      snapshotState: () => audio.snapshotState(),
      restoreState: (state) => audio.restoreState(state),
    },
    notice: () => undefined,
    zombieEffects: { onMeleeResult: () => contacts.push(session.sim.time) },
    ...(restore ? { restore } : {}),
  });
  session.zombies.setFrozen(true);
  session.sim.paused = false;
  return { session, contacts };
};

describe('melee click timing after session restore', () => {
  it('preserves the sub-tick origin and contacts on the first eligible tick', async () => {
    const source = makeSession();
    source.session.frame(0.049);
    const snapshot = source.session.snapshot({ worldId: 'melee-time', characterId: 'character' });
    const bytes = await encodeSave(snapshot, {
      generation: 1,
      version: saveVersion,
      worldOptions: { blockSize: 0.5, site: 'hamlet', storeys: 1 },
    });
    const decoded = await decodeSave(bytes, { version: saveVersion, contentLookup });
    const restored = makeSession(decoded.snapshot);

    for (const run of [source, restored]) {
      const { session, contacts } = run;
      const clickTime = session.sim.time;
      const cursor = session.sim.scheduler.snapshotState().systems.find(({ id }) => id === 'zombies')!;
      expect(cursor.done).toBe(0);
      const startOffset = Math.min(0.05, Math.max(0, clickTime - session.lastZombieStep));
      expect(
        startPlayerMelee(session.zombies, session.sim.needs, {
          origin: [0, 2, 0],
          direction: [0, 0, -1],
          weapon: FISTS_MELEE,
          profile: 'fists',
          twoHanded: false,
          hands: { right: null, left: null },
          startOffset,
        }),
      ).toBe('started');

      for (let i = 0; i < 250; i++) {
        session.frame(0.001);
      }
      expect(contacts).toEqual([]);
      expect(session.sim.time - clickTime).toBeCloseTo(0.25, 9);
      session.frame(0.001);
      expect(contacts).toEqual([0.3]);
      expect(contacts[0]! - clickTime).toBeCloseTo(0.251, 9);
    }
  });
});
