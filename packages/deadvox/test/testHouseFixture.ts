import { AuthoredSite } from '../src/core/authoredSite.ts';
import type { Registry } from '../src/core/content.ts';
import { CHUNK } from '../src/core/coords.ts';
import type { GameConfig } from '../src/game/config.ts';

export const houseScene = (config: GameConfig, registry: Registry) => {
  const layout = registry.layouts.get(config.site)!;
  const house = new AuthoredSite(config.seed, registry, config.scale, layout);
  const furniture: ReturnType<AuthoredSite['furnitureIn']> = [];
  const lootSources: ReturnType<AuthoredSite['lootPointsIn']>[number][] = [];
  const span = CHUNK * config.scale.blockSize;
  for (let cx = Math.floor(layout.bounds.x0 / span); cx <= Math.floor(layout.bounds.x1 / span); cx++) {
    for (let cz = Math.floor(layout.bounds.z0 / span); cz <= Math.floor(layout.bounds.z1 / span); cz++) {
      furniture.push(...house.furnitureIn(cx, cz));
      lootSources.push(...house.lootPointsIn(cx, cz));
    }
  }
  return Object.assign(house, { furniture, lootSources });
};
