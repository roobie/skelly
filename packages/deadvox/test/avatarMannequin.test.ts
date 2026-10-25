import { Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { createAvatarMannequin } from '../src/render/avatarMannequin.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';

const registry = baseRegistry();
const figure = registry.figures.get('player')!;
const models = { version: 1, ...(await loadFigureModels(registry)) } as unknown as ModelLibrary;
const mannequinFor = (debug: boolean, search: string) => {
  const scene = new Scene();
  const mannequin = createAvatarMannequin(
    scene,
    { debug, blockSize: 0.5, figure, modelDefs: registry.models, models },
    search,
  );
  return { scene, mannequin };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('debug avatar mannequin', () => {
  it('offers every stance the figure poses, standing still and walking, and draws each', () => {
    const { mannequin } = mannequinFor(true, '?debug=1&mannequin=');
    const stances = ['standing', ...Object.keys(figure.stancePoses).filter((key) => key !== 'blendRealSeconds')];
    for (const stance of stances) {
      for (const moving of [false, true]) {
        const offered = mannequin!.poses.filter((pose) => pose.stance === stance && pose.moving === moving);
        expect(offered, `${stance} moving=${moving}`).toHaveLength(1);
        while (mannequin!.pose !== offered[0]) {
          mannequin!.step(1);
        }
        mannequin!.sync([0, 0, 0], 0, 0.1);
        expect(mannequin!.pose).toBe(offered[0]);
      }
    }
  });

  it('steps through the offered poses and wraps round', () => {
    const { mannequin } = mannequinFor(true, '?debug=1&mannequin=');
    const first = mannequin!.pose;
    mannequin!.step(-1);
    expect(mannequin!.pose).toBe(mannequin!.poses.at(-1));
    mannequin!.step(1);
    expect(mannequin!.pose).toBe(first);
  });

  it('relocates to stand near the player wherever the player has gone', () => {
    const { mannequin } = mannequinFor(true, '?debug=1&mannequin=');
    const distance = (from: readonly number[], to: readonly number[]) =>
      Math.hypot(from[0]! - to[0]!, from[2]! - to[2]!);
    const { aheadMetres, asideMetres } = figure.mannequinPlacement;
    const standoff = Math.hypot(aheadMetres, asideMetres) / 0.5;
    mannequin!.sync([0, 0, 0], 0, 0.1);
    const far: Vec3 = [40, 0, -25];
    mannequin!.sync(far, 1.3, 0.1);
    expect(distance(mannequin!.position, far)).toBeGreaterThan(standoff * 2);
    mannequin!.place();
    expect(distance(mannequin!.position, far)).toBeCloseTo(standoff, 5);
  });

  it('is absent without debug, and without the query', () => {
    const withoutDebug = mannequinFor(false, '?mannequin=prone');
    expect(withoutDebug.mannequin).toBeUndefined();
    expect(withoutDebug.scene.children).toHaveLength(0);
    expect(mannequinFor(true, '?debug=1').mannequin).toBeUndefined();
  });

  it('leaves the page alone when inactive, on the default browser path', () => {
    const append = vi.fn();
    const addEventListener = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => ({ style: {} }),
      body: { append },
      addEventListener,
    });
    vi.stubGlobal('location', { search: '?mannequin=prone' });
    const scene = new Scene();
    const inactive = { blockSize: 0.5, figure, modelDefs: registry.models, models };
    expect(createAvatarMannequin(scene, { ...inactive, debug: false })).toBeUndefined();
    vi.stubGlobal('location', { search: '?debug=1' });
    expect(createAvatarMannequin(scene, { ...inactive, debug: true })).toBeUndefined();
    expect(append).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
  });
});
