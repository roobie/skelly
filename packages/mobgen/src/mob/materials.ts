import type { Body } from '../core/body.ts';
import type { Vec3 } from '../core/math.ts';
import type { Template } from '../core/template.ts';

const HUE_WEDGES: readonly (readonly [number, (c: number, x: number) => Vec3])[] = [
  [60, (c, x) => [c, x, 0]],
  [120, (c, x) => [x, c, 0]],
  [180, (c, x) => [0, c, x]],
  [240, (c, x) => [0, x, c]],
  [300, (c, x) => [x, 0, c]],
  [360, (c, x) => [c, 0, x]],
];

const hslToRgb = (hDeg: number, s: number, l: number): Vec3 => {
  const h = ((hDeg % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const wedge = HUE_WEDGES.find(([max]) => h < max) ?? HUE_WEDGES.at(-1)!;
  const [r1, g1, b1] = wedge[1](c, x);
  return [r1 + m, g1 + m, b1 + m];
};

export const resolveMaterials = (template: Template, params: Readonly<Record<string, number>>): Body['materials'] => {
  const materials = { ...template.materials };
  for (const [name, hsl] of Object.entries(template.materialHsl ?? {})) {
    const definition = materials[name];
    if (!definition) {
      throw new Error(`undeclared HSL material "${name}"`);
    }
    const values = hsl.map((value) => {
      const resolved = typeof value === 'number' ? value : params[value];
      if (resolved === undefined || !Number.isFinite(resolved)) {
        throw new Error(`invalid material parameter "${value}"`);
      }
      return resolved;
    });
    materials[name] = { ...definition, color: hslToRgb(values[0]!, values[1]!, values[2]!) };
  }
  return materials;
};
