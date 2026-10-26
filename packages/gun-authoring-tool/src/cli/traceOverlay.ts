import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import { applyPoint, type Vec3 } from '@skelly/engine/foundation/math.ts';
import { displayItems } from '@skelly/engine/shapes/display.ts';
import { displayBevel, meshForSolid, meshForSolidGroup } from '@skelly/engine/shapes/mesh.ts';
import { loadGunDesign } from '../gun/designLoader.ts';
import { gunDomain } from '../gun/domain.ts';
import type { TracePoint } from '../gun/trace.ts';
import {
  overlayBounds,
  projectionDepth,
  projectPoint,
  scaleBarPixels,
  type TraceProjection,
} from '../gun/traceProjection.ts';
import { parseTraceRecord, resolveTraceReference } from '../gun/traceRecord.ts';
import { parseTraceSvg } from '../gun/traceSvg.ts';

const dataUrl = (mime: string, bytes: Buffer): string => `data:${mime};base64,${bytes.toString('base64')}`;
const coordinates = (raw: string, count: number): number[] => {
  const parts = raw.split(',');
  const values = parts.map(Number);
  if (parts.some((part) => part.trim() === '') || values.length !== count || !values.every(Number.isFinite)) {
    throw new Error(`Expected ${count} finite comma-separated coordinates, got ${raw}`);
  }
  return values;
};

const projectedTriangles = (resolved: Resolved, projection: TraceProjection) => {
  const triangles: { points: readonly TracePoint[]; depth: number; color: string }[] = [];
  const colors = ['#007e87', '#147cf3', '#9342bd', '#b27900', '#008849'];
  let partIndex = 0;
  for (const [part, transform] of resolved.placed) {
    const def = resolved.defs.get(part)!;
    const color = colors[partIndex % colors.length]!;
    partIndex += 1;
    for (const item of displayItems(def.displaySolids ?? def.solids)) {
      const mesh = item.merged
        ? meshForSolidGroup(item.solids)
        : meshForSolid(item.solids[0]!, displayBevel(item.solids[0]!, resolved.domain.units));
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const vertices = [0, 1, 2].map((offset) => {
          const index = mesh.indices[i + offset]! * 3;
          return applyPoint(transform, [
            mesh.positions[index]!,
            mesh.positions[index + 1]!,
            mesh.positions[index + 2]!,
          ]);
        });
        triangles.push({
          points: vertices.map((p) => projectPoint(p, projection)),
          depth: vertices.reduce((sum, p) => sum + projectionDepth(p, projection.view), 0) / 3,
          color,
        });
      }
    }
  }
  return triangles;
};

