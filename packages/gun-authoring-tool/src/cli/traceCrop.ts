import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { cropGrid, type TraceCrop, validateCrop } from '../gun/traceCrop.ts';
import { photoDataUrl, positiveArgument } from './traceCli.ts';

const drawCrop = async ({
  photo,
  crop,
  grid,
  gutter,
  width,
  height,
}: {
  photo: string;
  crop: TraceCrop;
  grid: ReturnType<typeof cropGrid>;
  gutter: number;
  width: number;
  height: number;
}): Promise<void> => {
  const canvas = document.querySelector('canvas')!;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  const image = new Image();
  image.src = photo;
  await image.decode();
  ctx.translate(gutter, gutter);
  ctx.imageSmoothingEnabled = false;
  const w = crop.width * crop.zoom;
  const h = crop.height * crop.zoom;
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, w, h);
  ctx.fillStyle = 'rgba(0, 126, 135, 0.6)';
  for (const line of grid.x) {
    ctx.fillRect(line.position, 0, 1, h);
  }
  for (const line of grid.y) {
    ctx.fillRect(0, line.position, w, 1);
  }
  ctx.strokeStyle = '#333';
  ctx.strokeRect(0, 0, w, h);
  ctx.fillStyle = '#111';
  ctx.font = '12px monospace';
  const xStride = Math.max(
    1,
    Math.ceil((ctx.measureText(String(crop.x + crop.width)).width + 8) / (crop.zoom * crop.gridStep)),
  );
  const yStride = Math.max(1, Math.ceil(18 / (crop.zoom * crop.gridStep)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let index = 0; index < grid.x.length; index += xStride) {
    const line = grid.x[index]!;
    ctx.fillText(String(line.source), line.position, -8);
    ctx.fillText(String(line.source), line.position, h + 24);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let index = 0; index < grid.y.length; index += yStride) {
    const line = grid.y[index]!;
    ctx.fillText(String(line.source), -8, line.position);
  }
  ctx.textAlign = 'left';
  for (let index = 0; index < grid.y.length; index += yStride) {
    const line = grid.y[index]!;
    ctx.fillText(String(line.source), w + 8, line.position);
  }
  ctx.fillText('Source pixels', -gutter + 8, -gutter + 14);
  ctx.fillText(`${crop.x},${crop.y} | ${crop.zoom}x`, -gutter + 8, -gutter + 30);
};

export const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      photo: { type: 'string' },
      region: { type: 'string' },
      zoom: { type: 'string' },
      'grid-step': { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log('trace:crop --photo image.png --region x,y,width,height --zoom n --grid-step n --out crop.png');
    console.log(
      'Integer source-pixel region, integer zoom >= 1, positive integer grid step. Grid lines use source pixel boundaries; labels stay in source coordinates. Dense grids thin labels, not lines. Keep output outside the repository.',
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
  const parts = required('region').split(',');
  const region = parts.map(Number);
  if (parts.length !== 4 || parts.some((part) => part.trim() === '') || !region.every(Number.isSafeInteger)) {
    throw new Error('--region must be four integers: x,y,width,height');
  }
  const crop: TraceCrop = {
    x: region[0]!,
    y: region[1]!,
    width: region[2]!,
    height: region[3]!,
    zoom: positiveArgument(required('zoom'), '--zoom'),
    gridStep: positiveArgument(required('grid-step'), '--grid-step'),
  };
  validateCrop(crop, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const photo = photoDataUrl(required('photo'));
  const output = required('out');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const size = await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, photo);
    validateCrop(crop, size.width, size.height);
    const grid = cropGrid(crop);
    const gutter = Math.max(
      56,
      String(crop.x + crop.width).length * 8 + 16,
      String(crop.y + crop.height).length * 8 + 16,
    );
    const width = crop.width * crop.zoom + 2 * gutter;
    const height = crop.height * crop.zoom + 2 * gutter;
    await page.setViewportSize({ width, height });
    await page.setContent('<html><body style="margin:0"><canvas></canvas></body></html>');
    await page.evaluate(drawCrop, { photo, crop, grid, gutter, width, height });
    mkdirSync(dirname(resolve(output)), { recursive: true });
    await page.locator('canvas').screenshot({ path: output, type: 'png' });
    console.log(`Wrote ${output}`);
  } finally {
    await browser.close();
  }
};

await main();
