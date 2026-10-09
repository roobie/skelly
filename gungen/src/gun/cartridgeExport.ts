import type { AppearanceContext, GlbAssetIdentity, GlbExportError, Palette } from '@skelly/engine/core/design.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import type { Assembly, Domain, PartDef, PartFamily, RevolvedSolid, Solid } from '@skelly/engine/core/schema.ts';
import { cartridgeModelAsset } from '../ammo/calibreSlug.ts';
import type { Cartridge } from '../ammo/cartridge.ts';
import { type RoundProfiles, roundProfiles } from '../ammo/roundProfile.ts';
import type { DeadvoxModelEntry, DeadvoxModelFile } from './exportGlb.ts';
import { exportGunGeometry as exportGlb } from './glbWriter.ts';
import { shotshellGeometry, shotshellHullColor } from './shotshellGeometry.ts';

interface CartridgeModel {
  readonly glb: Uint8Array;
  readonly modelEntry: DeadvoxModelEntry;
}

interface CartridgeModels {
  readonly round: CartridgeModel;
  readonly case: CartridgeModel;
}

export type CartridgeExportResult =
  | { readonly ok: true; readonly models: CartridgeModels }
  | { readonly ok: false; readonly error: GlbExportError };

type SingleCartridgeExportResult =
  | { readonly ok: true; readonly model: CartridgeModel }
  | { readonly ok: false; readonly error: GlbExportError };

const EMPTY_PORTS: PartDef['ports'] = [];
const EMPTY_KEEPOUTS: PartDef['keepOuts'] = [];
const EMPTY_AXES: PartDef['axes'] = [];
const DEFAULT_CARTRIDGE_FINISH = { case: 'brass', bullet: 'copper', primer: 'brass' } as const;

const AMMO_PALETTE: Palette = {
  familyColors: { 'cartridge-model': [0.62, 0.56, 0.43] },
  specialColors: { case: [0.69, 0.51, 0.29], bullet: [0.7, 0.34, 0.19], primer: [0.49, 0.4, 0.23] },
  fallbackColor: [0.62, 0.56, 0.43],
  materials: {
    brass: [0.69, 0.51, 0.29],
    copper: [0.7, 0.34, 0.19],
    lead: [0.38, 0.4, 0.42],
    steel: [0.29, 0.32, 0.31],
  },
};
const MM_DOMAIN: Domain['units'] = { metresPerUnit: 0.001, grid: 0.001, bevel: 0 };

const makeModelExport = (
  cartridge: Cartridge,
  asset: GlbAssetIdentity,
  solids: readonly Solid[],
  appearance?: AppearanceContext,
): SingleCartridgeExportResult => {
  const family: PartFamily = {
    name: 'cartridge-model',
    params: {},
    build: (): PartDef => ({
      family: 'cartridge-model',
      solids,
      ports: EMPTY_PORTS,
      keepOuts: EMPTY_KEEPOUTS,
      axes: EMPTY_AXES,
    }),
  };
  const domain: Domain = {
    name: 'cartridge-model',
    units: MM_DOMAIN,
    families: { 'cartridge-model': family },
    axisRules: [],
  };
  const assembly: Assembly = {
    name: asset.id,
    root: 'cartridge',
    parts: { cartridge: { family: 'cartridge-model' } },
    connections: [],
  };
  const resolved = resolve(assembly, domain);
  const effectiveAppearance: AppearanceContext = {
    ...appearance,
    finish: { ...DEFAULT_CARTRIDGE_FINISH, hull: 'hull-color', closure: 'closure-card', ...appearance?.finish },
  };
  const result = exportGlb({
    resolved,
    palette:
      cartridge.kind === 'shotshell'
        ? {
            ...AMMO_PALETTE,
            materials: {
              ...AMMO_PALETTE.materials,
              'hull-color': shotshellHullColor(cartridge),
              'closure-card': [0.27, 0.23, 0.17],
            },
          }
        : AMMO_PALETTE,
    revolveFacets: 96,
    asset,
    appearance: effectiveAppearance,
  });
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    model: {
      glb: result.glb,
      modelEntry: {
        id: asset.id,
        file: asset.file as DeadvoxModelFile,
        calibre: cartridge.id,
      },
    },
  };
};

const revolved = (id: string, profile: RevolvedSolid['profile'], slot: string): RevolvedSolid => ({
  id,
  kind: 'revolved',
  axis: 'x',
  profile,
  slot,
});

const metallicSolids = (cartridge: Extract<Cartridge, { kind: 'metallic' }>) => {
  const profiles: RoundProfiles = roundProfiles(cartridge);
  return {
    round: [
      revolved('case', profiles.loadedCase, 'case'),
      revolved('primer', profiles.primer, 'primer'),
      revolved('bullet', profiles.bullet, 'bullet'),
    ],
    case: [revolved('case', profiles.firedCase, 'case'), revolved('primer', profiles.primer, 'primer')],
  };
};

/** Export loaded-round/shell and fired-case/hull GLBs at real millimetre-derived dimensions. */
export const exportCartridgeModels = (cartridge: Cartridge, appearance?: AppearanceContext): CartridgeExportResult => {
  const solids = cartridge.kind === 'shotshell' ? shotshellGeometry(cartridge) : metallicSolids(cartridge);
  const round = makeModelExport(cartridge, cartridgeModelAsset('round', cartridge.id), solids.round, appearance);
  if (!round.ok) {
    return round;
  }
  const firedCase = makeModelExport(cartridge, cartridgeModelAsset('case', cartridge.id), solids.case, appearance);
  if (!firedCase.ok) {
    return firedCase;
  }
  return { ok: true, models: { round: round.model, case: firedCase.model } };
};
