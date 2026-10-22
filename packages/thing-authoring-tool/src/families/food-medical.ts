import type { BoxSolid, Solid } from '@skelly/engine/shapes/solid.ts';
import { integer, parse, pipe, strictObject } from 'valibot';
import { annulus, cylinder, positive, revolve } from './shapes.ts';

export const stemmedFruit = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({
      radius: positive,
      height: positive,
      stemRadius: positive,
      stemHeight: positive,
      leafLength: positive,
      leafWidth: positive,
      leafThickness: positive,
    }),
    params,
  );
  const body = revolve('body', [
    [0, 0],
    [0, d.radius * 0.32],
    [d.height * 0.08, d.radius * 0.64],
    [d.height * 0.3, d.radius * 0.91],
    [d.height * 0.57, d.radius],
    [d.height * 0.8, d.radius * 0.94],
    [d.height * 0.96, d.radius * 0.65],
    [d.height, d.radius * 0.28],
    [d.height * 0.88, 0],
    [0, 0],
  ]);
  return [
    body,
    { ...cylinder('stem', d.stemRadius, d.stemHeight, 'stem'), origin: [0, d.height * 0.88, 0] },
    {
      id: 'leaf',
      kind: 'extruded-polygon',
      axis: 'y',
      slot: 'leaf',
      profile: [
        [0, 0],
        [d.leafWidth / 2, d.leafLength / 2],
        [0, d.leafLength],
        [-d.leafWidth / 2, d.leafLength / 2],
      ],
      z: [d.height, d.height + d.leafThickness],
    },
  ];
};

export const foodPortion = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({
      radius: positive,
      height: positive,
      chunkRadius: positive,
      chunkLength: positive,
      chunks: pipe(positive, integer()),
    }),
    params,
  );
  if (!(d.chunkLength < d.radius && d.chunkRadius < d.height)) {
    throw new Error('Food chunks must fit the portion');
  }
  const solids: Solid[] = [
    revolve('body', [
      [0, 0],
      [0, d.radius * 0.8],
      [d.height * 0.15, d.radius],
      [d.height * 0.7, d.radius * 0.92],
      [d.height, d.radius * 0.65],
      [d.height, 0],
      [0, 0],
    ]),
  ];
  for (let i = 0; i < d.chunks; i++) {
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const radius = (d.radius - d.chunkLength) * Math.sqrt(i / d.chunks);
    solids.push({
      ...revolve(
        `chunk-${i}`,
        [
          [0, 0],
          [d.chunkLength * 0.12, d.chunkRadius * 0.7],
          [d.chunkLength * 0.3, d.chunkRadius],
          [d.chunkLength * 0.7, d.chunkRadius],
          [d.chunkLength * 0.88, d.chunkRadius * 0.7],
          [d.chunkLength, 0],
          [0, 0],
        ],
        'chunks',
      ),
      axis: 'z',
      origin: [Math.cos(angle) * radius, d.height, Math.sin(angle) * radius - d.chunkLength / 2],
    });
  }
  return solids;
};

export const woundRoll = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({
      radius: positive,
      boreRadius: positive,
      width: positive,
      layers: pipe(positive, integer()),
      groove: positive,
      tailLength: positive,
      tailThickness: positive,
    }),
    params,
  );
  if (!(d.boreRadius < d.radius - d.groove && d.tailThickness < d.width)) {
    throw new Error('Invalid wound roll dimensions');
  }
  const solids: Solid[] = [annulus('body', [d.boreRadius, d.radius], d.width)];
  const pitch = (d.radius - d.boreRadius) / d.layers;
  for (let i = 1; i < d.layers; i++) {
    const outer = d.boreRadius + i * pitch;
    solids.push({
      ...annulus(`layer-${i}`, [outer - d.groove, outer], d.tailThickness, 'edge'),
      origin: [0, d.width, 0],
    });
  }
  const tail: BoxSolid = {
    id: 'tail',
    kind: 'box',
    slot: 'body',
    box: {
      center: [
        Math.sqrt(Math.max(0, d.radius ** 2 - (d.width / 2) ** 2)) + d.tailLength / 2 - d.tailThickness,
        d.tailThickness / 2,
        0,
      ],
      half: [d.tailLength / 2, d.tailThickness / 2, d.width / 2],
    },
  };
  solids.push(tail);
  return solids;
};
