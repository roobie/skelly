import { describe, expect, it } from 'vitest';
import { dominantSide, offSide } from '../src/core/character.ts';
import { meleeContactTime } from '../src/core/meleePose.ts';
import { PlayerCombat } from '../src/core/playerCombat.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION, type SaveContentKind } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { startPlayerMelee } from '../src/game/melee.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { contentLookup as lookupSaveContent } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';

const registry = baseRegistry();
const scale = makeScale(0.5);
const contentLookup = (kind: SaveContentKind, id: string): boolean => lookupSaveContent(registry, kind, id);
const saveVersion = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: SAVE_SCHEMA_VERSION,
  generators: { worldgen: 'worldgen-v2', shamblerFigure: 'shambler-figure-v1', amalgamFigure: 'amalgam-figure-v1' },
  contentPacks: [{ id: 'deadvox.base', version: '1', canonicalHash: '0'.repeat(64) }],
};

const makeSession = (restore?: Parameters<typeof createSession>[0]['restore'], handedness?: 'right' | 'left') => {
  const contacts: number[] = [];
  let session: ReturnType<typeof createSession>;
  let useDominant = false;
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
      intent: () => ({ ...IDLE, useDominant }),
      consumeDominantUse: () => {
        useDominant = false;
      },
      useDominant: () => {
        startPlayerMelee(session.playerCombat, session.sim.needs, {
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
    onRead: () => {
      throw new Error('Unexpected reading in melee fixture');
    },
    zombieEffects: { onMeleeResult: () => contacts.push(session.sim.time) },
    ...(restore ? { restore } : {}),
    ...(handedness ? { handedness } : {}),
  });
  session.zombies.setFrozen(true);
  session.sim.paused = false;
  return {
    session,
    contacts,
    click() {
      useDominant = true;
    },
  };
};

describe('player melee restore at the contact tolerance edge', () => {
  it('restores a swing whose contact resolved just inside the float tolerance and continues as the uninterrupted one', () => {
    const contactAt = meleeContactTime(
      FISTS_MELEE.cooldown,
      FISTS_MELEE.contactFraction!,
      FISTS_MELEE.windupCapSimSeconds!,
    );
    const hands = { right: null, left: null };
    const combat = () => {
      const contacts: number[] = [];
      const owner = new PlayerCombat({
        playPlayerMeleeSwing: () => undefined,
        resolvePlayerMelee: () => {
          contacts.push(1);
          return false;
        },
      });
      return { owner, contacts };
    };
    const swing = (owner: PlayerCombat) =>
      owner.beginMeleeSwing({
        origin: [0, 2, 0],
        direction: [0, 0, -1],
        weapon: FISTS_MELEE,
        profile: 'fists',
        twoHanded: false,
        hands,
      });
    const uninterrupted = combat();
    const saved = combat();
    for (const { owner } of [uninterrupted, saved]) {
      expect(swing(owner)).toBe(true);
      owner.tick(contactAt - 5e-10, hands);
    }
    const edge = saved.owner.activeMeleeAction!;
    expect(edge.elapsed).toBeLessThan(contactAt);
    expect(edge.hitResolved).toBe(true);

    const first = saved.owner.snapshotState();
    expect(saved.owner.snapshotState()).toEqual(first);
    const restored = combat();
    expect(() => restored.owner.restoreState(structuredClone(first))).not.toThrow();
    for (const step of [1 / 60, FISTS_MELEE.cooldown]) {
      uninterrupted.owner.tick(step, hands);
      restored.owner.tick(step, hands);
      expect(restored.owner.snapshotState()).toEqual(uninterrupted.owner.snapshotState());
    }
    expect(uninterrupted.contacts).toHaveLength(1);
    expect(restored.contacts).toHaveLength(0);
  });
});

describe('tick-consumed dominant melee input across save and restore', () => {
  it('retains contact ordering and physical fist alternation rather than reseeding dominance on restore', async () => {
    const source = makeSession(undefined, 'left');
    const step = 1 / 60;
    source.click();
    source.session.frame(step);
    const initial = source.session.playerCombat.activeMeleeAction!;
    expect(initial.elapsed).toBe(0);
    expect(initial.hand).toBe(dominantSide(source.session.character));
    expect('startOffset' in initial).toBe(false);
    const beforeContact = Math.ceil(initial.contactAt / step) - 1;
    expect(beforeContact).toBeGreaterThan(1);
    const beforeSave = Math.floor(beforeContact / 2);
    for (let i = 0; i < beforeSave; i++) {
      source.session.frame(step);
    }
    expect(source.session.playerCombat.activeMeleeAction?.hitResolved).toBe(false);

    const snapshot = source.session.snapshot({ worldId: 'tick-melee', characterId: 'character' });
    const bytes = await encodeSave(snapshot, {
      generation: 1,
      version: saveVersion,
      worldOptions: { blockSize: 0.5, site: 'gauntlet', storeys: 1, density: 0.5 },
    });
    const decoded = await decodeSave(bytes, { version: saveVersion, contentLookup });
    expect(snapshot.character.playerCombat.nextFistHand).toBe(offSide(source.session.character));
    const restored = makeSession(decoded.snapshot, 'right');
    expect(restored.session.playerCombat.activeMeleeAction).toEqual(source.session.playerCombat.activeMeleeAction);

    for (let tick = beforeSave; tick < beforeContact; tick++) {
      source.session.frame(step);
      restored.session.frame(step);
      expect(source.session.playerCombat.activeMeleeAction?.hitResolved).toBe(false);
      expect(restored.session.playerCombat.activeMeleeAction?.hitResolved).toBe(false);
    }
    source.session.frame(step);
    restored.session.frame(step);
    expect(source.session.playerCombat.activeMeleeAction?.hitResolved).toBe(true);
    expect(restored.session.playerCombat.activeMeleeAction?.hitResolved).toBe(true);
    expect(source.contacts).toHaveLength(1);
    expect(restored.contacts).toHaveLength(1);
    expect(restored.session.snapshot({ worldId: 'tick-melee', characterId: 'character' })).toEqual(
      source.session.snapshot({ worldId: 'tick-melee', characterId: 'character' }),
    );
    for (let tick = 0; tick <= Math.ceil(initial.cooldown / step); tick++) {
      source.session.frame(step);
      restored.session.frame(step);
    }
    expect(restored.session.playerCombat.activeMeleeAction).toBeUndefined();
    source.click();
    restored.click();
    source.session.frame(step);
    restored.session.frame(step);
    expect(source.session.playerCombat.activeMeleeAction?.hand).toBe(offSide(source.session.character));
    expect(restored.session.playerCombat.activeMeleeAction?.hand).toBe(
      source.session.playerCombat.activeMeleeAction?.hand,
    );
  });
});
