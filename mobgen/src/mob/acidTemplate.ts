import type { Template } from '../core/template.ts';
import data from './acidTemplate.json' with { type: 'json' };

type AcidContent = Pick<
  Template,
  'name' | 'description' | 'bodyPlan' | 'status' | 'bodyMassKg' | 'materials' | 'params'
> &
  Pick<typeof data, 'skinB' | 'organic'>;

export const acidContent = data as unknown as AcidContent;
