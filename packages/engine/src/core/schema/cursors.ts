import { finite, number, pipe, regex, strictObject, string } from 'valibot';
import { capabilityField } from './capability.ts';
import { Id, Positive } from './primitives.ts';

export const CursorSchema = strictObject({
  id: Id,
  capability: capabilityField('cursors'),
  image: pipe(string(), regex(/^assets\/cursors\/[a-z0-9_.-]+\.png$/, 'expected assets/cursors/<name>.png')),
  frameWidthPx: Positive,
  frameHeightPx: Positive,
  handOffsetPx: pipe(number(), finite()),
});
