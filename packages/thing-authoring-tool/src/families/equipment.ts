import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import type { Solid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { integer, minValue, parse, picklist, pipe, strictObject, string, transform } from 'valibot';
import { annulus, box, link, positive, round } from './shapes.ts';

const count = pipe(string(), transform(Number), integer(), minValue(1));
const loop = (
  id: string,
  center: Vec3,
  [width, height, depth]: Vec3,
  { wall, slot }: { wall: number; slot: string },
) => {
  if (wall * 2 >= Math.min(width, depth)) {
    throw new Error('Equipment loop is closed');
  }
  const [x, y, z] = center;
  return [
    box(`${id}-left`, [x - (width - wall) / 2, y, z], [wall, height, depth], slot),
    box(`${id}-right`, [x + (width - wall) / 2, y, z], [wall, height, depth], slot),
    box(`${id}-front`, [x, y, z - (depth - wall) / 2], [width - 2 * wall, height, wall], slot),
    box(`${id}-back`, [x, y, z + (depth - wall) / 2], [width - 2 * wall, height, wall], slot),
  ];
};

export const blowtorch = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      radius: positive,
      bodyHeight: positive,
      footHeight: positive,
      neckRadius: positive,
      neckHeight: positive,
      nozzleLength: positive,
      nozzleRadius: positive,
      mouthLength: positive,
      mouthRadius: positive,
      valveRadius: positive,
    }),
    params,
  );
  const top = d.bodyHeight + d.neckHeight;
  return [
    round('body', [0, d.footHeight, 0], [d.radius, d.bodyHeight - d.footHeight], ['y', 'body']),
    round('foot', [0, 0, 0], [d.radius * 1.1, d.footHeight], ['y', 'rubber']),
    round('neck', [0, d.bodyHeight, 0], [d.neckRadius, d.neckHeight], ['y', 'metal']),
    round('nozzle', [0, top, 0], [d.nozzleRadius, d.nozzleLength], ['x', 'metal']),
    {
      ...annulus('mouth', [d.nozzleRadius * 0.75, d.mouthRadius], d.mouthLength, 'metal'),
      origin: [d.nozzleLength, top, 0] as Vec3,
      axis: 'x' as const,
    },
    round('valve', [-d.valveRadius, top, 0], [d.valveRadius, d.neckRadius * 2], ['x', 'control']),
    box(
      'trigger',
      [d.nozzleLength * 0.18, top - d.nozzleRadius * 2, 0],
      [d.nozzleLength * 0.22, d.nozzleRadius, d.nozzleRadius],
      'control',
    ),
  ];
};

