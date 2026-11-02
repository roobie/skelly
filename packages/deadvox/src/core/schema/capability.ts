import { optional, picklist } from 'valibot';
import { CONTENT_CAPABILITIES } from '../capabilities.ts';

export const capabilityField = <S extends keyof typeof CONTENT_CAPABILITIES>(section: S) =>
  optional(picklist(Object.keys(CONTENT_CAPABILITIES[section]) as (keyof (typeof CONTENT_CAPABILITIES)[S] & string)[]));
