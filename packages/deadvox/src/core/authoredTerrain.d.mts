// Type-only bridge; evaluator implementation is shared verbatim with Tiled's ES6 runtime.
import type { SiteLayoutDef } from './schema.ts';
import type { Rect } from './site.ts';
export interface GroundLot {
  rect: Rect;
  floor: number;
  key: string;
}
export const LOT_APRON_M: number;
export const LOT_BLEND_M: number;
export const SITE_BLEND_M: number;
export function rectDistance(rect: Rect, cellX: number, cellZ: number, cellSize?: number): number;
export function hasSegment(points: readonly (readonly [number, number])[]): boolean;
export function smoothstep(t: number): number;
export function polylineDistanceAt(x: number, z: number, points: readonly (readonly [number, number])[]): number;
export function polylineDistance(
  point: readonly [number, number],
  points: readonly (readonly [number, number])[],
): number;
export function profileHeight(layout: Pick<SiteLayoutDef, 'ground' | 'terrain'>, x: number, z: number): number;
export function buildingBounds(building: SiteLayoutDef['buildings'][number], size: readonly number[]): Rect;
export function surfaceFoundation(building: SiteLayoutDef['buildings'][number]): number;
export function lotOf(building: SiteLayoutDef['buildings'][number], rect: Rect): GroundLot;
export function defaultFoundation(layout: SiteLayoutDef, rect: Rect): number;
export function layoutHeight(
  layout: SiteLayoutDef,
  lots: readonly GroundLot[],
  point: readonly [number, number],
  natural: number,
): number;
export function standingHeight(layout: SiteLayoutDef, lots: readonly GroundLot[], x: number, z: number): number;
