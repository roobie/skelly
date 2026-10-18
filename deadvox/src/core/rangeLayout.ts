// Why a handling-range layout is checked here rather than clamped when built: a mod's range must
// fail loudly at load, and every target must stay usable from the firing line.

import type { HandlingRangeDef } from './schema.ts';

/** Blocks a target occupies to each side of its centre: the board's half width plus its posts. */
const targetReach = (layout: Pick<HandlingRangeDef, 'target'>): number => layout.target.halfWidth + 1;

/** Content problems of one layout as [path, message]; paths are relative to the layout definition. */
export const handlingRangeIssues = (layout: HandlingRangeDef): [string, string][] => {
  const out: [string, string][] = [];
  const { width, length, firingLine, target, targets, table } = layout;
  const centre = Math.floor(width / 2);
  const reach = targetReach(layout);
  const lineStart = firingLine.inset;
  const lineEnd = width - firingLine.inset - 1;
  if (lineStart > lineEnd) {
    out.push(['.firingLine.inset', `leaves no firing line across a lane ${width} blocks wide`]);
  }
  if (firingLine.offset + firingLine.depth > length) {
    out.push(['.firingLine', 'must lie inside the lane length']);
  }
  const inLane = (lateral: number, extent: number): boolean =>
    centre + lateral - extent >= 0 && centre + lateral + extent < width;
  if (!inLane(table.lateral, 0)) {
    out.push(['.table.lateral', 'must lie inside the lane width']);
  }
  if (table.offset >= length) {
    out.push(['.table.offset', 'must lie inside the lane length']);
  }
  targets.forEach((entry, index) => {
    const at = `.targets[${index}]`;
    if (entry.offset < firingLine.offset + firingLine.depth || entry.offset >= length) {
      out.push([`${at}.offset`, 'must lie in the lane beyond the firing line']);
    }
    if (index > 0 && entry.offset <= targets[index - 1]!.offset) {
      out.push([`${at}.offset`, 'must be farther than the previous target']);
    }
    if (!inLane(entry.lateral, reach)) {
      out.push([`${at}.lateral`, 'must keep the target and its posts inside the lane width']);
    }
    if (centre + entry.lateral - target.halfWidth < lineStart || centre + entry.lateral + target.halfWidth > lineEnd) {
      out.push([`${at}.lateral`, 'must keep the board within the firing line, so it can be shot from there']);
    }
    // Fire runs down the lane, so a nearer target hides every block level with it laterally.
    targets.slice(0, index).forEach((nearer, nearerIndex) => {
      if (Math.abs(entry.lateral - nearer.lateral) <= 2 * reach) {
        out.push([`${at}.lateral`, `is hidden from the firing line by target ${nearerIndex}; stagger them laterally`]);
      }
    });
  });
  return out;
};
