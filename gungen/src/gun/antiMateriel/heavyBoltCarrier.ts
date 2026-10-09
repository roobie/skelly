import { boxFromMinMax } from '@skelly/engine/core/geometry.ts';
import type { PartDef, PartFamily, Solid } from '@skelly/engine/core/schema.ts';
import { EJECTION_PORT_MARGIN_U } from '../ejectionPort.ts';
import { box, X } from './common.ts';
import { HEAVY_MAGAZINE_DEPTH } from './heavyMagazine.ts';

/**
 * The bolt carrier for the .50 rifle: a plain block as long as the ejection port the receiver gives it. The
 * shared `bolt-carrier` family's `barrett` envelope is 6u long; this one is built so that the carrier's face
 * bounds plus the ejection margin on each end span the magazine's depth (13u), which puts the port almost as
 * long as the magazine, as on the real rifle. It plays the `bolt-carrier` role and moves along the receiver's
 * `bolt-travel` keep-out like the shared one.
 *
 * Its carrier-owned AK-style stick and clipped paddle are scaled 1.4x from the shared AK handle for the larger
 * carrier and gloved hand. The handle is on the ejection-port side; its swept root passes through the
 * receiver's narrow `charging-handle` slot, which extends the ejection opening rearward.
 */

/** Carrier extents (x, y, z), centred on the carrier port. */
export const HEAVY_CARRIER_ENVELOPE = {
  x: [
    -(HEAVY_MAGAZINE_DEPTH - 2 * EJECTION_PORT_MARGIN_U) / 2,
    (HEAVY_MAGAZINE_DEPTH - 2 * EJECTION_PORT_MARGIN_U) / 2,
  ],
  y: [-0.75, 0.75],
  z: [-1.25, 1.25],
} as const;

export const HEAVY_HANDLE_SCALE = 1.4;
// Quarter-unit grid rounding keeps the nominal ~1.4x scale in buildable dimensions (each remains 1.3–1.5x AK).
export const HEAVY_HANDLE_OUTSTAND_U = 3.25;
const HEAVY_HANDLE_PADDLE_THICKNESS_U = 0.75;
export const HEAVY_HANDLE_STICK_HEIGHT_U = 1.25;
export const HEAVY_HANDLE_STICK_WIDTH_U = 0.5;
export const HEAVY_HANDLE_ROOT_DROP_U = 0;

const chargingHandleSolids = (): Solid[] => {
  const [rootX] = HEAVY_CARRIER_ENVELOPE.x;
  const rootY = HEAVY_CARRIER_ENVELOPE.y[0] - HEAVY_HANDLE_ROOT_DROP_U;
  const receiverSideFace = 2;
  const paddleOuterZ = -receiverSideFace - HEAVY_HANDLE_OUTSTAND_U;
  const paddleInnerZ = paddleOuterZ + HEAVY_HANDLE_PADDLE_THICKNESS_U;
  const axisX = rootX + 0.5;
  const axisY = rootY + 0.75;
  const halfX = 0.75;
  const halfY = 0.75;
  const chamfer = 0.25;
  const xMin = axisX - halfX;
  const xMax = axisX + halfX;
  const yMin = axisY - halfY;
  const yMax = axisY + halfY;
  const stick: Solid = {
    id: 'heavy-handle-stick',
    kind: 'extruded-polygon',
    profile: [
      [rootX + 0.25, rootY],
      [rootX + 0.75, rootY],
      [rootX + 0.75, rootY + HEAVY_HANDLE_STICK_HEIGHT_U],
      [rootX + 0.25, rootY + HEAVY_HANDLE_STICK_HEIGHT_U],
    ],
    z: [paddleInnerZ, HEAVY_CARRIER_ENVELOPE.z[0] + 0.25],
    slot: 'metal',
  };
  const paddle: Solid = {
    id: 'charging-handle',
    kind: 'extruded-polygon',
    profile: [
      [xMin + chamfer, yMin],
      [xMax - chamfer, yMin],
      [xMax, yMin + chamfer],
      [xMax, yMax - chamfer],
      [xMax - chamfer, yMax],
      [xMin + chamfer, yMax],
      [xMin, yMax - chamfer],
      [xMin, yMin + chamfer],
    ],
    z: [paddleOuterZ, paddleInnerZ],
    clip: [
      { normal: [1, 0, -1], offset: xMax - paddleOuterZ - chamfer },
      { normal: [-1, 0, -1], offset: -xMin - paddleOuterZ - chamfer },
      { normal: [0, 1, -1], offset: yMax - paddleOuterZ - chamfer },
      { normal: [0, -1, -1], offset: -yMin - paddleOuterZ - chamfer },
    ],
    display: { bevel: false },
    slot: 'metal',
  };
  return [stick, paddle];
};

export const heavyBoltCarrier: PartFamily = {
  name: 'heavy-bolt-carrier',
  params: {},
  build(): PartDef {
    const { x, y, z } = HEAVY_CARRIER_ENVELOPE;
    return {
      family: 'bolt-carrier',
      solids: [box('carrier-body', [x[0], y[0], z[0]], [x[1], y[1], z[1]]), ...chargingHandleSolids()],
      ports: [
        {
          id: 'mount',
          mount: 'bolt-carrier',
          gender: 'male',
          pos: [0, 0, 0],
          normal: X,
          up: [0, 1, 0],
          required: true,
        },
      ],
      keepOuts: [
        {
          id: 'charging-handle',
          kind: 'charging-handle',
          box: boxFromMinMax(
            [x[0] - 0.5, y[0] - HEAVY_HANDLE_ROOT_DROP_U - 0.25, -2 - HEAVY_HANDLE_OUTSTAND_U - 0.25],
            [
              x[0] + 1.5,
              y[0] - HEAVY_HANDLE_ROOT_DROP_U + HEAVY_HANDLE_STICK_HEIGHT_U + 0.25,
              -2 - HEAVY_HANDLE_OUTSTAND_U + HEAVY_HANDLE_PADDLE_THICKNESS_U + 0.25,
            ],
          ),
        },
      ],
      axes: [],
      motion: {
        kind: 'linear',
        axis: [1, 0, 0],
        start: [0, 0, 0],
        end: [0, 0, 0],
        sourceKeepOut: { port: 'mount', id: 'bolt-travel' },
      },
    };
  },
};
