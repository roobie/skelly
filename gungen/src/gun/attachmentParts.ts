import type { PartDef, PartFamily } from '@skelly/engine/assembly/schema.ts';
import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import { boxFromMinMax } from '@skelly/engine/shapes/geometry.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { FOREGRIP_PROPORTIONS } from './foregripProportions.ts';
import type { MuzzleBore } from './mounts.ts';

const X: Vec3 = [1, 0, 0];
const NEG_X: Vec3 = [-1, 0, 0];
const Y: Vec3 = [0, 1, 0];

const box = (id: string, min: Vec3, max: Vec3, slot: 'metal' | 'furniture' = 'metal'): Solid => ({
  id,
  kind: 'box',
  box: boxFromMinMax(min, max),
  slot,
});

const suppressorTube = (length: number, radius: number): Solid => ({
  id: 'body',
  kind: 'revolved',
  axis: 'x',
  profile: [
    [0.25, 0],
    [0.25, radius],
    [length - 0.5, radius],
    [length - 0.5, radius * 1.15],
    [length, radius * 1.15],
    [length, 0],
  ],
  slot: 'metal',
});

/** Both suppressors are rifle suppressors; a shotgun suppressor would be a type built for smoothbores. */
const SUPPRESSOR_BORE: MuzzleBore = 'rifled';

const suppressor: PartFamily = {
  name: 'suppressor',
  params: { type: { values: ['real-suppressor', 'improvised-suppressor'], default: 'real-suppressor' } },
  build(params): PartDef {
    const improvised = params.type === 'improvised-suppressor';
    const length = improvised ? 15 : 12;
    const radius = improvised ? 1.75 : 1.25;
    return {
      family: 'suppressor',
      solids: [suppressorTube(length, radius)],
      ports: [
        {
          id: 'base',
          mount: 'muzzle',
          standard: SUPPRESSOR_BORE,
          gender: 'male',
          pos: [0, 0, 0],
          normal: NEG_X,
          up: Y,
          required: true,
        },
        {
          id: 'muzzle',
          mount: 'muzzle',
          standard: SUPPRESSOR_BORE,
          gender: 'female',
          pos: [length, 0, 0],
          normal: X,
          up: Y,
        },
      ],
      keepOuts: [],
      axes: [{ kind: 'bore', origin: [0, 0, 0], dir: X }],
      tags: ['attachment', 'suppressor'],
    };
  },
};

const tacticalFlashlightMount: PartFamily = {
  name: 'tactical-flashlight-mount',
  params: {},
  build(): PartDef {
    return {
      family: 'tactical-flashlight-mount',
      solids: [box('clamp', [-1, -0.5, 0], [1, 0.5, 0.75]), box('shoe', [-0.5, -0.75, 0.5], [0.5, 0.75, 2])],
      ports: [
        { id: 'base', mount: 'rail-side', gender: 'male', pos: [0, 0, 0], normal: [0, 0, -1], up: Y, required: true },
      ],
      keepOuts: [],
      axes: [],
      tags: ['attachment', 'flashlight-mount'],
    };
  },
};

const foregrip: PartFamily = {
  name: 'foregrip',
  params: {},
  build(): PartDef {
    const { foot, grip } = FOREGRIP_PROPORTIONS;
    return {
      family: 'foregrip',
      solids: [
        box(
          'foot',
          [-foot.halfLengthU, -foot.heightU / 2, -foot.halfWidthU],
          [foot.halfLengthU, foot.heightU / 2, foot.halfWidthU],
        ),
        box(
          'grip',
          [-grip.halfLengthU, -foot.heightU / 2 - grip.lengthU, -grip.halfWidthU],
          [grip.halfLengthU, -foot.heightU / 2, grip.halfWidthU],
          'furniture',
        ),
      ],
      ports: [{ id: 'base', mount: 'rail-bottom', gender: 'male', pos: [0, 0, 0], normal: Y, up: X, required: true }],
      keepOuts: [],
      axes: [],
      tags: ['attachment', 'foregrip'],
    };
  },
};

export const ATTACHMENT_FAMILIES: Readonly<Record<string, PartFamily>> = {
  suppressor,
  'tactical-flashlight-mount': tacticalFlashlightMount,
  foregrip,
};
