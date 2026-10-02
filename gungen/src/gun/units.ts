import { GRID } from '../core/conventions.ts';
import { METRES_PER_UNIT } from '../core/exportFrame.ts';
import { BEVEL } from '../core/mesh.ts';
import type { DomainUnits } from '../core/schema.ts';

/** The gun domain's unit, snap grid and bevel: 1 u = 11.5 mm, 0.25 u grid, 1.4 mm bevel. */
export const GUN_UNITS: DomainUnits = { metresPerUnit: METRES_PER_UNIT, grid: GRID, bevel: BEVEL };
