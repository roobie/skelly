import { GRID } from '@skelly/engine/foundation/conventions.ts';
import { BEVEL } from '@skelly/engine/shapes/mesh.ts';
import type { DomainUnits } from '@skelly/engine/shapes/solid.ts';
import { METRES_PER_UNIT } from './exportFrame.ts';

export const GUN_UNITS: DomainUnits = { metresPerUnit: METRES_PER_UNIT, grid: GRID, bevel: BEVEL };

const MM_PER_INCH = 25.4;

export const mmToU = (mm: number): number => mm / (GUN_UNITS.metresPerUnit * 1000);
export const uToMm = (u: number): number => u * (GUN_UNITS.metresPerUnit * 1000);
export const inchesToMm = (inches: number): number => inches * MM_PER_INCH;
export const mmToInches = (mm: number): number => mm / MM_PER_INCH;
export const inchesToU = (inches: number): number => mmToU(inchesToMm(inches));
export const uToInches = (u: number): number => mmToInches(uToMm(u));
