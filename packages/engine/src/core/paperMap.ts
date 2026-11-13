import type { ItemDef } from './content.ts';
import { regionIndex, WORLD_REGION_METRES } from './worldRegion.ts';

export interface PaperMapCoverage {
  x: number;
  z: number;
}

const assertPaperMapCoverage: (coverage: unknown) => asserts coverage is PaperMapCoverage = (coverage) => {
  if (
    coverage === null ||
    typeof coverage !== 'object' ||
    Array.isArray(coverage) ||
    !('x' in coverage) ||
    !('z' in coverage) ||
    Object.keys(coverage).length !== 2 ||
    !Number.isSafeInteger(coverage.x) ||
    !Number.isSafeInteger(coverage.z)
  ) {
    throw new Error('Invalid paper-map coverage');
  }
};

/** Metre-space coverage, independent of streaming, settlement bounds and saved terrain. */
export const paperMapAt = (xMetres: number, zMetres: number): PaperMapCoverage => {
  const coverage = { x: regionIndex(xMetres, 1), z: regionIndex(zMetres, 1) };
  assertPaperMapCoverage(coverage);
  return coverage;
};

/** Lower edges inclusive, upper edges exclusive. */
export const paperMapBounds = (coverage: PaperMapCoverage): { x0: number; z0: number; x1: number; z1: number } => {
  assertPaperMapCoverage(coverage);
  return {
    x0: coverage.x * WORLD_REGION_METRES,
    z0: coverage.z * WORLD_REGION_METRES,
    x1: (coverage.x + 1) * WORLD_REGION_METRES,
    z1: (coverage.z + 1) * WORLD_REGION_METRES,
  };
};

export const assertPaperMapItem = (def: ItemDef, count: number, coverage: unknown): void => {
  if (def.paperMap) {
    assertPaperMapCoverage(coverage);
    if (count !== 1) {
      throw new Error('A paper-map item must be a single sheet');
    }
  } else if (coverage !== undefined) {
    throw new Error('Paper-map coverage needs a paper-map capability');
  }
};
