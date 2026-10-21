import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  array,
  check,
  type InferOutput,
  nonEmpty,
  optional,
  parse,
  picklist,
  pipe,
  regex,
  strictObject,
  string,
  unknown,
} from 'valibot';
import content from '../../exports/deadvox.json' with { type: 'json' };
import { formatCartridgeParseError, parseCartridgeJson } from '../ammo/parseCartridge.ts';
import { exportAttachmentGlb } from '../gun/attachmentExport.ts';
import { ATTACHMENT_IDS } from '../gun/attachments.ts';
import { exportCartridgeModel } from '../gun/cartridgeExport.ts';
import type { DeadvoxModelEntry, DeadvoxModelFile } from '../gun/exportGlb.ts';
import { exportMagazineGlb } from '../gun/magazineExport.ts';
import { GUN_PREFABS } from '../gun/prefabs.ts';
import { exportFileText } from './exportFile.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const RowSchema = strictObject({
  id: pipe(string(), regex(/^[a-z][a-z0-9_]*$/)),
  kind: pipe(string(), nonEmpty()),
  source: pipe(string(), nonEmpty()),
  options: optional(unknown()),
});
const RecipeSchema = pipe(
  array(RowSchema),
  nonEmpty(),
  check((rows) => new Set(rows.map(({ id }) => id)).size === rows.length, 'duplicate export id'),
);
type Row = InferOutput<typeof RowSchema>;
interface ModelExport {
  readonly modelEntry: DeadvoxModelEntry;
  readonly glb: Uint8Array;
}
export interface RecipeExport {
  readonly id: string;
  readonly kind: string;
  readonly source: string;
  readonly generate: () => ModelExport;
}
const assetFor = ({ id }: Row) => ({ id, file: `assets/models/${id}.glb` as DeadvoxModelFile });
const optionsFor = (row: Row) => (row.options === undefined ? {} : row.options);
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
      const result = exportFileText(text, assetFor(row));
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
      const result = exportCartridgeModel(cartridge, options.component, assetFor(row));
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
      const result = exportAttachmentGlb(row.source, assetFor(row));
      if (!result.ok) {
        throw new Error(JSON.stringify(result.error));
      }
      return result;
    };
  },
  magazine: (row: Row, root: string) => {
    const options = parse(
      strictObject({ cartridge: pipe(string(), nonEmpty()), appearanceProfile: pipe(string(), nonEmpty()) }),
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
      });
      if (!result.ok) {
        throw new Error(JSON.stringify(result.error));
      }
      return result;
    };
  },
} satisfies Record<string, (row: Row, root: string) => () => ModelExport>;

const contextual = <T>(row: Row, work: () => T): T => {
  try {
    return work();
  } catch (error) {
    throw new Error(
      `Export ${row.id} (${row.kind}, ${row.source}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
};

export const loadExportRecipe = (value: unknown = content, root = ROOT): readonly RecipeExport[] =>
  parse(RecipeSchema, value).map((row) =>
    contextual(row, () => {
      if (!Object.hasOwn(exporters, row.kind)) {
        throw new Error('unknown export kind');
      }
      const generate = exporters[row.kind as keyof typeof exporters](row, root);
      return { id: row.id, kind: row.kind, source: row.source, generate: () => contextual(row, generate) };
    }),
  );
