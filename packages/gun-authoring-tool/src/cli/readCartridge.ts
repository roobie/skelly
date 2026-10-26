import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calibreSlug } from '../ammo/calibreSlug.ts';
import type { Cartridge } from '../ammo/cartridge.ts';
import { formatCartridgeParseError, parseCartridgeJson } from '../ammo/parseCartridge.ts';

export type ReadCartridgeResult =
  | { readonly ok: true; readonly cartridge?: Cartridge }
  | { readonly ok: false; readonly message: string };

export const readCartridge = (id: string | undefined): ReadCartridgeResult => {
  if (id === undefined) {
    return { ok: true };
  }
  try {
    calibreSlug(id);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  let text: string;
  try {
    text = readFileSync(join(import.meta.dirname, '../../cartridges', `${id}.json`), 'utf8');
  } catch {
    return { ok: false, message: `no cartridge data with id ${JSON.stringify(id)}` };
  }
  const parsed = parseCartridgeJson(text);
  if (!parsed.ok) {
    return { ok: false, message: formatCartridgeParseError(parsed.error) };
  }
  return { ok: true, cartridge: parsed.cartridge };
};
