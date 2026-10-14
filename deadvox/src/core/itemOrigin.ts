import { type InferOutput, literal, minLength, parse, picklist, pipe, strictObject, string, variant } from 'valibot';

const ItemOriginSchema = variant('kind', [
  strictObject({
    kind: literal('economy'),
    source: pipe(string(), minLength(1)),
    channel: picklist(['container', 'surface', 'corpse']),
    mode: picklist(['fixed', 'random']),
  }),
  strictObject({ kind: literal('crafted') }),
  strictObject({ kind: literal('fixture') }),
  strictObject({ kind: literal('created') }),
]);

export type ItemOrigin = Readonly<InferOutput<typeof ItemOriginSchema>>;
export const copyOrigin = (origin: ItemOrigin): ItemOrigin => Object.freeze(parse(ItemOriginSchema, origin));
export const sameOrigin = (left: ItemOrigin, right: ItemOrigin): boolean =>
  left.kind === right.kind &&
  (left.kind !== 'economy' ||
    (right.kind === 'economy' &&
      left.source === right.source &&
      left.channel === right.channel &&
      left.mode === right.mode));
