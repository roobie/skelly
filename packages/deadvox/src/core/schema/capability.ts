import { optional, picklist } from 'valibot';
import { CONTENT_CAPABILITIES } from '../capabilities.ts';

export const capabilityField = <S extends keyof typeof CONTENT_CAPABILITIES>(section: S) =>
  optional(picklist(CONTENT_CAPABILITIES[section]));
