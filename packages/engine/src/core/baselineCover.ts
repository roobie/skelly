import { inPolygon } from './authoredLayout.ts';
import { polylineDistance, rectDistance } from './authoredTerrain.mjs';
import { type AuthoredGroundData, createAuthoredGround } from './authoredTerrainEvaluator.ts';
import { simplexNoise2 } from './random.ts';
import type { SiteLayoutDef } from './schema.ts';
import type { siteGenerationOf } from './sitePalette.ts';
import { densityFieldAt } from './vegetation.ts';

export interface BaselineCoverData {
  readonly ground: AuthoredGroundData;
  readonly regions: SiteLayoutDef['woodlands'];
  readonly vegetation: ReturnType<typeof siteGenerationOf>['vegetation'];
}

export function createBaselineCover(data: BaselineCoverData) {
  const { ground: inputs, regions, vegetation } = data;
  const ground = createAuthoredGround(inputs);
  const profiles = regions.map((region) => {
    const definition = vegetation.regionProfiles[region.profile];
    if (!(Object.hasOwn(vegetation.regionProfiles, region.profile) && definition)) {
      throw new Error(`Unknown cover profile "${region.profile}"`);
    }
    return definition;
  });
  const boundaries = regions.map((region) => [...region.polygon, region.polygon[0]!]);
  const profileAt = (x: number, z: number) => {
    let winner: (typeof vegetation.regionProfiles)[string] | undefined;
    for (const [index, region] of regions.entries()) {
      const profile = profiles[index]!;
      const distance = polylineDistance([x, z], boundaries[index]!);
      const noise = simplexNoise2(
        inputs.seed + 0x71_3b,
        x / profile.edgeWavelengthMetres,
        z / profile.edgeWavelengthMetres,
      );
      if ((inPolygon([x, z], region.polygon) ? distance : -distance) + noise * profile.edgeVariationMetres >= 0) {
        winner = profile;
      }
    }
    return winner;
  };
  const densityAt = (x: number, z: number): number => {
    const margin = vegetation.obstacleMarginMetres + vegetation.crownMarginMetres;
    const s = inputs.blockSize;
    if (
      x < inputs.layout.bounds.x0 ||
      x >= inputs.layout.bounds.x1 ||
      z < inputs.layout.bounds.z0 ||
      z >= inputs.layout.bounds.z1 ||
      ground.sandy(Math.floor(x / s), Math.floor(z / s)) ||
      inputs.protectedBuildings.some((rect) => rectDistance(rect, x, z, s) <= margin) ||
      inputs.tracks.some((track) => polylineDistance([x, z], track.points) <= track.width / 2 + margin) ||
      inputs.spawnPoints.some(([sx, sz]) => Math.hypot(x - sx, z - sz) <= margin) ||
      (inputs.catalogue && rectDistance(inputs.catalogue.rect, x, z, s) <= margin)
    ) {
      return 0;
    }
    return (
      (profileAt(x, z)?.density ?? vegetation.openDensity) *
      densityFieldAt(vegetation.forestDensityField, inputs.seed, x, z)
    );
  };
  return { densityAt, treeMixAt: (x: number, z: number) => profileAt(x, z)?.treeMix ?? vegetation.openTreeMix };
}
