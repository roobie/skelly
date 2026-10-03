import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/core/canonicalJson.ts';
import { buildRegistry } from '../src/core/content.ts';
import { decodeSave, encodeSave, type SaveContentKind } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
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
  schemaVersion: 7,
  generators: { worldgen: 'worldgen-v1', shamblerFigure: 'shambler-figure-v1' },
  contentPacks: [{ id: 'deadvox.base', version: '1', canonicalHash: '0'.repeat(64) }],
};

const makeSession = (restore?: Parameters<typeof createSession>[0]['restore']) => {
  const contacts: number[] = [];
  let session: ReturnType<typeof createSession>;
  let primaryAction = false;
  session = createSession({
    registry,
    world: new World(),
    isSolid: () => false,
    isOpaque: () => false,
    scale,
    seed: 13,
    start: 43_200,
    spawn: [0, 4, 0],
    ready: () => false,
    controls: {
      active: () => true,
      intent: () => ({ ...IDLE, primaryAction }),
      consumePrimaryAction: () => {
        primaryAction = false;
      },
      primaryAction: () => {
        startPlayerMelee(session.zombies, session.sim.needs, {
          origin: [0, 2, 0],
          direction: [0, 0, -1],
          weapon: FISTS_MELEE,
          profile: 'fists',
          twoHanded: false,
          hands: { right: null, left: null },
        });
      },
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: {
      play: () => undefined,
    },
    notice: () => undefined,
    zombieEffects: { onMeleeResult: () => contacts.push(session.sim.time) },
    ...(restore ? { restore } : {}),
  });
  session.zombies.setFrozen(true);
  session.sim.paused = false;
  return {
    session,
    contacts,
    click() {
      primaryAction = true;
    },
  };
};

describe('tick-consumed primary melee input across save and restore', () => {
  it('starts on the next player tick and contacts exactly fifteen 60 Hz ticks later, with or without restore', async () => {
    const source = makeSession();
    source.click();
    source.session.frame(1 / 60);
    expect(source.session.zombies.activeMeleeAction?.elapsed).toBe(0);
    expect('startOffset' in (source.session.zombies.activeMeleeAction ?? {})).toBe(false);
    for (let i = 0; i < 7; i++) {
      source.session.frame(1 / 60);
    }
    expect(source.session.zombies.activeMeleeAction?.elapsed).toBeCloseTo(7 / 60, 12);

    const snapshot = source.session.snapshot({ worldId: 'tick-melee', characterId: 'character' });
    const bytes = await encodeSave(snapshot, {
      generation: 1,
      version: saveVersion,
      worldOptions: { blockSize: 0.5, site: 'hamlet', storeys: 1, density: 0.5 },
    });
    const decoded = await decodeSave(bytes, { version: saveVersion, contentLookup });
    const restored = makeSession(decoded.snapshot);
    expect(restored.session.zombies.activeMeleeAction?.elapsed).toBeCloseTo(7 / 60, 12);

    for (let tick = 8; tick <= 14; tick++) {
      source.session.frame(1 / 60);
      restored.session.frame(1 / 60);
      expect(source.session.zombies.activeMeleeAction?.hitResolved).toBe(false);
      expect(restored.session.zombies.activeMeleeAction?.hitResolved).toBe(false);
      expect(source.session.zombies.activeMeleeAction?.elapsed).toBeCloseTo(tick / 60, 12);
      expect(restored.session.zombies.activeMeleeAction?.elapsed).toBeCloseTo(tick / 60, 12);
    }
    source.session.frame(1 / 60);
    restored.session.frame(1 / 60);
    expect(source.session.zombies.activeMeleeAction?.elapsed).toBeCloseTo(0.25, 12);
    expect(restored.session.zombies.activeMeleeAction?.elapsed).toBeCloseTo(0.25, 12);
    expect(source.session.zombies.activeMeleeAction?.hitResolved).toBe(true);
    expect(restored.session.zombies.activeMeleeAction?.hitResolved).toBe(true);
    const hash = (run: ReturnType<typeof makeSession>) =>
      createHash('sha256')
        .update(canonicalJson(run.session.snapshot({ worldId: 'tick-melee', characterId: 'character' })))
        .digest('hex');
    expect(restored.session.snapshot({ worldId: 'tick-melee', characterId: 'character' })).toEqual(
      source.session.snapshot({ worldId: 'tick-melee', characterId: 'character' }),
    );
    expect(hash(restored)).toBe(hash(source));
  });
});
