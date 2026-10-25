import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createAvatarMannequin } from '../src/render/avatarMannequin.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';

const registry = baseRegistry();
const figure = registry.figures.get('player')!;
const models = { version: 1, ...(await loadFigureModels(registry)) } as unknown as ModelLibrary;
const page = { addEventListener: () => undefined };
const mannequinFor = (debug: boolean, search: string) => {
  const scene = new Scene();
  const mannequin = createAvatarMannequin(
    scene,
    { debug, blockSize: 0.5, figure, modelDefs: registry.models, models },
    { search, page },
  );
  return { scene, mannequin };
};

describe('debug avatar mannequin', () => {
  it('offers every stance the figure poses, standing still and walking, and draws each', () => {
    const { mannequin } = mannequinFor(true, '?debug=1&mannequin=');
    const stances = ['standing', ...Object.keys(figure.stancePoses).filter((key) => key !== 'blendRealSeconds')];
    for (const stance of stances) {
      for (const moving of [false, true]) {
        const offered = mannequin!.poses.filter((pose) => pose.stance === stance && pose.moving === moving);
        expect(offered, `${stance} moving=${moving}`).toHaveLength(1);
        expect(mannequin!.select(offered[0]!.name)).toBe(true);
        mannequin!.sync({ bodyPosition: [0, 0, 0], yaw: 0, dt: 0.1, visible: true });
        expect(mannequin!.pose).toBe(offered[0]);
      }
    }
  });

  it('steps through the offered poses with its keys and wraps round', () => {
    const { mannequin } = mannequinFor(true, '?debug=1&mannequin=');
    const first = mannequin!.pose;
    mannequin!.handleKey({ code: 'Delete', target: null });
    expect(mannequin!.pose).toBe(mannequin!.poses.at(-1));
    mannequin!.handleKey({ code: 'Insert', target: null });
    expect(mannequin!.pose).toBe(first);
  });

  it('is absent without debug, and without the query', () => {
    const withoutDebug = mannequinFor(false, '?mannequin=prone');
    expect(withoutDebug.mannequin).toBeUndefined();
    expect(withoutDebug.scene.children).toHaveLength(0);
    expect(mannequinFor(true, '?debug=1').mannequin).toBeUndefined();
  });
});
