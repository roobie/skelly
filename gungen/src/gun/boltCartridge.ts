import type { Assembly, ParamSpec } from '@skelly/engine/assembly/schema.ts';
import { GRID } from '@skelly/engine/foundation/conventions.ts';
import catalogue from '../../cartridges/catalogue/bolt.json' with { type: 'json' };
import type { Cartridge } from '../ammo/cartridge.ts';
import { formatCartridgeParseError, parseCartridge } from '../ammo/parseCartridge.ts';
import { METRES_PER_UNIT } from './exportFrame.ts';

const cartridges = new Map<string, Cartridge>(
  catalogue.cartridges.map((raw) => {
    const parsed = parseCartridge(raw);
    if (!parsed.ok) {
      throw new Error(formatCartridgeParseError(parsed.error));
    }
    return [parsed.cartridge.id, parsed.cartridge];
  }),
);

export const boltCalibreIssue = (calibre: string): string | undefined => {
  const cartridge = cartridges.get(calibre);
  if (!cartridge) {
    return `unsupported bolt calibre "${calibre}": no cartridge in the bolt catalogue`;
  }
  if (
    cartridge.kind !== 'metallic' ||
    cartridge.overallLength.max.value === null ||
    cartridge.case.rim.diameter.value === null
  ) {
    return `unsupported bolt calibre "${calibre}": requires sourced metallic overall length and rim diameter`;
  }
  return undefined;
};

export const boltCartridge = (calibre = catalogue.defaultCalibre): Cartridge => {
  const issue = boltCalibreIssue(calibre);
  if (issue) {
    throw new Error(issue);
  }
  return cartridges.get(calibre)!;
};

export const boltCalibreParam: ParamSpec = {
  values: [...cartridges.keys()],
  default: catalogue.defaultCalibre,
};

const boltFamilies = new Set(['receiver', 'bolt-carrier', 'bolt-handle-arm', 'bolt-handle-knob', 'lower', 'magazine']);
export const isBoltAssembly = (assembly: Assembly): boolean =>
  Object.values(assembly.parts).some(
    (part) =>
      (part.family === 'receiver' && part.params?.action === 'bolt') ||
      (part.family === 'bolt-carrier' && part.params?.pattern === 'bolt'),
  );

export const withBoltCalibre = (assembly: Assembly, calibre: string | undefined): Assembly => {
  if (calibre === undefined || !isBoltAssembly(assembly) || boltCalibreIssue(calibre)) {
    return assembly;
  }
  return {
    ...assembly,
    parts: Object.fromEntries(
      Object.entries(assembly.parts).map(([id, part]) => [
        id,
        boltFamilies.has(part.family) ? { ...part, params: { ...part.params, boltCalibre: calibre } } : part,
      ]),
    ),
  };
};

/** Visual extraction allowance, not a manufacturing tolerance. */
export const BOLT_EXTRACTION_CLEARANCE_U = catalogue.extractionClearanceGridSteps * GRID;
export const boltStrokeUnits = (cartridge: Cartridge): number => {
  if (cartridge.kind !== 'metallic' || cartridge.overallLength.max.value === null) {
    throw new Error('Bolt travel needs a sourced metallic cartridge overall length');
  }
  return (
    Math.ceil((cartridge.overallLength.max.value / (METRES_PER_UNIT * 1000) + BOLT_EXTRACTION_CLEARANCE_U) / GRID) *
    GRID
  );
};
export const BOLT_MAGAZINE_WALL_U = catalogue.magazineOuterWallU;
export const BOLT_WELL_PROFILES = catalogue.integralWells;
export const boltWellProfile = (name: string) => {
  const profile = BOLT_WELL_PROFILES[name as keyof typeof BOLT_WELL_PROFILES];
  if (!profile) {
    throw new Error(`Unknown integral well profile: ${name}`);
  }
  return profile;
};
export const boltMagazineSection = (cartridge: Cartridge) => {
  if (
    cartridge.kind !== 'metallic' ||
    cartridge.overallLength.max.value === null ||
    cartridge.case.rim.diameter.value === null
  ) {
    throw new Error('Integral well requires sourced cartridge length and rim');
  }
  const mmPerUnit = METRES_PER_UNIT * 1000;
  return {
    depth:
      Math.ceil(cartridge.overallLength.max.value / mmPerUnit / (2 * GRID)) * (2 * GRID) + 2 * BOLT_MAGAZINE_WALL_U,
    width:
      Math.ceil(cartridge.case.rim.diameter.value / mmPerUnit / (2 * GRID)) * (2 * GRID) + 2 * BOLT_MAGAZINE_WALL_U,
  };
};
