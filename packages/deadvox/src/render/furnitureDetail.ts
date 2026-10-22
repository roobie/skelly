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

type Box = (position: Vec3, size: Vec3, color: Color) => void;

/** An open frame on a thin back board: hooks hold the barrels, rests on the shelf take the butts. */
function rackFrame(
  box: Box,
  [w, h, d]: Vec3,
  { margin, relief }: { margin: number; relief: number },
  colours: { panel: Color; dark: Color; metal: Color },
): void {
  const front = -d / 2 + margin;
  const frameDepth = d - 2 * margin - relief * 0.7;
  const frameZ = d / 2 - margin - frameDepth / 2;
  const postWidth = w * 0.08;
  for (const side of [-1, 1]) {
    box(
      [side * (w / 2 - margin - postWidth / 2), h / 2, frameZ],
      [postWidth, h - 2 * margin, frameDepth],
      colours.panel,
    );
  }
  for (const y of [margin + h * 0.025, h - margin - h * 0.025]) {
    box([0, y, frameZ], [w - 2 * margin, h * 0.05, frameDepth], colours.panel);
  }
  const barDepth = frameDepth + relief * 0.2;
  const barZ = d / 2 - margin - barDepth / 2;
  box([0, h * 0.68, barZ], [w - 2 * margin, h * 0.06, barDepth], colours.panel);
  box([0, h * 0.12, barZ], [w - 2 * margin, h * 0.04, barDepth], colours.panel);
  for (const fraction of [-0.25, 0, 0.25]) {
    box([w * fraction, h * 0.68, front + relief * 0.3], [w * 0.03, h * 0.03, relief * 0.5], colours.metal);
    box([w * fraction, h * 0.155, front + relief * 0.3], [w * 0.03, h * 0.03, relief * 0.5], colours.dark);
  }
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
  const box: Box = (position, size, color) => colouredBox(parts, position, size, color);
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

  // The dark body stands flush with the back; a shallower one leaves the front open, as a rack's frame needs.
  const body = (depth = d - 2 * margin - relief) =>
    box([0, h / 2, d / 2 - margin - depth / 2], [w - 2 * margin, h - 2 * margin, depth], dark);
  switch (kind) {
    case 'cabinet':
      body();
      for (const side of [-1, 1]) {
        face((side * w) / 4, h / 2, w / 2 - 2 * margin, h - 2 * margin);
        handle(side * w * 0.075, h * 0.52, h * 0.18, true);
      }
      break;
    case 'drawers': {
      body();
      const rows = Math.max(2, Math.min(4, Math.round(h * 1.5)));
      for (let row = 0; row < rows; row++) {
        const y = (h * (row + 0.5)) / rows;
        face(0, y, w - 2 * margin, h / rows - 2 * margin);
        handle(0, y, w * 0.28);
      }
      break;
    }
    case 'fridge':
      body();
      face(0, h * 0.825, w - 2 * margin, h * 0.35 - 2 * margin);
      face(0, h * 0.325, w - 2 * margin, h * 0.65 - 2 * margin);
      handle(-w * 0.32, h * 0.8, h * 0.13, true);
      handle(-w * 0.32, h * 0.45, h * 0.22, true);
      for (let row = 0; row < 3; row++) {
        box([0, h * (0.04 + row * 0.02), front + relief * 0.68], [w * 0.65, h * 0.008, relief * 0.03], dark);
      }
      break;
    case 'door': {
      // One full-height leaf hinged on the left: handle and lock plate sit by the free edge.
      body();
      face(0, h / 2, w - 2 * margin, h - 2 * margin);
      handle(w * 0.3, h * 0.5, h * 0.24, true);
      box([w * 0.3, h * 0.72, front + relief * 0.6], [w * 0.1, w * 0.1, relief * 0.2], metal);
      break;
    }
    case 'lid': {
      // A lid overhangs the body; the seam under it and the clasp across it say it lifts open.
      const lidBottom = h * 0.76;
      const lidTop = h * 0.95;
      body();
      face(0, (margin + lidBottom - h * 0.04) / 2, w - 2 * margin, lidBottom - h * 0.04 - margin);
      const lidFront = front + relief * 0.7;
      const lidBack = d / 2 - margin * 0.5;
      box(
        [0, (lidBottom + lidTop) / 2, (lidFront + lidBack) / 2],
        [w - margin, lidTop - lidBottom, lidBack - lidFront],
        panel,
      );
      box(
        [0, lidTop + (h - margin * 0.5 - lidTop) / 2, relief / 2],
        [w * 0.5, h - margin * 0.5 - lidTop, w * 0.05],
        metal,
      );
      box([0, lidBottom, front + relief * 0.4], [w * 0.14, h * 0.16, relief * 0.4], metal);
      break;
    }
    case 'rack':
      body(d * 0.15);
      rackFrame(box, def.size, { margin, relief }, { panel, dark, metal });
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
