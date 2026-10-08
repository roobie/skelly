import type { Vec3 } from '../core/math.ts';
import type { PartFamily, Solid } from '../core/schema.ts';
import { AR_ACTION_LAYOUT } from './arLayout.ts';
import type { SectionPocket } from './receiverSection.ts';

const rear = -AR_ACTION_LAYOUT.receiverLengthU;
const metal = (id: string, min: Vec3, max: Vec3): Solid => ({
  id,
  kind: 'box',
  box: {
    center: min.map((value, i) => (value + max[i]!) / 2) as unknown as Vec3,
    half: min.map((value, i) => (max[i]! - value) / 2) as unknown as Vec3,
  },
  material: 'alu-anodized-black',
  slot: 'metal',
  display: { bevel: false },
});

/** Above the carrier, below the upper roof; open at the rear, not through the outer skin. */
export const AR_HANDLE_CHANNEL: SectionPocket = {
  x: [rear, -2.75],
  y: [1.65, 2],
  z: [-0.25, 0.25],
};

export const arChargingHandle: PartFamily = {
  name: 'ar-charging-handle',
  params: {},
  build: () => ({
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
    solids: [
      metal('charging-handle', [rear - 0.65, 1.75, -0.15], [-3, 1.95, 0.15]),
      metal('ar-handle-crossbar', [rear - 0.8, 1.8, -2.25], [rear - 0.3, 2.15, 2.25]),
      // Two rearward finger hooks; the release latch is on the left (-Z).
      metal('ar-handle-left-grip', [rear - 1.15, 1.8, -2.25], [rear - 0.8, 2.15, -1.4]),
      metal('ar-handle-right-grip', [rear - 1.15, 1.8, 1.4], [rear - 0.8, 2.15, 2.25]),
      metal('ar-handle-latch', [rear - 0.4, 1.8, -2.5], [rear + 0.35, 2.15, -2.2]),
    ],
    // The pulling hand's corridor starts behind the rear finger grips at home.
    keepOuts: [
      { id: 'charging-handle', kind: 'clearance', box: { center: [rear - 4.4, 1.975, 0], half: [3.25, 0.425, 2.75] } },
    ],
    axes: [],
    motion: { kind: 'linear', axis: [-1, 0, 0], start: [0, 0, 0], end: [-AR_ACTION_LAYOUT.carrierTravelU, 0, 0] },
  }),
};
