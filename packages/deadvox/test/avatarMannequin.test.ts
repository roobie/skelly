import { Group, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { AvatarMannequin, createAvatarMannequin } from '../src/render/avatarMannequin.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { PlayerMeshes } from '../src/render/playerFigure.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';
import { createPlayerBody } from './playerFixture.ts';

const registry = baseRegistry();
const figure = registry.figures.get('player')!;
const models = { version: 1, ...(await loadFigureModels(registry)) } as unknown as ModelLibrary;
const mannequinFor = (debug: boolean, search: string) => {
  const scene = new Scene();
  const mannequin = createAvatarMannequin(
    scene,
    { debug, blockSize: 0.5, figure, modelDefs: registry.models, models, registry },
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
        const offered = mannequin!.poses.filter(
          (pose) => !(pose.hold || pose.emptyFists) && pose.stance === stance && pose.moving === moving,
        );
        expect(offered, `${stance} moving=${moving}`).toHaveLength(1);
        while (mannequin!.pose !== offered[0]) {
          mannequin!.step(1);
        }
        mannequin!.sync([0, 0, 0], 0, 0.1);
        expect(mannequin!.pose).toBe(offered[0]);
      }
    }
  });

  it('raises both hands over their rest height in en-garde for every hold state', () => {
    const gripY = (mannequin: AvatarMannequin, side: 'right' | 'left'): number => {
      mannequin.group.updateMatrixWorld(true);
      const arm = mannequin.group.getObjectByName(`first-person-arm-${side}`)!;
      return arm.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3()).y;
    };
    for (const name of [
      'en-garde',
      'en-garde-crowbar-right',
      'en-garde-canned-beans-left',
      'en-garde-crowbar-right-canned-beans-left',
    ]) {
      const { mannequin } = mannequinFor(true, `?debug=1&mannequin=${name}`);
      const { pose } = mannequin!;
      expect(pose.name).toBe(name);
      const rest = new AvatarMannequin(
        new PlayerMeshes(0.5, figure, registry.models, models),
        [{ ...pose, ready: false }],
        {
          registry,
          blockSize: 0.5,
          placement: figure.mannequinPlacement,
          requested: 'rest',
        },
      );
      try {
        mannequin!.sync([0, 0, 0], 0, 0);
        rest.sync([0, 0, 0], 0, 0);
        for (const side of ['right', 'left'] as const) {
          expect(gripY(mannequin!, side), `${name}/${side}`).toBeGreaterThan(gripY(rest, side));
        }
      } finally {
        mannequin!.dispose();
        rest.dispose();
      }
    }
  });

  it('uses the player firearm-aim owner to mount the mannequin free hand at the firearm support point', () => {
    const { mannequin } = mannequinFor(true, '?debug=1&mannequin=aim-firearm');
    expect(mannequin!.pose.name).toBe('aim-firearm');
    mannequin!.sync([0, 0, 0], 0, 0);
    mannequin!.group.updateMatrixWorld(true);
    const held = mannequin!.group.getObjectByName('held-item-right')!;
    const grip = mannequin!.group
      .getObjectByName('first-person-arm-left')!
      .getObjectByName('grip-anchor')!
      .getWorldPosition(new Vector3());
    const support = held.localToWorld(new Vector3(...figure.holds.supportForward));
    expect(grip.distanceTo(support)).toBeLessThan(1e-6);
  });

  it('raises an active off-hand item through the third-person aim owner', () => {
    const firearm = [...registry.items.values()].find((item) => item.firearm && !item.twoHanded)!;
    const light = [...registry.items.values()].find((item) => item.light && !item.twoHanded && !item.firearm)!;
    const gripHeight = (on: boolean): number => {
      const meshes = new PlayerMeshes(0.5, figure, registry.models, models);
      meshes.sync({
        body: createPlayerBody(makeScale(0.5), 0, 0, 0),
        yaw: 0,
        stepOffset: 0,
        gaitPhase: 0,
        moving: false,
        stance: 'standing',
        dt: 0,
        thirdPerson: true,
        heldItems: {
          registry,
          hands: {
            right: { uid: 1, type: firearm.id, count: 1, condition: 1 },
            left: { uid: 2, type: light.id, count: 1, condition: 1, on },
          },
        },
      });
      meshes.syncHeldView(undefined, { firearms: [], readiness: { uid: 1, progress: 1, aimingDownSights: false } });
      meshes.group.updateMatrixWorld(true);
      const height = meshes.group
        .getObjectByName('first-person-arm-left')!
        .getObjectByName('grip-anchor')!
        .getWorldPosition(new Vector3()).y;
      meshes.dispose();
      return height;
    };
    expect(gripHeight(true)).toBeGreaterThan(gripHeight(false));
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

  it('keeps query-selected garment samples worn while stepping poses', () => {
    const template = [...registry.items.values()].find((item) => item.wearable?.slot === 'torso')!;
    const garment = {
      ...template,
      id: 'fixture_garment',
      figureModels: [
        {
          model: 'fixture_worn',
          frame: 'head',
          pivot: [0, 0, 0] as Vec3,
          at: [0, 0, 0] as Vec3,
          turn: [0, 0, 0] as Vec3,
        },
      ],
    };
    const fixtureRegistry = { ...registry, items: new Map([...registry.items, [garment.id, garment]]) };
    const fixtureModels = {
      ...models,
      partLook: (look: import('../src/render/itemLook.ts').ItemLook) =>
        look.model === 'fixture_worn' ? new Group() : models.partLook(look),
    } as ModelLibrary;
    const mannequin = createAvatarMannequin(
      new Scene(),
      {
        debug: true,
        blockSize: 0.5,
        figure,
        modelDefs: registry.models,
        models: fixtureModels,
        registry: fixtureRegistry,
      },
      `?mannequin=&mannequinWear=${garment.id}`,
    )!;
    mannequin.sync([0, 0, 0], 0, 1);
    const attachment = mannequin.group.getObjectByName('worn-torso');
    expect(attachment).toBeDefined();
    mannequin.step(1);
    mannequin.sync([0, 0, 0], 0, 1);
    expect(mannequin.group.getObjectByName('worn-torso')).toBe(attachment);
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
    const inactive = { blockSize: 0.5, figure, modelDefs: registry.models, models, registry };
    expect(createAvatarMannequin(scene, { ...inactive, debug: false })).toBeUndefined();
    vi.stubGlobal('location', { search: '?debug=1' });
    expect(createAvatarMannequin(scene, { ...inactive, debug: true })).toBeUndefined();
    expect(append).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
  });
});
