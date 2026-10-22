import type { BoxSolid } from '@skelly/engine/shapes/solid.ts';
import { parse, strictObject } from 'valibot';
import { annulus, cylinder, positive } from './shapes.ts';

const box = (
  id: string,
  center: readonly [number, number, number],
  dimensions: readonly [number, number, number],
  slot: string,
): BoxSolid => ({
  id,
  kind: 'box',
  box: { center, half: dimensions.map((value) => value / 2) as [number, number, number] },
  slot,
});

export const compass = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({ radius: positive, height: positive, bezelHeight: positive, dialHeight: positive }),
    params,
  );
  if (!(d.bezelHeight < d.height && d.dialHeight < d.bezelHeight)) {
    throw new Error('Invalid compass dimensions');
  }
  const well = d.radius * 0.76;
  const rim = d.radius * 1.03;
  return [
    cylinder('body', d.radius, d.height),
    {
      ...annulus('bezel', [well, rim], d.bezelHeight, 'bezel'),
      origin: [0, d.height, 0] as const,
    },
    // The dial sits down in the bezel's well; the lubber mark on the rim shows the way the compass points.
    { ...cylinder('dial', well, d.dialHeight, 'dial'), origin: [0, d.height, 0] as const },
    box(
      'lubber',
      [0, d.height + d.bezelHeight, -(well + rim) / 2],
      [d.radius * 0.1, d.bezelHeight * 0.3, rim - well],
      'lubber',
    ),
  ];
};

export const lighter = (params: Readonly<Record<string, string>>) => {
  const d = parse(strictObject({ width: positive, height: positive, depth: positive, capHeight: positive }), params);
  if (!(d.capHeight < d.height)) {
    throw new Error('Lighter cap must fit its body');
  }
  return [
    box('body', [0, d.height / 2, 0], [d.width, d.height, d.depth], 'body'),
    box('cap', [0, d.height + d.capHeight / 2, 0], [d.width * 0.72, d.capHeight, d.depth * 0.7], 'cap'),
    box(
      'wheel',
      [0, d.height + d.capHeight, -d.depth * 0.28],
      [d.width * 0.3, d.capHeight * 0.65, d.depth * 0.15],
      'wheel',
    ),
  ];
};

export const matchbox = (params: Readonly<Record<string, string>>) => {
  const d = parse(strictObject({ width: positive, height: positive, depth: positive, sleeve: positive }), params);
  if (!(d.sleeve < d.height / 2)) {
    throw new Error('Matchbox sleeve must fit its tray');
  }
  return [
    box('tray', [0, d.height / 2, 0], [d.width, d.height, d.depth], 'tray'),
    box('sleeve', [0, d.height + d.sleeve / 2, 0], [d.width * 1.04, d.sleeve, d.depth * 1.04], 'sleeve'),
    box('striker', [0, d.height / 2, d.depth * 0.53], [d.width * 0.72, d.height * 0.65, d.depth * 0.03], 'striker'),
  ];
};

export const key = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      bowRadius: positive,
      shaftLength: positive,
      shaftWidth: positive,
      thickness: positive,
      toothDepth: positive,
    }),
    params,
  );
  if (!(d.shaftWidth < 2 * d.bowRadius && d.toothDepth < d.bowRadius)) {
    throw new Error('Invalid key dimensions');
  }
  const shaftStart = d.bowRadius;
  return [
    {
      ...annulus('bow', [d.bowRadius * 0.4, d.bowRadius], d.thickness, 'metal'),
      origin: [0, d.thickness / 2, 0] as const,
    },
    box(
      'shaft',
      [shaftStart + d.shaftLength / 2, d.thickness / 2, 0],
      [d.shaftLength, d.thickness, d.shaftWidth],
      'metal',
    ),
    box(
      'tooth-one',
      [shaftStart + d.shaftLength * 0.62, d.thickness / 2, (d.shaftWidth + d.toothDepth) / 2],
      [d.shaftLength * 0.16, d.thickness, d.toothDepth],
      'metal',
    ),
    box(
      'tooth-two',
      [shaftStart + d.shaftLength * 0.86, d.thickness / 2, (d.shaftWidth + d.toothDepth * 0.6) / 2],
      [d.shaftLength * 0.12, d.thickness, d.toothDepth * 0.6],
      'metal',
    ),
  ];
};

export const keycard = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({ width: positive, height: positive, thickness: positive, stripeHeight: positive }),
    params,
  );
  if (!(d.stripeHeight < d.height)) {
    throw new Error('Keycard stripe must fit its card');
  }
  return [
    box('card', [0, d.thickness / 2, 0], [d.width, d.thickness, d.height], 'card'),
    box('stripe', [0, d.thickness * 1.01, 0], [d.width * 0.82, d.thickness * 0.08, d.stripeHeight], 'stripe'),
  ];
};
