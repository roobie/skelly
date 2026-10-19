import { boxFromMinMax, clippedExtrudedPolygonPolyhedron, polyhedronVolume } from '@skelly/engine/core/geometry.ts';
import type { PartDef, PortDef } from '@skelly/engine/core/schema.ts';
import type { Box, Solid, Vec2 } from '@skelly/engine/core/solid.ts';
import { type SectionPocket, subtractAxialPockets, subtractConvexSection } from './receiverSection.ts';
import { roundedTriggerGuardSolids } from './roundedTriggerGuard.ts';
import { SPORTER_PROPORTIONS as P } from './sporterProportions.ts';

type Station = readonly [x: number, top: number, bottom: number];

export const cutSporterAction = ({
  solids,
  port,
  magazine,
}: {
  solids: readonly Solid[];
  port: { readonly x: readonly [number, number]; readonly y: readonly [number, number] };
  magazine: { readonly x: number; readonly depth: number; readonly width: number } | undefined;
}): Solid[] => {
  const radius = Math.max(P.receiver.flatRadiusU, P.receiver.ringRadiusU);
  const pockets: SectionPocket[] = [
    { x: port.x, y: port.y, z: [0, radius] },
    { x: port.x, y: [0, radius], z: [-radius, radius] },
    ...(magazine
      ? [
          {
            x: [magazine.x - magazine.depth / 2, magazine.x + magazine.depth / 2] as const,
            y: [-radius, 0] as const,
            z: [-magazine.width / 2, magazine.width / 2] as const,
          },
        ]
      : []),
  ];
  return solids.flatMap((solid) => subtractAxialPockets(solid, pockets));
};
const metal = (id: string, min: readonly [number, number, number], max: readonly [number, number, number]): Solid => ({
  id,
  kind: 'box',
  box: boxFromMinMax(min, max),
  slot: 'metal',
});
const sporterFinger = (): Box =>
  boxFromMinMax(
    [P.lower.finger.x[0], P.lower.finger.y[0], P.lower.finger.z[0]],
    [P.lower.finger.x[1], P.lower.finger.y[1], P.lower.finger.z[1]],
  );

export const sporterLower = (top: PortDef, magazine: PortDef, path: PartDef['keepOuts'][number]): PartDef => {
  const { finger, guardWallU: wall, guardHalfWidthU: half, plateThicknessU: plate, plateHalfWidthU: width } = P.lower;
  return {
    family: 'lower',
    solids: [
      ...P.foreEnd.stations.slice(1).map((end, index): Solid => {
        const start = P.foreEnd.stations[index]!;
        return {
          id: `floorplate-${index}`,
          kind: 'extruded-polygon',
          profile: [
            [start[0], start[2] - P.lower.mountY - plate],
            [end[0], end[2] - P.lower.mountY - plate],
            [end[0], end[2] - P.lower.mountY],
            [start[0], start[2] - P.lower.mountY],
          ],
          z: [-width, width],
          slot: 'metal',
        };
      }),
      ...roundedTriggerGuardSolids(sporterFinger(), {
        x: [finger.x[0] - wall - P.lower.guardSideClearanceU, finger.x[1] + wall + P.lower.guardSideClearanceU],
        y: [finger.y[0] - wall, finger.y[1] + wall],
        innerX: [finger.x[0] - P.lower.guardSideClearanceU, finger.x[1] + P.lower.guardSideClearanceU],
        z: [-half, half],
        corner: P.lower.guardCornerU,
      }),
      ...P.lower.trigger.map(
        (profile, index): Solid => ({
          id: `trigger-${index}`,
          kind: 'extruded-polygon',
          profile,
          z: [-wall, wall],
          slot: 'metal',
        }),
      ),
    ],
    ports: [top, magazine],
    keepOuts: [{ id: 'trigger-finger', kind: 'trigger-finger', box: sporterFinger() }, path],
    axes: [],
  };
};

