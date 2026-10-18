import { BoxGeometry, type BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../core/coords.ts';
import type { FurnitureDef } from '../core/schema.ts';

function colouredBox(parts: BoxGeometry[], position: Vec3, size: Vec3, color: Color): void {
  const geometry = new BoxGeometry(...size).translate(...position);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  parts.push(geometry);
}

/** Local cell coordinates, centred horizontally; the front faces north (-Z). */
export function furnitureDetail(def: FurnitureDef): BufferGeometry {
  const [w, h, d] = def.size;
  const { kind, surface } = def.appearance!;
  const parts: BoxGeometry[] = [];
  const base = new Color(def.color);
  const panel = base.clone().multiplyScalar(surface === 'plastic' ? 1.05 : 0.98);
  const dark = base.clone().multiplyScalar(0.55);
  const metal = new Color('#91979a');
  const margin = Math.min(w, h, d) * 0.025;
  const relief = Math.min(d * 0.12, 0.12);
  const front = -d / 2 + margin;
  const box = (position: Vec3, size: Vec3, color: Color) => colouredBox(parts, position, size, color);
  const handle = (x: number, y: number, length: number, vertical = false) => {
    const thickness = Math.min(w, h) * 0.025;
    const z = front + relief * 0.3;
    for (const end of [-1, 1]) {
      box(
        [x + (vertical ? 0 : (end * length) / 2), y + (vertical ? (end * length) / 2 : 0), z + relief * 0.3],
        [thickness, thickness, relief * 0.6],
        metal,
      );
    }
    box(
      [x, y, z],
      [vertical ? thickness : length + thickness, vertical ? length + thickness : thickness, relief * 0.2],
      metal,
    );
  };
  const face = (x: number, y: number, width: number, height: number) => {
    box([x, y, front + relief * 0.85], [width, height, relief * 0.3], panel);
    if (surface === 'wood') {
      // Low-contrast grain catches light without a texture fetch or another material.
      for (const fraction of [-0.28, 0, 0.28]) {
        box(
          [x + width * fraction, y, front + relief * 0.685],
          [width * 0.012, height * 0.94, relief * 0.03],
          base.clone().multiplyScalar(0.83),
        );
      }
    }
  };

  box([0, h / 2, relief / 2], [w - 2 * margin, h - 2 * margin, d - 2 * margin - relief], dark);
  switch (kind) {
    case 'cabinet':
      for (const side of [-1, 1]) {
        face((side * w) / 4, h / 2, w / 2 - 2 * margin, h - 2 * margin);
        handle(side * w * 0.075, h * 0.52, h * 0.18, true);
      }
      break;
    case 'drawers': {
      const rows = Math.max(2, Math.min(4, Math.round(h * 1.5)));
      for (let row = 0; row < rows; row++) {
        const y = (h * (row + 0.5)) / rows;
        face(0, y, w - 2 * margin, h / rows - 2 * margin);
        handle(0, y, w * 0.28);
      }
      break;
    }
    case 'fridge':
      face(0, h * 0.825, w - 2 * margin, h * 0.35 - 2 * margin);
      face(0, h * 0.325, w - 2 * margin, h * 0.65 - 2 * margin);
      handle(-w * 0.32, h * 0.8, h * 0.13, true);
      handle(-w * 0.32, h * 0.45, h * 0.22, true);
      for (let row = 0; row < 3; row++) {
        box([0, h * (0.04 + row * 0.02), front + relief * 0.68], [w * 0.65, h * 0.008, relief * 0.03], dark);
      }
      break;
    default:
      throw new Error(`unsupported furniture detail: ${kind satisfies never}`);
  }
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  if (!geometry) {
    throw new Error('could not merge furniture detail');
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
