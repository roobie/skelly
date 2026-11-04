import { basename, join } from 'node:path';
import type { Cartridge } from '../ammo/cartridge.ts';
import type { DeadvoxModelFile } from '../gun/exportGlb.ts';
import { readCartridge } from './readCartridge.ts';

export const EXPORT_USAGE =
  'usage: export <design-or-fixture.json> [--out <dir>] [--entry-out <dir>] [--id <model_id>] [--calibre <cartridge_id>]';

/** Where the export CLI reads, what identity it exports under, and where it writes. */
export type ExportCliPlan =
  | {
      readonly ok: true;
      readonly input: string;
      readonly asset: { readonly id: string; readonly file: DeadvoxModelFile };
      readonly metadata: { readonly cartridge?: Cartridge };
      readonly glbPath: string;
      readonly entryPath: string;
    }
  | { readonly ok: false; readonly message: string };

const flag = (args: readonly string[], name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

/** Resolves the export CLI's arguments without exporting, so tests check them in-process. */
export const exportCliPlan = (args: readonly string[]): ExportCliPlan => {
  const input = args.find((a, i) => !(a.startsWith('--') || args[i - 1]?.startsWith('--')));
  if (!input) {
    return { ok: false, message: EXPORT_USAGE };
  }
  const out = flag(args, '--out') ?? '.';
  const entryOut = flag(args, '--entry-out') ?? out;
  const id = flag(args, '--id') ?? basename(input, '.json').replaceAll('-', '_');
  const cartridgeResult = readCartridge(flag(args, '--calibre'));
  if (!cartridgeResult.ok) {
    return { ok: false, message: `FAIL --calibre: ${cartridgeResult.message}` };
  }
  return {
    ok: true,
    input,
    asset: { id, file: `assets/models/${id}.glb` as DeadvoxModelFile },
    metadata: cartridgeResult.cartridge === undefined ? {} : { cartridge: cartridgeResult.cartridge },
    glbPath: join(out, `${id}.glb`),
    entryPath: join(entryOut, `${id}.model.json`),
  };
};
