import type { Vec3 } from './coords.ts';
import type { Rect } from './site.ts';

export interface StageMark {
  readonly id: string;
  readonly area: Rect;
}

export const stageMarkArea = (marks: readonly StageMark[], id: string): Rect => {
  const mark = marks.find((entry) => entry.id === id);
  if (!mark) {
    throw new Error(`Missing stage mark "${id}"`);
  }
  return mark.area;
};

export const insideStageArea = (area: Rect, [x, , z]: Vec3): boolean =>
  x >= area.x0 && x < area.x1 && z >= area.z0 && z < area.z1;

export const stageMarksAt = (marks: readonly StageMark[], position: Vec3): readonly StageMark[] =>
  marks.filter(({ area }) => insideStageArea(area, position));