export const headlamp = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      strapHalfWidth: positive,
      strapFront: positive,
      strapBack: positive,
      strapFrontChamfer: positive,
      strapBackChamfer: positive,
      strapWidth: positive,
      strapWall: positive,
      housingWidth: positive,
      housingHeight: positive,
      housingDepth: positive,
      lensRadius: positive,
      lensDepth: positive,
    }),
    params,
  );
  if (
    d.strapWall >= Math.min(d.strapHalfWidth, d.strapFront, d.strapBack) ||
    d.strapFrontChamfer >= Math.min(d.strapHalfWidth, d.strapFront) ||
    d.strapBackChamfer >= Math.min(d.strapHalfWidth, d.strapBack) ||
    2 * d.lensRadius > Math.min(d.housingWidth, d.housingHeight)
  ) {
    throw new Error('Invalid headlamp dimensions');
  }
  const outline = (x: number, front: number, back: number): Vec2[] => [
    [-front + d.strapFrontChamfer, -x],
    [back - d.strapBackChamfer, -x],
    [back, -x + d.strapBackChamfer],
    [back, x - d.strapBackChamfer],
    [back - d.strapBackChamfer, x],
    [-front + d.strapFrontChamfer, x],
    [-front, x - d.strapFrontChamfer],
    [-front, -x + d.strapFrontChamfer],
  ];
  const inner = outline(d.strapHalfWidth, d.strapFront, d.strapBack);
  const outer = outline(d.strapHalfWidth + d.strapWall, d.strapFront + d.strapWall, d.strapBack + d.strapWall);
  const strap = inner.map(
    (point, i): Solid => ({
      id: `strap-${i}`,
      kind: 'extruded-polygon',
      axis: 'y',
      profile: [point, outer[i]!, outer[(i + 1) % inner.length]!, inner[(i + 1) % inner.length]!],
      z: [0, d.strapWidth],
      slot: 'strap',
    }),
  );
  const z = -d.strapFront - d.strapWall - d.housingDepth / 2;
  return [
    ...strap,
    box('body', [0, d.housingHeight / 2, z], [d.housingWidth, d.housingHeight, d.housingDepth], 'body'),
    round(
      'bezel',
      [0, d.housingHeight / 2, z - d.housingDepth / 2 - d.lensDepth],
      [d.lensRadius, d.lensDepth],
      ['z', 'metal'],
    ),
    round(
      'lens',
      [0, d.housingHeight / 2, z - d.housingDepth / 2 - d.lensDepth * 1.1],
      [d.lensRadius * 0.8, d.lensDepth * 0.2],
      ['z', 'lens'],
    ),
    box(
      'switch',
      [d.housingWidth / 4, d.housingHeight, z],
      [d.housingWidth / 4, d.housingHeight / 8, d.housingDepth / 3],
      'control',
    ),
    box(
      'adjuster',
      [0, d.strapWidth / 2, d.strapBack + d.strapWall],
      [d.housingWidth * 0.7, d.strapWidth * 1.2, d.strapWall * 2],
      'control',
    ),
  ];
};

export const webbingSling = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      foldedLength: positive,
      width: positive,
      thickness: positive,
      buckleWidth: positive,
      buckleDepth: positive,
      buckleWall: positive,
      clipWidth: positive,
      clipLength: positive,
      clipWall: positive,
    }),
    params,
  );
  const solids: Solid[] = [];
  // The return folds stay joined: a sling reads as continuous webbing, not loose sticks.
  for (let i = 0; i < 3; i++) {
    solids.push(
      box(
        `webbing-${i}`,
        [0, d.thickness * (i + 0.5), (i - 1) * d.width * 1.25],
        [d.foldedLength, d.thickness, d.width],
        'strap',
      ),
    );
  }
  for (const [i, sign] of [-1, 1].entries()) {
    solids.push(
      box(
        `fold-${i}`,
        [(sign * (d.foldedLength - d.thickness)) / 2, d.thickness * (i + 1), (i - 0.5) * d.width * 1.25],
        [d.thickness, d.thickness * 2, d.width * 2.25],
        'strap',
      ),
    );
    solids.push(
      ...loop(
        `clip-${i}`,
        [(sign * (d.foldedLength + d.clipLength)) / 2, d.thickness / 2, sign * d.width * 1.25],
        [d.clipLength, d.thickness, d.clipWidth],
        { wall: d.clipWall, slot: 'metal' },
      ),
    );
  }
  solids.push(
    ...loop('buckle', [d.foldedLength * 0.18, d.thickness * 3.5, 0], [d.buckleWidth, d.thickness * 2, d.buckleDepth], {
      wall: d.buckleWall,
      slot: 'metal',
    }),
  );
  solids.push(
    box(
      'buckle-bar',
      [d.foldedLength * 0.18, d.thickness * 3.5, 0],
      [d.buckleWall, d.thickness * 2, d.buckleDepth],
      'metal',
    ),
  );
  return solids;
};

const layToolFlat = (solids: readonly Solid[]): Solid[] => {
  const cycle = ([x, y, z]: Vec3): Vec3 => [y, z, x];
  return solids.map((solid): Solid => {
    if (solid.kind === 'box') {
      return { ...solid, box: { center: cycle(solid.box.center), half: cycle(solid.box.half) } };
    }
    if (solid.kind === 'extruded-polygon') {
      return { ...solid, axis: 'y' };
    }
    return { ...solid, axis: 'y', origin: cycle(solid.origin ?? [0, 0, 0]) };
  });
};

