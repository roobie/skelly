import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  recipeAsset as assetFor,
  loadRecipe,
  type ModelExport,
  recipeOptions as optionsFor,
  type RecipeExport,
  type RecipeRow as Row,
  recipeVoxel as voxelFor,
} from '@skelly/thing-export/recipe.ts';
import { nonEmpty, parse, picklist, pipe, strictObject, string } from 'valibot';
import content from '../../exports/deadvox.json' with { type: 'json' };
import { formatCartridgeParseError, parseCartridgeJson } from '../ammo/parseCartridge.ts';
import { exportAttachmentGlb } from '../gun/attachmentExport.ts';
import { ATTACHMENT_IDS } from '../gun/attachments.ts';
import { exportCartridgeModel } from '../gun/cartridgeExport.ts';
import type { DeadvoxModelEntry } from '../gun/exportGlb.ts';
import { exportMagazineGlb } from '../gun/magazineExport.ts';
import { GUN_PREFABS } from '../gun/prefabs.ts';
import { exportFileText } from './exportFile.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const cartridgeAt = (source: string, root: string) => {
  const parsed = parseCartridgeJson(readFileSync(resolve(root, source), 'utf8'));
  if (!parsed.ok) {
    throw new Error(formatCartridgeParseError(parsed.error));
  }
  return parsed.cartridge;
};

const exporters = {
  design: (row: Row, root: string) => {
    parse(strictObject({}), optionsFor(row));
    const text = readFileSync(resolve(root, row.source), 'utf8');
    return () => {
      const result = exportFileText(text, assetFor(row), {}, voxelFor(row));
      if (!result.ok) {
        throw new Error(result.message);
      }
      if (result.warnings.length > 0) {
        throw new Error(result.warnings.join('\n'));
      }
      return result;
    };
  },
  cartridge: (row: Row, root: string) => {
    const options = parse(strictObject({ component: picklist(['round', 'case']) }), optionsFor(row));
    const cartridge = cartridgeAt(row.source, root);
    return () => {
      const result = exportCartridgeModel(cartridge, options.component, assetFor(row), { voxel: voxelFor(row) });
      if (!result.ok) {
        throw new Error(JSON.stringify(result.error));
      }
      return result.model;
    };
  },
  attachment: (row: Row) => {
    parse(strictObject({}), optionsFor(row));
    if (!ATTACHMENT_IDS.includes(row.source)) {
      throw new Error('unknown attachment source');
    }
    return () => {
      const result = exportAttachmentGlb(row.source, assetFor(row), undefined, voxelFor(row));
      if (!result.ok) {
        throw new Error(JSON.stringify(result.error));
      }
      return result;
    };
  },
  magazine: (row: Row, root: string) => {
    const options = parse(
      strictObject({
        cartridge: pipe(string(), nonEmpty()),
        appearanceProfile: pipe(string(), nonEmpty()),
      }),
      optionsFor(row),
    );
    const prefab = GUN_PREFABS.find(({ id, family }) => id === row.source && family === 'magazine');
    if (!prefab) {
      throw new Error('unknown magazine prefab source');
    }
    const cartridge = cartridgeAt(options.cartridge, root);
    if (cartridge.kind !== 'metallic') {
      throw new Error('a magazine holds metallic cartridges');
    }
    return () => {
      const result = exportMagazineGlb({
        asset: assetFor(row),
        params: prefab.fixedParams,
        cartridge,
        appearance: { appearanceProfile: options.appearanceProfile },
        voxel: voxelFor(row),
      });
      if (!result.ok) {
        throw new Error(JSON.stringify(result.error));
      }
      return result;
    };
  },
} satisfies Record<string, (row: Row, root: string) => () => ModelExport<DeadvoxModelEntry>>;

export const loadExportRecipe = (value: unknown = content, root = ROOT): readonly RecipeExport<DeadvoxModelEntry>[] =>
  loadRecipe(
    value,
    Object.fromEntries(Object.entries(exporters).map(([kind, load]) => [kind, (row: Row) => load(row, root)])),
  );
