import browserModConfig from '../config/browser-mods.json' with { type: 'json' };
import bundledModList from '../config/bundled-mods.json' with { type: 'json' };
import { bundledModsFrom, type ModIntake } from '../game/entries/packs.ts';
import { productContent } from './content.ts';

/** Mod admission's view of the product: its shipped content, bundled mods and mod file bound. */
export const productModIntake: ModIntake = {
  content: productContent,
  bundledMods: bundledModsFrom(
    bundledModList,
    import.meta.glob<Record<string, unknown>>('../config/bundled/*.json', { eager: true, import: 'default' }),
  ),
  maxModBytes: browserModConfig.maxModBytes,
};
