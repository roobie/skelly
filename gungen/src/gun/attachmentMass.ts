import { clippedExtrudedPolygonPolyhedron, polyhedronVolume } from '../core/geometry.ts';
import type { PartDef, Solid } from '../core/schema.ts';
import { GUN_PALETTE } from './palette.ts';

interface MaterialDensity {
  readonly material: string;
  readonly kgPerM3: number;
  readonly source: string;
}

/** Densities for palette materials used by attachment roles; finish color is not a mass input. */
const ATTACHMENT_MATERIAL_DENSITIES: Readonly<Record<string, MaterialDensity>> = {
  'wood-walnut': {
    material: 'American black walnut, oven-dry',
    kgPerM3: 610,
    source: 'https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr190/chapter_05.pdf',
  },
  'wood-birch': {
    material: 'yellow birch, oven-dry',
    kgPerM3: 670,
    source: 'https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr190/chapter_05.pdf',
  },
  'polymer-black': {
    material: 'glass-filled polyamide, representative molded firearm polymer',
    kgPerM3: 1350,
    source: 'https://www.matweb.com/search/QuickText.aspx?SearchText=polyamide+66+30%25+glass+fiber',
  },
  'polymer-od-green': {
    material: 'glass-filled polyamide, representative molded firearm polymer',
    kgPerM3: 1350,
    source: 'https://www.matweb.com/search/QuickText.aspx?SearchText=polyamide+66+30%25+glass+fiber',
  },
  'polymer-fde': {
    material: 'glass-filled polyamide, representative molded firearm polymer',
    kgPerM3: 1350,
    source: 'https://www.matweb.com/search/QuickText.aspx?SearchText=polyamide+66+30%25+glass+fiber',
  },
  'steel-blued': {
    material: 'carbon steel',
    kgPerM3: 7850,
    source: 'https://www.engineeringtoolbox.com/metal-alloys-densities-d_50.html',
  },
  'steel-parkerized': {
    material: 'carbon steel',
    kgPerM3: 7850,
    source: 'https://www.engineeringtoolbox.com/metal-alloys-densities-d_50.html',
  },
  'steel-stainless': {
    material: '304 stainless steel',
    kgPerM3: 8000,
    source: 'https://www.azom.com/article.aspx?ArticleID=965',
  },
  'alu-anodized-black': {
    material: '6061 aluminum alloy',
    kgPerM3: 2700,
    source: 'https://www.makeitfrom.com/material-properties/6061-T6-Aluminum',
  },
  'rubber-black': {
    material: 'vulcanized natural rubber',
    kgPerM3: 1100,
    source: 'https://www.engineeringtoolbox.com/density-solids-d_1265.html',
  },
};

/** Effective solid-volume shares for envelopes whose authored solids omit internal voids. */
const ATTACHMENT_KIND_FILL: Readonly<Record<string, { readonly fraction: number; readonly source: string }>> = {
  optic: {
    fraction: 1,
    source: 'https://www.aimpoint.com/products/aimpoint-micro-t-2/ (96 g; 68 × 41 × 36 mm envelope)',
  },
  suppressor: {
    fraction: 0.7,
    source: 'https://www.surefire.com/socom556-rc2/ (published 5.56 suppressor envelope and mass)',
  },
};

/** Geometric volume in gungen units cubed, preserving a revolved profile's authored hollows. */
const solidVolumeCache = new Map<string, number>();
const attachmentSolidVolumeU3 = (solid: Solid): number => {
  const key = JSON.stringify(solid);
  const cached = solidVolumeCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let result: number;
  if (solid.kind === 'box') {
    result = 8 * solid.box.half[0] * solid.box.half[1] * solid.box.half[2];
  } else if (solid.kind === 'extruded-polygon') {
    const polyhedron = clippedExtrudedPolygonPolyhedron(solid);
    result = polyhedron ? polyhedronVolume(polyhedron) : 0;
  } else {
    let volume = 0;
    for (let index = 0; index < solid.profile.length; index++) {
      const [x1, r1] = solid.profile[index]!;
      const [x2, r2] = solid.profile[(index + 1) % solid.profile.length]!;
      volume += ((x2 - x1) * (r1 * r1 + r1 * r2 + r2 * r2)) / 3;
    }
    result = Math.PI * Math.abs(volume);
  }
  solidVolumeCache.set(key, result);
  return result;
};

const solidMaterial = (family: string, part: PartDef, solid: Solid): string => {
  if (solid.material) {
    return solid.material;
  }
  if (part.material) {
    return part.material;
  }
  const familyMaterial = GUN_PALETTE.roleMaterials?.[family];
  const slot = solid.slot ?? part.slot ?? GUN_PALETTE.roleSlots?.[family];
  if (slot === 'furniture') {
    return GUN_PALETTE.roleMaterials?.foregrip ?? familyMaterial ?? 'polymer-black';
  }
  if (slot === 'accent') {
    return 'rubber-black';
  }
  return familyMaterial ?? 'steel-parkerized';
};

/** Mass in kilograms, independent of the firearm's visual finish context. */
const massCache = new Map<string, number>();
export const attachmentMassKg = (family: string, part: PartDef, metresPerUnit: number, designId?: string): number => {
  const cacheKey = designId
    ? `${family}:${designId}:${metresPerUnit}`
    : `${family}:${part.material ?? ''}:${part.slot ?? ''}:${metresPerUnit}:${JSON.stringify(part.solids)}`;
  const cached = massCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  let fillKind = 'solid';
  if (family === 'sight') {
    fillKind = 'optic';
  } else if (family === 'suppressor') {
    fillKind = 'suppressor';
  }
  const fill = ATTACHMENT_KIND_FILL[fillKind]?.fraction ?? 1;
  const cubicMetresPerUnit = metresPerUnit ** 3;
  const mass = part.solids.reduce((sum, solid) => {
    const materialId = solidMaterial(family, part, solid);
    const density = ATTACHMENT_MATERIAL_DENSITIES[materialId];
    if (!density) {
      throw new Error(`No attachment density for palette material ${materialId}`);
    }
    return sum + attachmentSolidVolumeU3(solid) * cubicMetresPerUnit * density.kgPerM3 * fill;
  }, 0);
  massCache.set(cacheKey, mass);
  return mass;
};
