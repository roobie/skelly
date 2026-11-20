import { buildRegistry } from '@skelly/engine/content';
import { aftermathWeight } from '@skelly/engine/internal/core/aftermathOdds.ts';
import { layoutBuildingSite, placementOf } from '@skelly/engine/internal/core/authoredPlacement.ts';
import type { ContentFile, KitRef } from '@skelly/engine/internal/core/schema.ts';
import { type AssemblyContext, compileAssembly } from '@skelly/engine/internal/core/templates.ts';
import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';

// The fixture route's front slot draws room_a or room_b; room_b shows the fixture's one aftermath tag.
const TAG = 'fixture_broken';
const UNKNOWN_TAG = 'fixture_unknown';
const FRONT = 'fixture_route/front';
const EMPTIED_SLOT = /fixture_route\/front.*aftermath odds leave no alternative/;
const UNKNOWN_SHOWN = /aftermath: no aftermath tag "fixture_unknown"/;
const UNKNOWN_ODDS = /aftermathOdds: no aftermath tag "fixture_unknown"/;

const fixture = (): ContentFile => {
  const data = JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet')) as ContentFile;
  data.aftermathTags = [{ id: TAG }];
  data.mapPieces!.find(({ id }) => id === 'room_b')!.aftermath = [TAG];
  return data;
};

const build = (data: ContentFile) => buildRegistry([{ source: 'aftermath-fixture.json', data }]);

const frontDraw = (
  registry: ReturnType<typeof build>['registry'],
  data: ContentFile,
  context: Omit<AssemblyContext, 'onDraw'>,
): string => {
  let drawn = '';
  compileAssembly(registry, data.mapAssemblies![0]!, {
    ...context,
    onDraw: (path: string, ref: KitRef) => {
      if (path === FRONT) {
        drawn = ref.id;
      }
    },
  });
  return drawn;
};

/** A seed whose untuned draw shows the tagged room, so a test that expects it gone cannot pass vacuously. */
const taggedSeed = (registry: ReturnType<typeof build>['registry'], data: ContentFile): number => {
  const seed = Array.from({ length: 64 }, (_, i) => i).find(
    (candidate) => frontDraw(registry, data, { seed: candidate, siteId: 'aftermath' }) === 'room_b',
  );
  if (seed === undefined) {
    throw new Error('no fixture seed draws the tagged room');
  }
  return seed;
};

describe('aftermath odds', () => {
  it('multiply the weight of an alternative by its tag and leave untagged ones alone', () => {
    const { registry, issues } = build(fixture());
    expect(issues).toEqual([]);
    const odds = { [TAG]: 3 };
    expect(aftermathWeight(registry, { ref: { kind: 'piece', id: 'room_b' }, weight: 2 }, odds)).toBe(6);
    expect(aftermathWeight(registry, { ref: { kind: 'piece', id: 'room_a' }, weight: 2 }, odds)).toBe(2);
  });

  it('count a tag a ref style repeats once', () => {
    const data = fixture();
    data.mapStyles![1]!.aftermath = [TAG];
    const { registry, issues } = build(data);
    expect(issues).toEqual([]);
    const ref = { kind: 'piece' as const, id: 'room_b', style: data.mapStyles![1]!.id };
    expect(aftermathWeight(registry, { ref, weight: 1 }, { [TAG]: 3 })).toBe(3);
  });

  it('leave a zeroed alternative out of the draw', () => {
    const data = fixture();
    const { registry } = build(data);
    const seed = taggedSeed(registry, data);
    expect(frontDraw(registry, data, { seed, siteId: 'aftermath', aftermathOdds: { [TAG]: 0 } })).toBe('room_a');
  });

  it('let an assembly set odds over its context, so the innermost setting wins', () => {
    const data = fixture();
    const { registry } = build(data);
    const seed = taggedSeed(registry, data);
    data.mapAssemblies![0]!.aftermathOdds = { [TAG]: 1 };
    expect(frontDraw(registry, data, { seed, siteId: 'aftermath', aftermathOdds: { [TAG]: 0 } })).toBe('room_b');
    data.mapAssemblies![0]!.aftermathOdds = { [TAG]: 0 };
    expect(frontDraw(registry, data, { seed, siteId: 'aftermath', aftermathOdds: { [TAG]: 1 } })).toBe('room_a');
  });

  it("let a layout building's odds win over its layout's", () => {
    const data = fixture();
    const { registry } = build(data);
    const layout = { id: 'aftermath_layout', aftermathOdds: { [TAG]: 0 } };
    const building = {
      template: 'fixture_route',
      position: [0, 0, 0] as [number, number, number],
      rotation: 0 as const,
    };
    const seed = Array.from({ length: 64 }, (_, i) => i).find((candidate) => {
      let drawn = '';
      placementOf(registry, { ...building, aftermathOdds: { [TAG]: 1 } }, undefined, {
        ...layoutBuildingSite(candidate, layout, 0),
        onDraw: (path, ref) => {
          if (path === FRONT) {
            drawn = ref.id;
          }
        },
      });
      return drawn === 'room_b';
    });
    expect(seed).toBeDefined();
    let drawn = '';
    placementOf(registry, building, undefined, {
      ...layoutBuildingSite(seed!, layout, 0),
      onDraw: (path, ref) => {
        if (path === FRONT) {
          drawn = ref.id;
        }
      },
    });
    expect(drawn).toBe('room_a');
  });

  it('refuse odds that leave a slot no alternative', () => {
    const data = fixture();
    const { registry } = build(data);
    expect(() =>
      compileAssembly(registry, data.mapAssemblies![0]!, {
        seed: 0,
        siteId: 'aftermath',
        aftermathOdds: { [TAG]: 0 },
      }),
    ).not.toThrow();
    data.mapPieces!.find(({ id }) => id === 'room_a')!.aftermath = [TAG];
    const emptied = build(data).registry;
    expect(() =>
      compileAssembly(emptied, data.mapAssemblies![0]!, { seed: 0, siteId: 'aftermath', aftermathOdds: { [TAG]: 0 } }),
    ).toThrow(EMPTIED_SLOT);
  });

  it('report a tag or an odds key that names no declared aftermath tag', () => {
    const data = fixture();
    data.mapPieces!.find(({ id }) => id === 'room_a')!.aftermath = [UNKNOWN_TAG];
    data.mapAssemblies![0]!.aftermathOdds = { [UNKNOWN_TAG]: 2 };
    const messages = build(data).issues.map(({ path, message }) => `${path}: ${message}`);
    expect(messages).toContainEqual(expect.stringMatching(UNKNOWN_SHOWN));
    expect(messages).toContainEqual(expect.stringMatching(UNKNOWN_ODDS));
  });
});
