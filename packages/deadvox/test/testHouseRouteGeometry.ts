import layouts from '../src/content/base/layouts-test-house.json' with { type: 'json' };
import templates from '../src/content/base/templates-test-house.json' with { type: 'json' };

const layout = layouts.layouts[0]!;
const wall = templates.templates.find((template) => Object.values(template.palette).includes('hazard_yellow'))!;
const building = layout.buildings.find(({ template }) => template === wall.id)!;
const row = wall.layers.at(-1)![0]!;
const start = row.indexOf('.');
const end = row.lastIndexOf('.') + 1;
export const HOUSE_OFFSET: readonly [number, number] = [building.position[0]!, building.position[2]!];
export const GARDEN_GATE = {
  centreX: (start + end) / 4,
  widthM: (end - start) / 2,
  approachZ: -0.75,
  exitZ: wall.size[2]! / 2 + 2,
};