export const pliers = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      kind: picklist(['wire', 'groove']),
      length: positive,
      jawLength: positive,
      spread: positive,
      gripWidth: positive,
      thickness: positive,
      pivotRadius: positive,
      teeth: count,
      toothDepth: positive,
    }),
    params,
  );
  if (d.jawLength >= d.length || d.spread <= d.gripWidth) {
    throw new Error('Invalid pliers dimensions');
  }
  const pivot = d.length - d.jawLength;
  const solids: Solid[] = [
    round('pivot', [0, pivot, -d.thickness * 0.7], [d.pivotRadius, d.thickness * 1.4], ['z', 'metal']),
  ];
  for (const sign of [-1, 1]) {
    solids.push(
      link(
        `grip-${sign}`,
        [
          [(sign * d.spread) / 2, d.gripWidth / 2],
          [sign * d.spread * 0.25, pivot * 0.75],
        ],
        [d.gripWidth, d.thickness * 1.3],
        'grip',
      ),
    );
    solids.push(
      link(
        `shank-${sign}`,
        [
          [sign * d.spread * 0.25, pivot * 0.75],
          [sign * d.pivotRadius * 0.25, pivot],
        ],
        [d.gripWidth * 0.7, d.thickness],
        'metal',
      ),
    );
    if (d.kind === 'wire') {
      const inner = d.toothDepth;
      solids.push(
        box(
          `jaw-${sign}`,
          [sign * (inner + d.gripWidth * 0.3), pivot + d.jawLength / 2, 0],
          [d.gripWidth * 0.6, d.jawLength, d.thickness],
          'metal',
        ),
      );
      for (let i = 0; i < d.teeth; i++) {
        solids.push(
          box(
            `gauge-${sign}-${i}`,
            [(sign * inner) / 2, pivot + ((i + 0.5) * d.jawLength) / d.teeth, 0],
            [inner, (d.jawLength / d.teeth) * 0.45, d.thickness],
            'metal',
          ),
        );
      }
    } else {
      solids.push(
        link(
          `jaw-neck-${sign}`,
          [
            [0, pivot],
            [sign * d.spread * 0.25, pivot + d.jawLength * 0.65],
          ],
          [d.gripWidth * 0.7, d.thickness],
          'metal',
        ),
      );
      solids.push(
        link(
          `jaw-${sign}`,
          [
            [sign * d.spread * 0.25, pivot + d.jawLength * 0.65],
            [sign * d.toothDepth, d.length],
          ],
          [d.gripWidth * 0.65, d.thickness],
          'metal',
        ),
      );
      for (let i = 0; i < d.teeth; i++) {
        solids.push(
          box(
            `groove-${sign}-${i}`,
            [sign * d.pivotRadius * 0.7, pivot - d.pivotRadius + (i * d.pivotRadius) / d.teeth, d.thickness * 0.55],
            [d.pivotRadius, d.toothDepth / 2, d.toothDepth / 2],
            'dark',
          ),
        );
      }
    }
  }
  return layToolFlat(solids);
};

