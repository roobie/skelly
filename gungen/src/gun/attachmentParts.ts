import { boxFromMinMax } from '../core/geometry.ts';
import type { Vec3 } from '../core/math.ts';
import type { PartDef, PartFamily, Solid } from '../core/schema.ts';

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
        { id: 'base', mount: 'muzzle', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        { id: 'muzzle', mount: 'muzzle', gender: 'female', pos: [length, 0, 0], normal: X, up: Y },
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
    return {
      family: 'foregrip',
      solids: [
        box('foot', [-1, -0.5, -0.75], [1, 0.5, 0.75]),
        box('grip', [-0.75, -4, -0.5], [0.75, -0.5, 0.5], 'furniture'),
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
