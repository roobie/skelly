import { parse, strictObject } from 'valibot';
import { cylinder, positive } from './shapes.ts';

export const fuse = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({ radius: positive, capRadius: positive, length: positive, capLength: positive }),
    params,
  );
  if (!(d.capRadius >= d.radius && 2 * d.capLength < d.length)) {
    throw new Error('Invalid fuse dimensions');
  }
  return [
    {
      ...cylinder('body', d.radius, d.length - 2 * d.capLength),
      axis: 'x' as const,
      origin: [-d.length / 2 + d.capLength, d.capRadius, 0] as const,
    },
    {
      ...cylinder('left-cap', d.capRadius, d.capLength, 'cap'),
      axis: 'x' as const,
      origin: [-d.length / 2, d.capRadius, 0] as const,
    },
    {
      ...cylinder('right-cap', d.capRadius, d.capLength, 'cap'),
      axis: 'x' as const,
      origin: [d.length / 2 - d.capLength, d.capRadius, 0] as const,
    },
  ];
};
