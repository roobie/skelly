import type { BlockEntities, TerrainRead } from '@skelly/engine/world';
import { layoutVehicleQueries } from '@skelly/engine/world';
import type { PlacementQueries, ShamblerPlacementWorld } from './shamblerPlacement.ts';

/** The placement fields of an engine, judged by the given solid and sight rule instead of the engine's own. */
export const placementWorldOf = (
  { registry, config, spawn, groundAt }: Omit<ShamblerPlacementWorld, keyof PlacementQueries>,
  queries: PlacementQueries,
): ShamblerPlacementWorld => ({ registry, config, spawn, groundAt, ...queries });

/** For benchmarks, which run without a session: the engine's placement fields judged with the site's parked vehicles. */
export const withLayoutVehicles = (
  engine: Omit<ShamblerPlacementWorld, keyof PlacementQueries> & {
    simulationWorld: TerrainRead;
    entities: BlockEntities;
    config: { site: string };
  },
): ShamblerPlacementWorld =>
  placementWorldOf(
    engine,
    layoutVehicleQueries({
      world: engine.simulationWorld,
      registry: engine.registry,
      entities: engine.entities,
      site: engine.config.site,
      blockSize: engine.config.scale.blockSize,
    }),
  );
