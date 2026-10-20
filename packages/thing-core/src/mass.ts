import type { ModelParts } from './schema.ts';

export const modelMassKg = (model: { readonly parts: ModelParts }): number =>
  Object.values(model.parts).reduce((sum, part) => sum + part.massKg, 0);