export const repairKit = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      kind: picklist(['patches', 'sewing']),
      width: positive,
      depth: positive,
      height: positive,
      wall: positive,
      rollRadius: positive,
      rollHeight: positive,
      patchWidth: positive,
      patchDepth: positive,
    }),
    params,
  );
  if (2 * d.wall >= Math.min(d.width, d.depth, d.height)) {
    throw new Error('Invalid repair kit walls');
  }
  const solids: Solid[] = [
    box('body', [0, d.wall / 2, 0], [d.width, d.wall, d.depth], 'body'),
    ...loop('rim', [0, d.height / 2, 0], [d.width, d.height, d.depth], { wall: d.wall, slot: 'body' }),
    box('patch', [-d.width * 0.2, d.height * 0.7, 0], [d.patchWidth, d.wall * 2, d.patchDepth], 'patch'),
  ];
  if (d.kind === 'patches') {
    solids.push({
      ...annulus('tape', [d.rollRadius * 0.5, d.rollRadius], d.rollHeight, 'roll'),
      origin: [d.width * 0.25, d.wall, 0] as Vec3,
    });
    solids.push(
      box(
        'rag',
        [-d.width * 0.22, d.height * 0.45, d.depth * 0.1],
        [d.patchWidth * 1.1, d.wall * 3, d.patchDepth * 1.1],
        'cloth',
      ),
    );
    for (let i = 0; i < 2; i++) {
      solids.push(
        box(
          `rivet-${i}`,
          [-d.width * 0.32 + i * d.patchWidth * 0.6, d.height * 0.7 + d.wall * 1.1, -d.patchDepth * 0.3],
          [d.wall * 2, d.wall, d.wall * 2],
          'metal',
        ),
      );
    }
  } else {
    for (const sign of [-1, 1]) {
      const origin: Vec3 = [d.width * 0.25, d.wall, sign * d.depth * 0.22];
      solids.push(round(`thread-${sign}`, origin, [d.rollRadius * 0.8, d.rollHeight], ['y', 'roll']));
      for (const h of [0, d.rollHeight]) {
        solids.push(
          round(`flange-${sign}-${h}`, [origin[0], origin[1] + h, origin[2]], [d.rollRadius, d.wall], ['y', 'cloth']),
        );
      }
    }
    solids.push(
      box(
        'needle-card',
        [-d.width * 0.2, d.height * 0.7 + d.wall * 2, 0],
        [d.patchWidth * 0.5, d.wall, d.patchDepth * 0.8],
        'cloth',
      ),
    );
    for (let i = 0; i < 3; i++) {
      solids.push(
        box(
          `needle-${i}`,
          [-d.width * 0.28 + i * d.patchWidth * 0.15, d.height * 0.7 + d.wall * 2.6, 0],
          [d.wall * 0.3, d.wall * 0.3, d.patchDepth * 0.7],
          'metal',
        ),
      );
    }
  }
  return solids;
};

export const portableRadio = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      width: positive,
      height: positive,
      depth: positive,
      antennaLength: positive,
      antennaRadius: positive,
      dialRadius: positive,
      dialDepth: positive,
      speakerRadius: positive,
      grilleBars: count,
    }),
    params,
  );
  const front = -d.depth / 2;
  const solids: Solid[] = [
    box('body', [0, d.height / 2, 0], [d.width, d.height, d.depth], 'body'),
    round('antenna', [-d.width * 0.3, d.height, 0], [d.antennaRadius, d.antennaLength], ['y', 'metal']),
    round(
      'antenna-tip',
      [-d.width * 0.3, d.height + d.antennaLength, 0],
      [d.antennaRadius * 1.5, d.antennaRadius * 3],
      ['y', 'control'],
    ),
    round(
      'speaker',
      [0, d.height * 0.35, front - d.dialDepth * 0.2],
      [d.speakerRadius, d.dialDepth * 0.2],
      ['z', 'control'],
    ),
    box(
      'tuning-window',
      [0, d.height * 0.75, front - d.dialDepth * 0.2],
      [d.width * 0.75, d.height * 0.13, d.dialDepth * 0.3],
      'display',
    ),
    box(
      'tuning-marker',
      [d.width * 0.1, d.height * 0.75, front - d.dialDepth * 0.4],
      [d.antennaRadius, d.height * 0.1, d.antennaRadius],
      'marker',
    ),
    round('dial', [d.width * 0.25, d.height, 0], [d.dialRadius, d.dialDepth], ['y', 'control']),
  ];
  for (let i = 0; i < d.grilleBars; i++) {
    const offset = (((i + 0.5) / d.grilleBars) * 2 - 1) * d.speakerRadius * 0.9;
    const half = Math.sqrt(d.speakerRadius ** 2 - offset ** 2);
    solids.push(
      box(
        `grille-${i}`,
        [offset, d.height * 0.35, front - d.dialDepth * 0.3],
        [(d.speakerRadius / d.grilleBars) * 0.45, half * 2, d.dialDepth * 0.2],
        'metal',
      ),
    );
  }
  return solids;
};
