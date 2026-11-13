import type { HashState } from '../../src/hashState.ts';

export interface InlineStartMod {
  id: string;
  version: string;
  tier: 'scenario';
  product: false;
  dependencies: [];
  overrides: [];
  starts: [Record<string, unknown>];
}

export function inlineStartMod(id: string, start: Record<string, unknown>): InlineStartMod;

export interface GameUrlParts {
  startMod?: InlineStartMod | string;
  mods?: readonly string[];
  harness?: Readonly<Record<string, string | number>>;
  hash?: HashState;
}

export function gameUrl(page: string, parts?: GameUrlParts): string;
