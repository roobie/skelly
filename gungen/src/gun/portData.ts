import type { PortDef } from '../core/schema.ts';

/** Gun-only metadata for a magazine's seating interface. Core port rules ignore it. */
export interface GunPortDef extends PortDef {
  readonly seat?: 'well' | 'face';
}

export const gunPort = (port: GunPortDef): GunPortDef => port;
