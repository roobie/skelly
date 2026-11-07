import { describe, expect, it } from 'vitest';
import { perceivePlayer } from '../src/core/agentPerception.ts';
import { admitWithFolderPacks, type PackInput, selectFolderClosure } from '../src/core/packAdmission.ts';
import { currentSaveVersionIdentity, decodeSave, encodeSave } from '../src/core/saveFormat.ts';
import { bundledModIdsFromUrl, selectBundledMods } from '../src/game/bundledMods.ts';
import { buildBundledContent } from '../src/product/content.ts';
import { productModIntake } from '../src/product/mods.ts';
import { startupContent } from './baseRegistry.ts';
import { reuseBundledBuilds, withReusedBuilds } from './bundledContentReuse.ts';
import { fixturePack, folderChain } from './fixtures/folderPacks.ts';
import { capture, contentLookup, createRuntime, formatWorldOptions } from './snapshotTestSupport.ts';

const base = buildBundledContent().registry;
const PACKS_DIFFER = /content packs differ/;
// Admitted once; every case below reads it and none changes it.
const BEGINNER_ID = 'skelly.deadvox.beginner';
const beginner = withReusedBuilds(() => selectBundledMods(productModIntake, [BEGINNER_ID]));
// The suite's own build of the unmodded content stands in for a second one, so the no-mod case still compares two builds.
reuseBundledBuilds(startupContent());

describe('beginner bundled mod', () => {
  it('is admitted without issues', () => {
    expect(beginner.issues).toEqual([]);
    expect(beginner.admitted.map(({ id }) => id)).toEqual([BEGINNER_ID]);
  });

  it('scales every hostile kind consistently from its core row', () => {
    const [firstId, firstPlain] = base.actors.entries().next().value!;
    const firstEasy = beginner.content.registry.actors.get(firstId)!;
    const factors = {
      damage: firstEasy.attack!.moves[0]!.damage / firstPlain.attack!.moves[0]!.damage,
      speed: firstEasy.speed.wanderMetresPerSimSecond / firstPlain.speed.wanderMetresPerSimSecond,
      detection: firstEasy.agent!.sight / firstPlain.agent!.sight,
      health: firstEasy.regions.head! / firstPlain.regions.head!,
    };
    expect(beginner.content.registry.actors.size).toBe(base.actors.size);
    for (const [id, plain] of base.actors) {
      const easy = beginner.content.registry.actors.get(id)!;
      expect(easy, id).toBeDefined();
      plain.attack!.moves.forEach((move, index) => {
        expect(easy.attack!.moves[index]!.damage).toBeCloseTo(move.damage * factors.damage, 9);
      });
      expect(easy.speed.wanderMetresPerSimSecond).toBeCloseTo(plain.speed.wanderMetresPerSimSecond * factors.speed, 9);
      expect(easy.speed.chaseMetresPerSimSecond).toBeCloseTo(plain.speed.chaseMetresPerSimSecond * factors.speed, 9);
      for (const key of ['sight', 'nightSight', 'hearing'] as const) {
        expect(easy.agent![key]).toBeCloseTo(plain.agent![key] * factors.detection, 9);
      }
      expect(easy.agent!.lightSightScale).toBeCloseTo((plain.agent!.lightSightScale ?? 1) * factors.detection, 9);
      for (const [region, health] of Object.entries(plain.regions)) {
        expect(easy.regions[region]).toBeCloseTo(health * factors.health, 9);
      }
    }
  });

  it('leaves content unchanged when no bundled mod is asked for', () => {
    const none = selectBundledMods(productModIntake, bundledModIdsFromUrl(new URLSearchParams('seed=3')));
    expect(none.issues).toEqual([]);
    expect(none.admitted).toEqual([]);
    expect(none.content.registry.actors).toEqual(base.actors);
  });

  it('refuses an unknown bundled id visibly', () => {
    const result = selectBundledMods(
      productModIntake,
      bundledModIdsFromUrl(new URLSearchParams(`mods=${BEGINNER_ID},nonesuch`)),
    );
    expect(result.issues).toEqual([expect.objectContaining({ message: expect.stringContaining('nonesuch') })]);
  });

  it('keeps the mods panel switch out of the bundled id list', () => {
    expect(bundledModIdsFromUrl(new URLSearchParams('mods=1'))).toEqual([]);
  });
});

describe('opt-in folder pack selection', () => {
  const ids = (packs: readonly PackInput[]) => packs.map(({ manifest }) => manifest.id);

  it('admits a requested root with its whole opt-in closure once, after the defaults it already has', () => {
    const { a, b, c, d, defaults, available } = folderChain();
    const admission = admitWithFolderPacks(defaults, selectFolderClosure([a.manifest.id], available, defaults));
    expect(admission.issues).toEqual([]);
    expect(ids(admission.packs)).toEqual(ids([d, c, b, a]));
    expect(ids(admission.folderPacks)).toEqual(ids([c, b, a]));
  });

  it('leaves a dependency missing from every inventory to admission, which refuses it', () => {
    const { a, b, defaults, available } = folderChain();
    const without = available.filter((pack) => pack !== b);
    const admission = admitWithFolderPacks(defaults, selectFolderClosure([a.manifest.id], without, defaults));
    expect(admission.issues).toEqual([
      expect.objectContaining({ message: expect.stringContaining(`missing dependency ${b.manifest.id}`) }),
    ]);
  });

  it('hands a cycle among selected packs to admission, which refuses it', () => {
    const first = fixturePack('fixture.first', ['fixture.second'], true);
    const second = fixturePack('fixture.second', ['fixture.first'], true);
    const admission = admitWithFolderPacks([], selectFolderClosure(['fixture.first'], [first, second], []));
    expect(admission.issues).toEqual([
      expect.objectContaining({ message: expect.stringContaining('dependency cycle') }),
    ]);
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
  const farthestSpotted = (actor: ReturnType<typeof base.actors.get>): number => {
    let farthest = 0;
    for (let metres = 0.5; metres <= 150; metres += 0.5) {
      const seen = perceivePlayer({
        def: actor!,
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
    for (const [id, plain] of base.actors) {
      const lightOnly = {
        ...beginner.content.registry.actors.get(id)!,
        agent: {
          ...beginner.content.registry.actors.get(id)!.agent!,
          sight: plain.agent!.sight,
          nightSight: plain.agent!.nightSight,
        },
      };
      expect(farthestSpotted(lightOnly), id).toBeLessThan(farthestSpotted(plain));
    }
  });
});
