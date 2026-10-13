import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { HAMLET_BLOCK_SIZE } from './hamlet.ts';
import { INVENTORY_REACH } from './reach.ts';
import type { ScenarioDef } from './schema.ts';
import { templateBodySpace } from './templateSpatial.ts';
import { type CompiledTemplate, findPieces, pieceSize } from './templates.ts';

type Piece = CompiledTemplate['pieces'][number];
const markedPieces = (
  registry: Registry,
  scenario: ScenarioDef,
  template: CompiledTemplate,
  marker: string,
): Piece[] => {
  const definition = registry.templates.get(scenario.serviceTemplate)!;
  const entry = definition.palette[marker];
  if (typeof entry !== 'object' || !entry.furniture) {
    return [];
  }
  const furniture = registry.furniture.get(entry.furniture);
  if (!furniture) {
    return [];
  }
  const size = pieceSize(furniture.size, entry.facing ?? 'n');
  const anchors = findPieces(definition, marker, size).anchors ?? [];
  return template.pieces.filter(
    (piece) =>
      piece.furniture === entry.furniture &&
      anchors.some((anchor) => anchor.every((value, axis) => value === piece.pos[axis])),
  );
};

export const portalLadderPoint = (registry: Registry, scenario: ScenarioDef, template: CompiledTemplate): Vec3 => {
  const bottom = markedPieces(registry, scenario, template, scenario.portal.ladder).sort(
    (a, b) => a.pos[1] - b.pos[1],
  )[0]!;
  return [bottom.pos[0] + bottom.size[0] / 2, bottom.pos[1], bottom.pos[2] + bottom.size[2] / 2];
};

const columnIssues = (
  template: CompiledTemplate,
  scenario: ScenarioDef,
  hatch: Piece,
  ladders: Piece[],
): [string, string][] => {
  const bottom = ladders[0]!;
  const top = ladders.at(-1)!;
  if (
    ladders.some(
      (piece, index) =>
        piece.pos[0] !== bottom.pos[0] ||
        piece.pos[2] !== bottom.pos[2] ||
        piece.facing !== bottom.facing ||
        (index > 0 && piece.pos[1] !== ladders[index - 1]!.pos[1] + ladders[index - 1]!.size[1]),
    )
  ) {
    return [['.portal.ladder', 'ladder must be one continuous column']];
  }
  if (
    template.groundLayer === undefined ||
    hatch.pos[1] !== template.groundLayer ||
    top.pos[1] + top.size[1] !== hatch.pos[1] ||
    scenario.portal.upper[1] !== hatch.pos[1] + 1 ||
    scenario.portal.lower[1] !== bottom.pos[1]
  ) {
    return [['.portal', 'hatch, ladder and standing anchors must meet the declared ground and lower landing']];
  }
  const centre = [bottom.pos[0] + bottom.size[0] / 2, bottom.pos[2] + bottom.size[2] / 2];
  if (
    centre[0]! < hatch.pos[0] ||
    centre[0]! >= hatch.pos[0] + hatch.size[0] ||
    centre[1]! < hatch.pos[2] ||
    centre[1]! >= hatch.pos[2] + hatch.size[2]
  ) {
    return [['.portal.hatch', 'hatch must cover the ladder column']];
  }
  return [];
};

export const scenarioPortalIssues = (
  registry: Registry,
  scenario: ScenarioDef,
  template: CompiledTemplate,
): [string, string][] => {
  const hatches = markedPieces(registry, scenario, template, scenario.portal.hatch);
  const ladders = markedPieces(registry, scenario, template, scenario.portal.ladder).sort(
    (a, b) => a.pos[1] - b.pos[1],
  );
  if (hatches.length !== 1 || !registry.furniture.get(hatches[0]!.furniture)?.door?.hatch || hatches[0]!.lock?.locked) {
    return [['.portal.hatch', 'portal needs one unlocked hatch marker']];
  }
  if (ladders.length === 0 || !registry.furniture.get(ladders[0]!.furniture)?.climbable) {
    return [['.portal.ladder', 'portal needs a ladder marker']];
  }
  const issues = columnIssues(template, scenario, hatches[0]!, ladders);
  if (issues.length > 0) {
    return issues;
  }
  const space = templateBodySpace(registry, template);
  const centre = portalLadderPoint(registry, scenario, template);
  for (const [name, position] of [
    ['upper', scenario.portal.upper],
    ['lower', scenario.portal.lower],
  ] as const) {
    if (
      !space.standing(position) ||
      Math.hypot(position[0] - centre[0], position[2] - centre[2]) * HAMLET_BLOCK_SIZE > INVENTORY_REACH
    ) {
      return [[`.portal.${name}`, 'landing needs support, standing clearance and a nearby ladder approach']];
    }
  }
  const [, bottomFeet] = centre;
  for (let feet = bottomFeet; feet <= scenario.portal.upper[1]; feet += 0.5) {
    if (!space.clear([centre[0], feet, centre[2]])) {
      return [['.portal.ladder', 'ladder shaft needs the standing body envelope through the open hatch']];
    }
  }
  return [];
};
