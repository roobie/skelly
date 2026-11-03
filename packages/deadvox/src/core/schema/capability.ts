import { array, check, nonEmpty, optional, picklist, pipe } from 'valibot';
import { CONTENT_CAPABILITIES } from '../capabilities.ts';

export const capabilitySelection = <S extends keyof typeof CONTENT_CAPABILITIES>(section: S) =>
  picklist(Object.keys(CONTENT_CAPABILITIES[section]) as (keyof (typeof CONTENT_CAPABILITIES)[S] & string)[]);

export const capabilityField = <S extends keyof typeof CONTENT_CAPABILITIES>(section: S) =>
  optional(capabilitySelection(section));

export const capabilityClaimsField = <S extends keyof typeof CONTENT_CAPABILITIES>(section: S) =>
  optional(
    pipe(
      array(
        picklist(Object.keys(CONTENT_CAPABILITIES[section]) as (keyof (typeof CONTENT_CAPABILITIES)[S] & string)[]),
      ),
      nonEmpty(),
      check((claims) => new Set(claims).size === claims.length, 'capability claims must be unique'),
    ),
  );
