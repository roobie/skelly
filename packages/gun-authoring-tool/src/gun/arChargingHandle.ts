import type { PartFamily } from '@skelly/engine/assembly/schema.ts';
import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { AR_ACTION_LAYOUT, AR_ACTION_LAYOUTS, type ARActionLayout, arLayoutFor } from './arLayout.ts';
import physical from './physical.json' with { type: 'json' };
import type { SectionPocket } from './receiverSection.ts';

const actionFrameParam = {
  values: Object.keys(AR_ACTION_LAYOUTS),
  default: AR_ACTION_LAYOUT.frameId,
  from: [{ port: 'mount', param: 'actionFrame' }],
};

const metal = (id: string, min: Vec3, max: Vec3): Solid => ({
  id,
  kind: 'box',
  box: {
    center: min.map((value, i) => (value + max[i]!) / 2) as unknown as Vec3,
    half: min.map((value, i) => (max[i]! - value) / 2) as unknown as Vec3,
  },
  material: physical.solidMaterials.chargingHandle,
  slot: 'metal',
  display: { bevel: false },
});

/** Above the carrier, below the upper roof; open at the rear, not through the outer skin. */
export const arHandleChannel = (layout: ARActionLayout): SectionPocket => ({
  x: [-layout.receiverLengthU, -2.75],
  y: [1.65, 2],
  z: [-0.25, 0.25],
});

const arChargingHandleSolids = (layout: ARActionLayout): Solid[] => {
  const rear = -layout.receiverLengthU;
  return [
    metal('charging-handle', [rear - 0.65, 1.75, -0.15], [-3, 1.95, 0.15]),
    metal('ar-handle-crossbar', [rear - 0.8, 1.8, -2.25], [rear - 0.3, 2.15, 2.25]),
    // Two rearward finger hooks; the release latch is on the left (-Z).
    metal('ar-handle-left-grip', [rear - 1.15, 1.8, -2.25], [rear - 0.8, 2.15, -1.4]),
    metal('ar-handle-right-grip', [rear - 1.15, 1.8, 1.4], [rear - 0.8, 2.15, 2.25]),
    metal('ar-handle-latch', [rear - 0.4, 1.8, -2.5], [rear + 0.35, 2.15, -2.2]),
  ];
};

/** The handle's solids for a frame id; the receiver resolves these for its charging-handle keep-outs. */
export const arChargingHandleSolidsFor = (frameId: string | undefined): Solid[] =>
  arChargingHandleSolids(arLayoutFor(frameId));

export const arChargingHandle: PartFamily = {
  name: 'ar-charging-handle',
  params: { actionFrame: actionFrameParam },
  build(params) {
    const layout = arLayoutFor(params.actionFrame);
    return {
      family: 'ar-charging-handle',
      ports: [
        {
          id: 'mount',
          mount: 'ar-charging-handle',
          gender: 'male',
          pos: [0, 0, 0],
          normal: [-1, 0, 0],
          up: [0, 1, 0],
          required: true,
        },
      ],
      solids: arChargingHandleSolids(layout),
      // The pulling hand's corridor starts behind the rear finger grips at home.
      keepOuts: [
        {
          id: 'charging-handle',
          kind: 'clearance',
          box: { center: [-layout.receiverLengthU - 4.4, 1.975, 0], half: [3.25, 0.425, 2.75] },
        },
      ],
      axes: [],
      motion: {
        kind: 'linear',
        axis: [-1, 0, 0],
        start: [0, 0, 0],
        end: [-layout.carrierTravelU, 0, 0],
      },
    };
  },
};