export const sporterStock = (solids: readonly Solid[]): Solid[] =>
  solids.flatMap((solid) => {
    if (solid.kind !== 'extruded-polygon' || solid.slot !== 'furniture') {
      return [solid];
    }
    const { tang } = P;
    const left = tang.rearX - P.receiver.rearX;
    const right = tang.frontX - P.receiver.rearX;
    if (Math.max(...solid.profile.map(([x]) => x)) <= left) {
      return [solid];
    }
    const roof = Math.max(...solid.profile.map(([, y]) => y), tang.topU - P.stock.seatY);
    const opening: Vec2[] = [
      [left, tang.rearBottomU - P.stock.seatY],
      [right, tang.bottomU - P.stock.seatY],
      [right, roof],
      [left, roof],
    ];
    const bands = [solid.z[0], -tang.halfWidthU, tang.halfWidthU, solid.z[1]].filter(
      (z) => z >= solid.z[0] && z <= solid.z[1],
    );
    return bands.slice(0, -1).flatMap((start, band) => {
      const end = bands[band + 1]!;
      const profiles =
        start >= -tang.halfWidthU && end <= tang.halfWidthU
          ? subtractConvexSection(solid.profile, opening)
          : [solid.profile];
      return profiles
        .map(
          (profile, piece): Solid => ({ ...solid, id: `${solid.id}-tang-${band}-${piece}`, profile, z: [start, end] }),
        )
        .filter((piece) => {
          if (piece.kind !== 'extruded-polygon') {
            return false;
          }
          const polyhedron = clippedExtrudedPolygonPolyhedron(piece);
          return polyhedron !== undefined && polyhedronVolume(polyhedron) > 1e-9;
        });
    });
  });

export const sporterActionDetails = (): Solid[] => [
  ...P.pillars.map((pillar, index) =>
    metal(
      `receiver-bedding-pillar-${index}`,
      [pillar.x[0], pillar.bottomU, -pillar.halfWidthU],
      [pillar.x[1], pillar.topU, pillar.halfWidthU],
    ),
  ),
  {
    id: 'receiver-tang',
    kind: 'extruded-polygon',
    profile: [
      [P.tang.rearX, P.tang.rearBottomU],
      [P.tang.frontX, P.tang.bottomU],
      [P.tang.frontX, P.tang.topU],
      [P.tang.rearX, P.tang.rearTopU],
    ],
    z: [-P.tang.halfWidthU, P.tang.halfWidthU],
    slot: 'metal',
  },
  metal(
    'receiver-recoil-lug',
    [P.recoilLug.rearX, P.recoilLug.bottomU, -P.recoilLug.halfWidthU],
    [P.recoilLug.frontX, P.recoilLug.topU, P.recoilLug.halfWidthU],
  ),
];

const stationAt = ([x0, top0, bottom0]: Station, [x1, top1, bottom1]: Station, x: number): Station => {
  const progress = (x - x0) / (x1 - x0);
  return [x, top0 + (top1 - top0) * progress, bottom0 + (bottom1 - bottom0) * progress];
};
const furnitureCell = (a: Station, b: Station, cap: boolean, id: string): Solid => {
  const topSlope = (b[1] - a[1]) / (b[0] - a[0]);
  const bottomSlope = (b[2] - a[2]) / (b[0] - a[0]);
  const width = P.foreEnd.halfWidthU;
  const [[rearX], [fullWidthX]] = P.foreEnd.stations;
  const widthSlope = a[0] < fullWidthX ? (width - P.foreEnd.rearHalfWidthU) / (fullWidthX - rearX) : 0;
  const widthOffset = widthSlope === 0 ? width : P.foreEnd.rearHalfWidthU - widthSlope * rearX;
  return {
    id,
    kind: 'extruded-polygon',
    axis: 'x',
    z: [a[0], b[0]],
    profile: [
      [Math.min(a[2], b[2]), -width],
      [Math.max(a[1], b[1]), -width],
      [Math.max(a[1], b[1]), width],
      [Math.min(a[2], b[2]), width],
    ],
    clip: [
      { normal: [-widthSlope, 0, -1], offset: widthOffset },
      { normal: [-widthSlope, 0, 1], offset: widthOffset },
      { normal: [-topSlope, 1, 0], offset: a[1] - topSlope * a[0] },
      { normal: [bottomSlope, -1, 0], offset: -a[2] + bottomSlope * a[0] },
    ],
    slot: cap ? 'accent' : 'furniture',
    ...(cap ? { material: 'rubber-black' } : {}),
    display: { bevel: false, outline: false, mergeGroup: cap ? 'sporter-fore-end-cap' : 'sporter-stock-bed' },
  };
};

