import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { integer, minValue, parse, picklist, pipe, strictObject } from 'valibot';
import { annulus, cylinder, positive, revolve, scalar } from './shapes.ts';

export const openTin = (params: Readonly<Record<string, string>>): readonly Solid[] => {
  const d = parse(
    strictObject({
      radius: positive,
      height: positive,
      wall: positive,
      rimWidth: positive,
      labelHeight: positive,
      labelThickness: positive,
      stripeHeight: positive,
      hingeWidth: positive,
      hingeHeight: positive,
      serving: picklist(['empty', 'beans', 'soup', 'drink']),
      foodDepth: positive,
      beanRadius: positive,
      beanCount: pipe(scalar, integer(), minValue(1)),
    }),
    params,
  );
  if (
    !(
      d.wall < d.radius &&
      d.rimWidth < d.radius &&
      d.labelHeight < d.height &&
      d.stripeHeight < d.labelHeight &&
      d.foodDepth < d.height &&
      d.hingeWidth < d.radius * 2 &&
      d.beanRadius * 2 < d.radius - d.wall
    )
  ) {
    throw new Error('Invalid opened tin dimensions');
  }
  const inner = d.radius - d.wall;
  const solids: Solid[] = [
    annulus('wall', [inner, d.radius], d.height),
    cylinder('bottom', d.radius, d.wall),
    annulus('bottom-seam', [inner, d.radius + d.rimWidth], d.rimWidth),
    { ...annulus('mouth-seam', [inner, d.radius + d.rimWidth], d.rimWidth), origin: [0, d.height - d.rimWidth, 0] },
    {
      ...annulus('label', [d.radius, d.radius + d.labelThickness], d.labelHeight, 'label'),
      origin: [0, (d.height - d.labelHeight) / 2, 0],
    },
    {
      ...cylinder('raised-lid', inner, d.wall),
      axis: 'z',
      origin: [0, d.height + inner, -d.radius],
    },
    {
      ...annulus('lid-pressed-rim', [inner - d.rimWidth * 2, inner - d.rimWidth], d.wall),
      axis: 'z',
      origin: [0, d.height + inner, -d.radius - d.wall],
    },
    {
      id: 'uncut-hinge',
      kind: 'box',
      slot: 'body',
      box: { center: [0, d.height, -d.radius + d.wall / 2], half: [d.hingeWidth / 2, d.hingeHeight, d.wall] },
    },
  ];
  for (const y of [(d.height - d.labelHeight) / 2, (d.height + d.labelHeight) / 2 - d.stripeHeight]) {
    solids.push({
      ...annulus(
        `label-stripe-${y}`,
        [d.radius + d.labelThickness, d.radius + d.labelThickness * 2],
        d.stripeHeight,
        'stripe',
      ),
      origin: [0, y, 0],
    });
  }
  if (d.serving !== 'empty') {
    const foodY = d.height - d.foodDepth;
    solids.push({ ...cylinder('serving', inner, d.wall, 'food'), origin: [0, foodY, 0] });
    if (d.serving === 'beans') {
      for (let index = 0; index < d.beanCount; index++) {
        const angle = (index * Math.PI * 2) / d.beanCount;
        solids.push({
          ...revolve(
            `bean-${index}`,
            [
              [0, 0],
              [0, d.beanRadius],
              [d.beanRadius / 2, d.beanRadius],
              [d.beanRadius, 0],
              [0, 0],
            ],
            'food',
          ),
          origin: [(Math.cos(angle) * inner) / 2, foodY, (Math.sin(angle) * inner) / 2],
        });
      }
    }
  }
  return solids;
};
