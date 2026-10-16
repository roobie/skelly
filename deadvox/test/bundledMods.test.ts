import { describe, expect, it } from 'vitest';
import { currentSaveVersionIdentity, decodeSave, encodeSave } from '../src/core/saveFormat.ts';
import { perceivePlayer } from '../src/core/zombies.ts';
import { baseSources, buildBundledContent } from '../src/game/bundledContent.ts';
import { BEGINNER_FACTORS, bundledModIdsFromUrl, selectBundledMods } from '../src/game/bundledMods.ts';
import { capture, contentLookup, createRuntime, formatWorldOptions } from './snapshotTestSupport.ts';

const base = buildBundledContent().registry;
const PACKS_DIFFER = /content packs differ/;

describe('beginner bundled mod', () => {
  const beginner = selectBundledMods(['beginner']);

  it('is admitted without issues', () => {
    expect(beginner.issues).toEqual([]);
    expect(beginner.admitted.map(({ id }) => id)).toEqual(['beginner']);
  });

  it('scales every hostile kind by its factor for damage, speed, detection and health', () => {
    expect(beginner.content.registry.zombies.size).toBe(base.zombies.size);
    for (const [id, plain] of base.zombies) {
      const easy = beginner.content.registry.zombies.get(id)!;
      expect(easy, id).toBeDefined();
      plain.attack.moves.forEach((move, index) => {
        expect(easy.attack.moves[index]!.damage).toBeCloseTo(move.damage * BEGINNER_FACTORS.damage, 9);
      });
      expect(easy.speed.wanderMetresPerSimSecond).toBeCloseTo(
        plain.speed.wanderMetresPerSimSecond * BEGINNER_FACTORS.speed,
        9,
      );
      expect(easy.speed.chaseMetresPerSimSecond).toBeCloseTo(
        plain.speed.chaseMetresPerSimSecond * BEGINNER_FACTORS.speed,
        9,
      );
      for (const key of ['sight', 'nightSight', 'hearing'] as const) {
        expect(easy[key]).toBeCloseTo(plain[key] * BEGINNER_FACTORS.detection, 9);
      }
      for (const [region, health] of Object.entries(plain.regions)) {
        expect(easy.regions[region]).toBeCloseTo(health * BEGINNER_FACTORS.health, 9);
      }
    }
  });

  it('follows base tuning instead of copying numbers', () => {
    const tuned = baseSources.map((source) => {
      const { zombies } = source.data as { zombies?: { attack: { moves: { damage: number }[] } }[] };
      if (!zombies) {
        return source;
      }
      const copy = structuredClone(source.data) as { zombies: { attack: { moves: { damage: number }[] } }[] };
      for (const zombie of copy.zombies) {
        zombie.attack.moves[0]!.damage += 10;
      }
      return { ...source, data: copy };
    });
    const [first] = [...base.zombies.values()];
    const result = selectBundledMods(['beginner'], tuned);
    const row = result.content.registry.zombies.get(first!.id)!;
    expect(row.attack.moves[0]!.damage).toBeCloseTo((first!.attack.moves[0]!.damage + 10) * BEGINNER_FACTORS.damage, 9);
  });

  it('leaves content unchanged when no bundled mod is asked for', () => {
    const none = selectBundledMods(bundledModIdsFromUrl(new URLSearchParams('seed=3')));
    expect(none.issues).toEqual([]);
    expect(none.admitted).toEqual([]);
    expect(none.content.registry.zombies).toEqual(base.zombies);
  });

  it('refuses an unknown bundled id visibly', () => {
    const result = selectBundledMods(bundledModIdsFromUrl(new URLSearchParams('mods=beginner,nonesuch')));
    expect(result.issues).toEqual([expect.objectContaining({ message: expect.stringContaining('nonesuch') })]);
  });

  it('keeps the mods panel switch out of the bundled id list', () => {
    expect(bundledModIdsFromUrl(new URLSearchParams('mods=1'))).toEqual([]);
  });
});

describe('beginner mode saves', () => {
  it('loads back only under the mode it was saved in', async () => {
    const beginner = await currentSaveVersionIdentity(selectBundledMods(['beginner']).admitted);
    const normal = await currentSaveVersionIdentity();
    expect(beginner.digest).not.toBe(normal.digest);
    const bytes = await encodeSave(capture(createRuntime()), {
      generation: 1,
      version: beginner.components,
      worldOptions: formatWorldOptions,
    });
    const decoded = await decodeSave(bytes, { version: beginner.components, contentLookup });
    expect(decoded.versionIdentity.digest).toBe(beginner.digest);
    await expect(decodeSave(bytes, { version: normal.components, contentLookup })).rejects.toThrow(PACKS_DIFFER);
    const normalBytes = await encodeSave(capture(createRuntime()), {
      generation: 1,
      version: normal.components,
      worldOptions: formatWorldOptions,
    });
    await expect(decodeSave(normalBytes, { version: beginner.components, contentLookup })).rejects.toThrow(
      PACKS_DIFFER,
    );
  });
});

describe('beginner mode light spotting', () => {
  const farthestSpotted = (zombie: ReturnType<typeof base.zombies.get>): number => {
    let farthest = 0;
    for (let metres = 0.5; metres <= 150; metres += 0.5) {
      const seen = perceivePlayer({
        zombie: zombie!,
        from: [0, 1, 0],
        facing: [1, 0, 0],
        player: {
          pos: [metres / 0.5, 1, 0],
          facing: [-1, 0, 0],
          movement: 'still',
          lit: true,
          lightSeenFrom: 40,
          sunlit: false,
        },
        dayPhase: 'night',
        sightBlend: 0,
        blockSize: 0.5,
        isSolid: () => false,
        tuning: base.senses.get('player')!,
      });
      if (seen) {
        farthest = metres;
      }
    }
    return farthest;
  };

  it('spots a carried light from a shorter range than without the mod', () => {
    const beginner = selectBundledMods(['beginner']).content.registry;
    for (const [id, plain] of base.zombies) {
      const lightOnly = { ...beginner.zombies.get(id)!, sight: plain.sight, nightSight: plain.nightSight };
      expect(farthestSpotted(lightOnly), id).toBeLessThan(farthestSpotted(plain));
    }
  });
});