const furnitureStations = (length: number): readonly Station[] => [
  ...P.foreEnd.stations,
  [length - P.foreEnd.capLengthU, P.foreEnd.noseTopU, P.foreEnd.noseBottomU],
  [length, P.foreEnd.tipTopU, P.foreEnd.tipBottomU],
];

export const sporterSupport = (length: number): readonly [number, number, number] => {
  const x = length * P.foreEnd.supportFraction;
  const stations = furnitureStations(length);
  const index = stations.findIndex((station) => station[0] >= x);
  const point = stationAt(stations[index - 1]!, stations[index]!, x);
  return [x, point[2], 0];
};

export const sporterFurniture = ({
  length,
  barrelRadius,
  roundSection,
  magazine,
  handleSpace,
  ejectionWindow,
}: {
  length: number;
  barrelRadius: number;
  roundSection: (radius: number) => readonly Vec2[];
  magazine: { depth: number; width: number; x: number };
  handleSpace: Box;
  ejectionWindow: { readonly x: readonly [number, number]; readonly y: readonly [number, number] };
}): Solid[] => {
  const capStart = length - P.foreEnd.capLengthU;
  const stations = furnitureStations(length);
  const { finger, mountY } = P.lower;
  const pockets: SectionPocket[] = [
    { x: ejectionWindow.x, y: ejectionWindow.y, z: [P.receiver.flatRadiusU, P.foreEnd.halfWidthU] },
    {
      x: [handleSpace.center[0] - handleSpace.half[0], handleSpace.center[0] + handleSpace.half[0]],
      y: [handleSpace.center[1] - handleSpace.half[1], handleSpace.center[1] + handleSpace.half[1]],
      z: [handleSpace.center[2] - handleSpace.half[2], handleSpace.center[2] + handleSpace.half[2]],
    },
    ...P.pillars.map(
      (pillar): SectionPocket => ({
        x: pillar.x,
        y: [pillar.bottomU, pillar.topU],
        z: [-pillar.halfWidthU, pillar.halfWidthU],
      }),
    ),
    { x: P.handle.reliefX, y: [P.handle.reliefBottomU, P.receiver.ringRadiusU], z: [0, P.foreEnd.halfWidthU] },
    {
      x: [magazine.x - magazine.depth / 2, magazine.x + magazine.depth / 2],
      y: [P.stock.joinBottomU, P.receiver.flatRadiusU],
      z: [-magazine.width / 2, magazine.width / 2],
    },
    { x: finger.x, y: [mountY + finger.y[0], mountY + finger.y[1]], z: finger.z },
    {
      x: [P.recoilLug.rearX, P.recoilLug.frontX],
      y: [P.recoilLug.bottomU, P.recoilLug.topU],
      z: [-P.recoilLug.halfWidthU, P.recoilLug.halfWidthU],
    },
  ];
  return stations.slice(1).flatMap((end, index) => {
    const start = stations[index]!;
    const cuts = [
      start[0],
      ...[P.receiver.ringRearX, P.receiver.frontX].filter((x) => x > start[0] && x < end[0]),
      end[0],
    ];
    return cuts.slice(1).flatMap((x1, span) => {
      const x0 = cuts[span]!;
      const cell = furnitureCell(
        stationAt(start, end, x0),
        stationAt(start, end, x1),
        x0 >= capStart,
        `sporter-furniture-${index}-${span}`,
      );
      if (cell.kind !== 'extruded-polygon') {
        throw new Error('Furniture cell must be an axial extrusion');
      }
      let radius = P.receiver.flatRadiusU as number;
      if (x0 >= P.receiver.frontX) {
        radius = barrelRadius;
      } else if (x0 >= P.receiver.ringRearX) {
        radius = P.receiver.ringRadiusU;
      }
      return subtractConvexSection(cell.profile, roundSection(radius + P.foreEnd.clearanceU))
        .flatMap((profile, region) => subtractAxialPockets({ ...cell, id: `${cell.id}-${region}`, profile }, pockets))
        .filter((solid) => solid.kind === 'extruded-polygon' && clippedExtrudedPolygonPolyhedron(solid));
    });
  });
};
