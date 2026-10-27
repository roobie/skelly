import { Group, type Object3D, Vector3 } from 'three';
import { expect, it } from 'vitest';
import type { FigureDef, Registry } from '../src/core/content.ts';
import type { HandSide } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import type { PlayerStance } from '../src/core/playerStance.ts';
import { makeScale } from '../src/core/scale.ts';
import { ARM_NODE } from '../src/render/armRig.ts';
import { createAvatarMannequin } from '../src/render/avatarMannequin.ts';
import { heldItemPoses } from '../src/render/heldPresentation.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { PlayerMeshes } from '../src/render/playerFigure.ts';
import { baseRegistry } from './baseRegistry.ts';
import { figureAnchorAt } from './figureAnchors.ts';
import { loadFigureModels } from './figureModels.ts';
import { createPlayerBody } from './playerFixture.ts';

const shoulderError = (group: Object3D, registry: Registry, figure: FigureDef, side: HandSide): number => {
  group.updateMatrixWorld(true);
  const joint = figure.body.joints[side === 'right' ? 'rightShoulder' : 'leftShoulder'];
  const expected = figureAnchorAt({ group, registry, figure, name: 'body', model: figure.body.model, anchor: joint });
  const arm = group.getObjectByName(`first-person-arm-${side}`)!;
  const actual = arm.getObjectByName(ARM_NODE.shoulder)!.getWorldPosition(new Vector3());
  return actual.distanceTo(expected);
};

it('world and mannequin arm roots meet the body shoulders for every registry hold sample', async () => {
  const registry = baseRegistry();
  const figure = registry.figures.get('player')!;
  const models = { version: 1, ...(await loadFigureModels(registry)) } as unknown as ModelLibrary;
  const scale = makeScale(0.5);
  const world = new PlayerMeshes(scale.blockSize, figure, registry.models, models);
  const samples = heldItemPoses(registry);
  const stances = [
    'standing',
    ...Object.keys(figure.stancePoses).filter((key) => key !== 'blendRealSeconds'),
  ] as PlayerStance[];
  expect(samples.length).toBeGreaterThan(0);
  const mannequin = createAvatarMannequin(
    new Group(),
    {
      registry,
      debug: true,
      blockSize: scale.blockSize,
      figure,
      modelDefs: registry.models,
      models,
    },
    `?mannequin=${samples[0]!.name}`,
  )!;
  let worst = { error: 0, label: '' };
  try {
    for (const [index, sample] of samples.entries()) {
      const item: Item = { uid: index + 1, type: sample.itemType, condition: 1, count: 1 };
      const body = createPlayerBody(scale, 7, 4, -3);
      const yaw = Math.PI / 3;
      world.sync({
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
      expect(mannequin.pose.hold).toEqual(sample);
      mannequin.sync(body.pos, yaw, 0);
      const sides: HandSide[] = registry.items.get(sample.itemType)!.twoHanded ? ['right', 'left'] : [sample.side];
      for (const [view, group] of [
        ['world', world.group],
        ['mannequin', mannequin.group],
      ] as const) {
        for (const side of sides) {
          const error = shoulderError(group, registry, figure, side);
          expect(Number.isFinite(error), `${view}/${sample.name}/${side}`).toBe(true);
          if (error > worst.error) {
            worst = { error, label: `${view}/${sample.name}/${side}` };
          }
        }
      }
      mannequin.step(1);
    }
    expect(worst.error, worst.label).toBeLessThan(1e-6);
  } finally {
    world.dispose();
    mannequin.dispose();
  }
});
