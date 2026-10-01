import type { PartDef, PartFamily } from '../../core/schema.ts';
import { box, X } from './common.ts';
import { HEAVY_MAGAZINE_DEPTH } from './heavyMagazine.ts';

/**
 * The bolt carrier for the .50 rifle: a plain block as long as the ejection port the receiver gives it. The
 * shared `bolt-carrier` family's `barrett` envelope is 6u long; this one is built so that the carrier's face
 * bounds plus the ejection margin on each end span the magazine's depth (13u), which puts the port almost as
 * long as the magazine, as on the real rifle. It plays the `bolt-carrier` role and moves along the receiver's
 * `bolt-travel` keep-out like the shared one.
 *
 * `HEAVY_EJECTION_PORT_MARGIN_U` repeats `EJECTION_PORT_MARGIN_U` from parts.ts (the clearance every ejection
 * aperture leaves around its carrier), which this file cannot import: parts.ts imports it. test/antiMateriel.test.ts
 * pins the copy.
 */
export const HEAVY_EJECTION_PORT_MARGIN_U = 0.25;

/** Carrier extents (x, y, z), centred on the carrier port. */
export const HEAVY_CARRIER_ENVELOPE = {
  x: [
    -(HEAVY_MAGAZINE_DEPTH - 2 * HEAVY_EJECTION_PORT_MARGIN_U) / 2,
    (HEAVY_MAGAZINE_DEPTH - 2 * HEAVY_EJECTION_PORT_MARGIN_U) / 2,
  ],
  y: [-0.75, 0.75],
  z: [-1.25, 1.25],
} as const;

export const heavyBoltCarrier: PartFamily = {
  name: 'heavy-bolt-carrier',
  params: {},
  build(): PartDef {
    const { x, y, z } = HEAVY_CARRIER_ENVELOPE;
    return {
      family: 'bolt-carrier',
      solids: [box('carrier-body', [x[0], y[0], z[0]], [x[1], y[1], z[1]])],
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
      keepOuts: [],
      axes: [],
      motion: {
        kind: 'linear',
        axis: [1, 0, 0],
        rest: [0, 0, 0],
        rearmost: [0, 0, 0],
        sourceKeepOut: { port: 'mount', id: 'bolt-travel' },
      },
    };
  },
};
