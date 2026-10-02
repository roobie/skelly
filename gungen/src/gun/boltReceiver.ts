import { GRID } from '../core/conventions.ts';
import type { Vec3 } from '../core/math.ts';
import type { KeepOut, PartFamily, Solid, Vec2 } from '../core/schema.ts';
import { GUN_UNITS } from './units.ts';

/** Dispatch's R700-class envelope, at 11.5 mm/u; interfaces retain their existing assembly datums. */
export const BOLT_RECEIVER = {
  radius: 1.5,
  innerRadius: 1.25,
  x: [-16.75, 2] as const,
  portX: [-9.75, -3.25] as const,
  railY: 2.5,
  facets: 16,
  travel: 7,
  restX: -6,
  stemZ: 1.75,
  handleRestRotation: 45,
  liftDegrees: 90,
  // SAAMI .308 Winchester maximum head and overall length; a reference, not an ammunition binding.
  referenceRound: { headMm: 0.473 * 25.4, overallMm: 2.81 * 25.4 },
} as const;

const box = (id: string, min: Vec3, max: Vec3): Extract<Solid, { kind: 'box' }> => ({
  id,
  kind: 'box',
  slot: 'metal',
  box: {
    center: min.map((v, i) => (v + max[i]!) / 2) as unknown as Vec3,
    half: min.map((v, i) => (max[i]! - v) / 2) as unknown as Vec3,
  },
});
const keepOut = (id: string, min: Vec3, max: Vec3): KeepOut => ({
  id,
  kind: id,
  box: {
    center: min.map((v, i) => (v + max[i]!) / 2) as unknown as Vec3,
    half: min.map((v, i) => (max[i]! - v) / 2) as unknown as Vec3,
  },
});
export const cartridgeLoadingPath = (): Extract<Solid, { kind: 'box' }> => {
  const radius =
    (Math.ceil((BOLT_RECEIVER.referenceRound.headMm / (GUN_UNITS.metresPerUnit * 1000) + GRID) / GRID) * GRID) / 2;
  return box('cartridge-loading-path', [BOLT_RECEIVER.portX[0], -radius, -radius], [BOLT_RECEIVER.portX[1], radius, 6]);
};
const sleeve = (id: string, x: readonly [number, number], inner: number): Solid => ({
  id,
  kind: 'revolved',
  axis: 'x',
  slot: 'metal',
  profile: [
    [x[0], BOLT_RECEIVER.radius],
    [x[1], BOLT_RECEIVER.radius],
    [x[1], inner],
    [x[0], inner],
    [x[0], BOLT_RECEIVER.radius],
  ],
});

/** Convex annular wall cells retain the bore and openings that a full revolved collision hull would fill. */
const wallCells = (
  x: readonly [number, number],
  inner: number,
  omitted: ReadonlySet<number>,
  prefix: string,
): Solid[] =>
  Array.from({ length: BOLT_RECEIVER.facets }, (_, facet) => {
    if (omitted.has(facet)) {
      return null;
    }
    const a = (facet * 2 * Math.PI) / BOLT_RECEIVER.facets;
    const b = ((facet + 1) * 2 * Math.PI) / BOLT_RECEIVER.facets;
    const point = (angle: number, radius: number): Vec2 => [radius * Math.cos(angle), radius * Math.sin(angle)];
    return {
      id: `${prefix}-${facet}`,
      kind: 'extruded-polygon' as const,
      axis: 'x' as const,
      z: x,
      profile: [point(a, BOLT_RECEIVER.radius), point(b, BOLT_RECEIVER.radius), point(b, inner), point(a, inner)],
      slot: 'metal',
      display: { bevel: false, outline: false, mergeGroup: 'bolt-receiver-wall' },
    };
  }).filter((solid): solid is NonNullable<typeof solid> => solid !== null);

