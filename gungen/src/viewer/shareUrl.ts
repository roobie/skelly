import type { Overrides } from './paramPanel.ts';
import { hasOverrides, serializeOverrides } from './paramPanel.ts';

type AssemblySelection =
  | { readonly kind: 'fixture'; readonly name: string }
  | { readonly kind: 'generated' }
  | { readonly kind: 'upload' };

export interface ShareModelQuery {
  readonly designName: string | undefined;
  readonly designNames: readonly string[];
  readonly assembly: AssemblySelection;
  readonly template: string;
  readonly seed: string;
  readonly overrides: Overrides;
}

/** Adds the current model identity and panel edits to a shareable query. */
export const setModelQuery = (params: URLSearchParams, model: ShareModelQuery): void => {
  if (model.designName && model.designNames.includes(model.designName)) {
    params.set('design', model.designName);
  } else if (model.assembly.kind === 'generated') {
    params.set('template', model.template);
    params.set('seed', model.seed);
  } else if (model.assembly.kind === 'fixture') {
    params.set('fixture', model.assembly.name);
  }
  if (hasOverrides(model.overrides)) {
    params.set('set', serializeOverrides(model.overrides));
  }
};
