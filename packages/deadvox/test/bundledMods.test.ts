import { describe, expect, it } from 'vitest';
import { currentSaveVersionIdentity, decodeSave, encodeSave } from '../src/core/saveFormat.ts';
import { perceivePlayer } from '../src/core/zombies.ts';
import { buildBundledContent } from '../src/game/bundledContent.ts';
import { bundledModIdsFromUrl, selectBundledMods } from '../src/game/bundledMods.ts';
import { reuseBundledBuilds } from './bundledContentReuse.ts';
import { capture, contentLookup, createRuntime, formatWorldOptions } from './snapshotTestSupport.ts';

const base = buildBundledContent().registry;
const PACKS_DIFFER = /content packs differ/;
// Admitted once; every case below reads it and none changes it.
const beginner = selectBundledMods(['beginner']);
reuseBundledBuilds();

describe('beginner bundled mod', () => {
  it('is admitted without issues', () => {
    expect(beginner.issues).toEqual([]);
    expect(beginner.admitted.map(({ id }) => id)).toEqual(['beginner']);
  });

  it('scales every hostile kind consistently from its core row', () => {
    const [firstId, firstPlain] = base.zombies.entries().next().value!;
    const firstEasy = beginner.content.registry.zombies.get(firstId)!;
    const factors = {
      damage: firstEasy.attack.moves[0]!.damage / firstPlain.attack.moves[0]!.damage,
      speed: firstEasy.speed.wanderMetresPerSimSecond / firstPlain.speed.wanderMetresPerSimSecond,
      detection: firstEasy.sight / firstPlain.sight,
      health: firstEasy.regions.head! / firstPlain.regions.head!,
    };
    expect(beginner.content.registry.zombies.size).toBe(base.zombies.size);
    for (const [id, plain] of base.zombies) {
      const easy = beginner.content.registry.zombies.get(id)!;
      expect(easy, id).toBeDefined();
      plain.attack.moves.forEach((move, index) => {
        expect(easy.attack.moves[index]!.damage).toBeCloseTo(move.damage * factors.damage, 9);
      });
      expect(easy.speed.wanderMetresPerSimSecond).toBeCloseTo(plain.speed.wanderMetresPerSimSecond * factors.speed, 9);
      expect(easy.speed.chaseMetresPerSimSecond).toBeCloseTo(plain.speed.chaseMetresPerSimSecond * factors.speed, 9);
      for (const key of ['sight', 'nightSight', 'hearing'] as const) {
        expect(easy[key]).toBeCloseTo(plain[key] * factors.detection, 9);
      }
      expect(easy.lightSightScale).toBeCloseTo((plain.lightSightScale ?? 1) * factors.detection, 9);
      for (const [region, health] of Object.entries(plain.regions)) {
        expect(easy.regions[region]).toBeCloseTo(health * factors.health, 9);
      }
    }
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
    const easy = await currentSaveVersionIdentity(beginner.admitted);
    const normal = await currentSaveVersionIdentity();
    expect(easy.digest).not.toBe(normal.digest);
    const bytes = await encodeSave(capture(createRuntime()), {
      generation: 1,
      version: easy.components,
      worldOptions: formatWorldOptions,
    });
    const decoded = await decodeSave(bytes, { version: easy.components, contentLookup });
    expect(decoded.versionIdentity.digest).toBe(easy.digest);
    await expect(decodeSave(bytes, { version: normal.components, contentLookup })).rejects.toThrow(PACKS_DIFFER);
    const normalBytes = await encodeSave(capture(createRuntime()), {
      generation: 1,
      version: normal.components,
      worldOptions: formatWorldOptions,
    });
    await expect(decodeSave(normalBytes, { version: easy.components, contentLookup })).rejects.toThrow(PACKS_DIFFER);
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
          eyeHeightMetres: 1.3,
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
    for (const [id, plain] of base.zombies) {
      const lightOnly = {
        ...beginner.content.registry.zombies.get(id)!,
        sight: plain.sight,
        nightSight: plain.nightSight,
      };
      expect(farthestSpotted(lightOnly), id).toBeLessThan(farthestSpotted(plain));
    }
  });
});
