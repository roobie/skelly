import type { HandSide, Item } from '@skelly/engine/inventory';
import type { PlayerStance } from '@skelly/engine/pose';
import { makeScale } from '@skelly/engine/world';
import { ARM_NODE } from '@skelly/presentation/internal/render/armRig.ts';
import { type AvatarMannequin, createAvatarMannequin } from '@skelly/presentation/internal/render/avatarMannequin.ts';
import { heldItemPoses, type ItemHoldPose } from '@skelly/presentation/internal/render/heldPresentation.ts';
import { type ModelLibrary, PlayerMeshes } from '@skelly/presentation/render';
import { Group, type Object3D, Vector3 } from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { figureAnchorAt } from './figureAnchors.ts';
import { loadFigureModels } from './figureModels.ts';
import { createPlayerBody } from './playerFixture.ts';

const registry = baseRegistry();
const figure = registry.figures.get('player')!;
const samples = heldItemPoses(registry);
const itemTypes = [...new Set(samples.map(({ itemType }) => itemType))];
const stances = [
  'standing',
  ...Object.keys(figure.stancePoses).filter((key) => key !== 'blendRealSeconds'),
] as PlayerStance[];

const shoulderError = (group: Object3D, side: HandSide): number => {
  group.updateMatrixWorld(true);
  const joint = figure.body.joints[side === 'right' ? 'rightShoulder' : 'leftShoulder'];
  const expected = figureAnchorAt({ group, registry, figure, name: 'body', model: figure.body.model, anchor: joint });
  const arm = group.getObjectByName(`first-person-arm-${side}`)!;
  const actual = arm.getObjectByName(ARM_NODE.shoulder)!.getWorldPosition(new Vector3());
  return actual.distanceTo(expected);
};

it('has registry hold samples to check', () => {
  expect(itemTypes.length).toBeGreaterThan(0);
});

// One case per item type keeps each case's cost fixed as the registry grows.
describe.each(['world', 'mannequin'] as const)('%s arm roots', (view) => {
  const scale = makeScale(0.5);
  let world: PlayerMeshes | undefined;
  let mannequin: AvatarMannequin | undefined;
  let mannequinAt = 0;

  beforeAll(async () => {
    const models = { version: 1, ...(await loadFigureModels(registry)) } as unknown as ModelLibrary;
    world = view === 'world' ? new PlayerMeshes(scale.blockSize, figure, registry.models, models) : undefined;
    mannequin =
      view === 'mannequin'
        ? createAvatarMannequin(
            new Group(),
            { registry, debug: true, blockSize: scale.blockSize, figure, modelDefs: registry.models, models },
            { mannequin: samples[0]!.name },
          )!
        : undefined;
  });

  afterAll(() => {
    world?.dispose();
    mannequin?.dispose();
  });

  /** Poses the view holding `sample`, the `index`th registry hold sample, and returns the posed figure. */
  const pose = (sample: ItemHoldPose, index: number): Object3D => {
    const item: Item = { uid: index + 1, type: sample.itemType, condition: 1, count: 1 };
    const body = createPlayerBody(scale, 7, 4, -3);
    const yaw = Math.PI / 3;
    world?.sync({
      body,
      yaw,
      pitch: sample.ready ? Math.PI / 8 : -Math.PI / 12,
      stepOffset: 0,
      gaitPhase: 0,
      moving: false,
      stance: stances[index % stances.length]!,
      dt: figure.stancePoses.blendRealSeconds,
      thirdPerson: true,
      heldItems: { registry, hands: { [sample.side]: item } },
      holdReady: sample.ready,
    });
    if (mannequin) {
      // The mannequin's registry holds follow heldItemPoses in order, from the first sample it started on.
      mannequin.step(index - mannequinAt);
      mannequinAt = index;
      mannequin.sync(body.pos, yaw, 0);
    }
    return world?.group ?? mannequin!.group;
  };

  it.each(itemTypes)('meet the body shoulders for every hold sample of %s', (itemType) => {
    for (const [index, sample] of samples.entries()) {
      if (sample.itemType !== itemType) {
        continue;
      }
      const group = pose(sample, index);
      if (mannequin) {
        expect(mannequin.pose.hold, `mannequin/${sample.name}`).toEqual(sample);
      }
      const sides: HandSide[] = registry.items.get(itemType)!.twoHanded ? ['right', 'left'] : [sample.side];
      for (const side of sides) {
        expect(shoulderError(group, side), `${view}/${sample.name}/${side}`).toBeLessThan(1e-6);
      }
    }
  });
});