const deck = (id: string, x: readonly [number, number]): Solid => ({
  id,
  kind: 'extruded-polygon',
  axis: 'x',
  z: x,
  slot: 'metal',
  profile: [
    [2.25, -1.25],
    [2.5, -1.25],
    [2.5, 1.25],
    [2.25, 0.5],
  ],
  display: { bevel: false },
});
const supports = (): Solid[] => [
  // Keep the lower's actual contact plane at -2.5u, with a tang and front recoil-lug bearing.
  box('receiver-bottom-bearing', [-16, -2.5, -1], [0, -1.25, 1]),
  box('receiver-recoil-lug', [-0.5, -2.5, -1.75], [0, -1, 1.75]),
  box('receiver-rear-tang', [-16, -1.25, -1.5], [-15.5, 0.5, 1.5]),
  // Left-side saddles leave the lifted stem's top/right raceway empty underneath the decks.
  box('receiver-rear-saddle', [-14, 0.5, -1.25], [-13, 2.25, -1]),
  box('receiver-front-saddle', [-3, 0.5, -1.25], [-2, 2.25, -1]),
  deck('receiver-optic-rear-deck', [-14.5, -12.5]),
  deck('receiver-optic-front-deck', [-3.25, -1.25]),
];

export const makeBoltReceiver = (standard: PartFamily): PartFamily => ({
  name: 'receiver',
  params: {
    boltHandleProfile: standard.params.boltHandleProfile!,
    action: { values: ['bolt'], default: 'bolt' },
    feed: { values: ['top'], default: 'top' },
    section: { values: ['bolt-tube'], default: 'bolt-tube' },
    carrierPattern: { ...standard.params.carrierPattern!, values: ['bolt'], default: 'bolt' },
    handleStyle: { ...standard.params.handleStyle!, values: ['auto', 'bolt'], default: 'auto' },
    bore: { values: ['M', 'L'], default: 'M' },
  },
  build(params) {
    const base = standard.build({
      ...params,
      section: 'standard',
      action: 'bolt',
      feed: 'top',
      carrierPattern: 'bolt',
      handleStyle: 'bolt',
    });
    const inner = BOLT_RECEIVER.innerRadius;
    const bridge = wallCells([-16.75, -16], inner, new Set(), 'receiver-rear-bridge');
    const rear = wallCells([-16, -9.75], inner, new Set([0, 1, 2]), 'receiver-rear-wall');
    const port = wallCells(BOLT_RECEIVER.portX, inner, new Set([0, 1, 2, 3, 4, 5, 6]), 'receiver-port-wall');
    const socketRadius = (params.bore === 'L' ? 1.25 : 1) / Math.cos(Math.PI / 8);
    const front = [
      ...wallCells([-3.25, 0], inner, new Set(), 'receiver-front-ring'),
      ...wallCells([0, 2], socketRadius, new Set(), 'receiver-barrel-socket'),
    ];
    const hardware = supports();
    const path = cartridgeLoadingPath();
    const loading: KeepOut = { id: path.id, kind: path.id, box: path.box };
    return {
      ...base,
      solids: [...bridge, ...rear, ...port, ...front, ...hardware],
      displaySolids: [
        sleeve('receiver-rear-bridge', [-16.75, -16], inner),
        ...rear,
        ...port,
        sleeve('receiver-front-ring', [-3.25, 0], inner),
        sleeve('receiver-barrel-socket', [0, 2], socketRadius),
        ...hardware,
      ],
      ports: base.ports.map((p) => {
        if (p.id === 'bolt-carrier') {
          return { ...p, pos: [BOLT_RECEIVER.restX, 0, 0] as const };
        }
        if (p.id === 'rail') {
          return { ...p, pos: [p.pos[0], BOLT_RECEIVER.railY, 0] as const };
        }
        return p;
      }),
      keepOuts: [
        { ...keepOut('bolt-travel', [-13, -0.25, -0.25], [-6, 0.25, 0.25]), allowPort: 'bolt-carrier' },
        { ...loading, allowPort: 'bolt-carrier', allowFamilies: ['bolt-handle'] },
      ],
      axes: [{ kind: 'bore', origin: [-16, 0, 0] as const, dir: [1, 0, 0] as const }],
    };
  },
});