export const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      design: { type: 'string' },
      photo: { type: 'string' },
      record: { type: 'string' },
      view: { type: 'string' },
      'model-datum': { type: 'string' },
      'photo-datum': { type: 'string' },
      'mm-per-pixel': { type: 'string' },
      'bar-mm': { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'trace:overlay --design design.json --photo image.png --record reference.trace.json --view left|right --model-datum x,y,z --photo-datum x,y --mm-per-pixel n --bar-mm n --out overlay.png',
    );
    return;
  }
  const required = (key: keyof typeof values): string => {
    const value = values[key];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Missing --${key}; see --help`);
    }
    return value;
  };
  const view = required('view');
  if (view !== 'left' && view !== 'right') {
    throw new Error('--view must be left or right');
  }
  const projection: TraceProjection = {
    view,
    modelDatum: coordinates(required('model-datum'), 3) as unknown as Vec3,
    photoDatum: coordinates(required('photo-datum'), 2) as unknown as TracePoint,
    mmPerPixel: Number(required('mm-per-pixel')),
  };
  const barMm = Number(required('bar-mm'));
  const barPixels = scaleBarPixels(barMm, projection.mmPerPixel);
  const output = required('out');
  const design = loadGunDesign(readFileSync(required('design'), 'utf8'));
  if (!design.ok) {
    throw new Error(JSON.stringify(design.error));
  }
  const resolved = resolve(design.design.assembly, gunDomain);
  const triangles = projectedTriangles(resolved, projection);
  const recordPath = resolvePath(required('record'));
  const record = parseTraceRecord(JSON.parse(readFileSync(recordPath, 'utf8')));
  let trace: { url: string; width: number; height: number } | undefined;
  if (record.reference) {
    const svg = readFileSync(resolvePath(dirname(recordPath), record.reference.svg), 'utf8');
    resolveTraceReference(record.reference, svg);
    const parsed = parseTraceSvg(svg);
    trace = { url: dataUrl('image/svg+xml', Buffer.from(svg)), width: parsed.width, height: parsed.height };
  }
  const photoPath = required('photo');
  const mime = (
    { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<
      string,
      string
    >
  )[extname(photoPath).toLowerCase()];
  if (!mime) {
    throw new Error('Photo must be PNG, JPEG or WebP');
  }
  const photoUrl = dataUrl(mime, readFileSync(photoPath));
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const size = await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, photoUrl);
    if (trace && (trace.width !== size.width || trace.height !== size.height)) {
      throw new Error('Photo dimensions must match the trace viewBox; no automatic stretching');
    }
    const bounds = overlayBounds(
      size.width,
      size.height,
      triangles.flatMap(({ points }) => points),
    );
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (barPixels > width - 40) {
      throw new Error('Scale bar does not fit; choose a smaller --bar-mm');
    }
    const [x, y] = projectPoint(projection.modelDatum, projection);
    const polygons = triangles
      .sort((a, b) => a.depth - b.depth)
      .map(({ points, color }) => `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${color}"/>`)
      .join('');
    const calibration = record.reference?.calibration;
    const calibrationLine = calibration
      ? `<polyline points="${calibration.pixels.value.map((p) => p.join(',')).join(' ')}" stroke="#007e87" stroke-width="2" stroke-dasharray="4 3" fill="none"/>`
      : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 72}" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height + 72}">
      <rect x="${bounds.minX}" y="${bounds.minY}" width="100%" height="100%" fill="white"/>
      <g>
        <image href="${photoUrl}" width="${size.width}" height="${size.height}"/>
        <g opacity="0.45">${polygons}</g>
        ${trace ? `<image href="${trace.url}" width="${size.width}" height="${size.height}"/>` : ''}
        <path d="M${bounds.minX},${y}H${bounds.maxX} M${x},${bounds.minY}V${bounds.maxY}" stroke="#df003f" stroke-dasharray="6 5" fill="none"/>
        <circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#df003f"/>
        ${calibrationLine}
      </g>
      <path d="M${bounds.minX + 20},${bounds.maxY + 20}h${barPixels}" stroke="black" stroke-width="3"/>
      <text x="${bounds.minX + 20}" y="${bounds.maxY + 40}" font-size="14">${barMm} mm | ${projection.mmPerPixel} mm/px | ${view} view</text>
      <text x="${bounds.minX + 20}" y="${bounds.maxY + 60}" font-size="14">Photo + model${trace ? ' + trace' : ''}; red = registration, teal = calibration</text>
    </svg>`;
    await page.setViewportSize({ width, height: height + 72 });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await page.evaluate(async () => {
      await Promise.all(
        [...document.querySelectorAll('image')].map(
          (element) =>
            new Promise<void>((ok, fail) => {
              const image = new Image();
              image.onload = () => ok();
              image.onerror = () => fail(new Error('Overlay image decode failed'));
              image.src = element.getAttribute('href')!;
            }),
        ),
      );
      await document.fonts.ready;
    });
    mkdirSync(dirname(resolvePath(output)), { recursive: true });
    await page.screenshot({ path: output, type: 'png' });
    console.log(`Wrote ${output}`);
  } finally {
    await browser.close();
  }
};

await main();
