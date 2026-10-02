import { cartridgeModelAsset } from '../ammo/calibreSlug.ts';
import type { MetallicCartridge } from '../ammo/cartridge.ts';
import { type RoundProfiles, roundProfiles } from '../ammo/roundProfile.ts';
import type { AppearanceContext, GlbAssetIdentity, GlbExportError, Palette } from '../core/design.ts';
import { exportGlb } from '../core/glb.ts';
import { resolve } from '../core/resolve.ts';
import type { Assembly, Domain, PartDef, PartFamily, RevolvedSolid } from '../core/schema.ts';
import type { DeadvoxModelEntry, DeadvoxModelFile } from './exportGlb.ts';

export interface CartridgeModel {
  readonly glb: Uint8Array;
  readonly modelEntry: DeadvoxModelEntry;
}

export interface CartridgeModels {
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
  cartridge: MetallicCartridge,
  asset: GlbAssetIdentity,
  solids: readonly RevolvedSolid[],
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
    finish: { ...DEFAULT_CARTRIDGE_FINISH, ...appearance?.finish },
  };
  const result = exportGlb({
    resolved,
    palette: AMMO_PALETTE,
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

/** Export loaded-round and fired-case GLBs at their real millimetre-derived dimensions. */
export const exportCartridgeModels = (
  cartridge: MetallicCartridge,
  appearance?: AppearanceContext,
): CartridgeExportResult => {
  const profiles: RoundProfiles = roundProfiles(cartridge);
  const round = makeModelExport(
    cartridge,
    cartridgeModelAsset('round', cartridge.id),
    [
      revolved('case', profiles.loadedCase, 'case'),
      revolved('primer', profiles.primer, 'primer'),
      revolved('bullet', profiles.bullet, 'bullet'),
    ],
    appearance,
  );
  if (!round.ok) {
    return round;
  }
  const firedCase = makeModelExport(
    cartridge,
    cartridgeModelAsset('case', cartridge.id),
    [revolved('case', profiles.firedCase, 'case'), revolved('primer', profiles.primer, 'primer')],
    appearance,
  );
  if (!firedCase.ok) {
    return firedCase;
  }
  return { ok: true, models: { round: round.model, case: firedCase.model } };
};
