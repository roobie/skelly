import { AuthoredSite } from './core/authoredSite.ts';
import { buildingBounds } from './core/authoredTerrain.mjs';
import type { Chunk } from './core/chunk.ts';
import { blockColors, blockId } from './core/content.ts';
import { CHUNK, toChunk, toLocal } from './core/coords.ts';
import { BLOCK_SIZE, makeScale } from './core/scale.ts';
import { generateColumn, terrainBlockIds, worldGroundAt } from './core/worldgen.ts';
import { BUNDLED_CONTENT } from './game/bundledContent.ts';
import {
  hillshade,
  marchingSquares,
  type SiteMapView,
  siteMapPixels,
  siteMapRasterToWorld,
  siteMapWorldToRaster,
} from './render/siteMap.ts';

const CELL_SIZE = BLOCK_SIZE;
const OUTSIDE_MARGIN_METRES = 24;
const DEFAULT_SEED = 73;
const { registry } = BUNDLED_CONTENT;
const params = new URLSearchParams(globalThis.location.search);
const siteId = params.get('site') ?? 'playtest';
const layout = registry.layouts.get(siteId);
if (!layout) {
  throw new Error(`Content does not define site layout "${siteId}"`);
}
const rawSeed = Number(params.get('seed') ?? DEFAULT_SEED);
const seed = Number.isFinite(rawSeed) ? rawSeed | 0 : DEFAULT_SEED;
const selectedView = (params.get('view') === 'satellite' ? 'satellite' : 'topographic') as SiteMapView;
const scale = makeScale(BLOCK_SIZE);
const site = new AuthoredSite(seed, registry, scale, layout);
const requestedBounds = {
  minX: layout.bounds.x0 - OUTSIDE_MARGIN_METRES,
  maxX: layout.bounds.x1 + OUTSIDE_MARGIN_METRES,
  minZ: layout.bounds.z0 - OUTSIDE_MARGIN_METRES,
  maxZ: layout.bounds.z1 + OUTSIDE_MARGIN_METRES,
};
const minBlockX = Math.floor(requestedBounds.minX / CELL_SIZE);
const maxBlockX = Math.round(requestedBounds.maxX / CELL_SIZE);
const minBlockZ = Math.floor(requestedBounds.minZ / CELL_SIZE);
const maxBlockZ = Math.round(requestedBounds.maxZ / CELL_SIZE);
const bounds = {
  minX: minBlockX * CELL_SIZE,
  maxX: maxBlockX * CELL_SIZE,
  minZ: minBlockZ * CELL_SIZE,
  maxZ: maxBlockZ * CELL_SIZE,
};
const mapGrid = { originX: bounds.minX, originZ: bounds.minZ, cellSize: CELL_SIZE };
const blockGrid = { originX: minBlockX, originZ: minBlockZ, cellSize: 1 };
const width = maxBlockX - minBlockX;
const height = maxBlockZ - minBlockZ;
const heights = new Float32Array(width * height);
const blockIds = new Uint16Array(width * height);
const terrain = {
  seed,
  scale,
  blocks: terrainBlockIds((name) => blockId(registry, name)),
  surface: site.surface,
  stamp: (chunk: Chunk) => site.stamp(chunk),
};
const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const context = canvas.getContext('2d', { alpha: false })!;
const status = document.querySelector<HTMLElement>('#map-status')!;
const pointPanel = document.querySelector<HTMLElement>('#point')!;
const label = document.querySelector<HTMLElement>('#map-label')!;
const errorPanel = document.querySelector<HTMLElement>('#error')!;
document.querySelector('#seed')!.textContent = String(seed);

interface RasterMap {
  topographic: HTMLCanvasElement;
  satellite: HTMLCanvasElement;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
  fitScale: number;
}

let raster: RasterMap | undefined;
let view: SiteMapView = selectedView;
let viewport: Viewport | undefined;
let selected: { x: number; y: number; z: number } | undefined;
let drag:
  | { pointerId: number; startX: number; startY: number; viewX: number; viewY: number; moved: boolean }
  | undefined;
let pixelRatio = 1;
let frameHandle = 0;

const processInFrames = (
  count: number,
  batchSize: number,
  process: (index: number) => void,
  progress?: (completed: number) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    let cursor = 0;
    const runBatch = () => {
      try {
        const end = Math.min(count, cursor + batchSize);
        while (cursor < end) {
          process(cursor);
          cursor += 1;
        }
        progress?.(cursor);
        if (cursor < count) {
          requestAnimationFrame(runBatch);
        } else {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    };
    requestAnimationFrame(runBatch);
  });

const topSolidBlock = (chunks: ReturnType<typeof generateColumn>, x: number, z: number): number => {
  for (let ci = chunks.length - 1; ci >= 0; ci -= 1) {
    const chunk = chunks[ci]!;
    const uniform = chunk.uniformId;
    if (uniform !== undefined) {
      if (uniform !== 0) {
        return uniform;
      }
      continue;
    }
    const data = chunk.raw()!;
    const columnStart = x + CHUNK * z;
    for (let y = CHUNK - 1; y >= 0; y -= 1) {
      const id = data[columnStart + CHUNK * CHUNK * y]!;
      if (id !== 0) {
        return id;
      }
    }
  }
  return 0;
};

const sampleGround = async () => {
  status.textContent = 'Sampling the same ground heights used by world generation…';
  await processInFrames(
    height,
    24,
    (row) => {
      const { z: zm } = siteMapRasterToWorld(0, row + 0.5, mapGrid);
      for (let column = 0; column < width; column += 1) {
        const { x: xm } = siteMapRasterToWorld(column + 0.5, row + 0.5, mapGrid);
        heights[column + row * width] = worldGroundAt({ seed, scale, surface: site.surface, xm, zm });
      }
    },
    (rows) => {
      if (rows === height || rows % 96 === 0) {
        status.textContent = `Sampling ground · ${Math.round((rows / height) * 100)}%`;
      }
    },
  );
};

const sampleTopBlocks = async (): Promise<{ columns: number; realSeconds: number }> => {
  const minCx = toChunk(minBlockX);
  const minCz = toChunk(minBlockZ);
  const countZ = Math.ceil(maxBlockZ / CHUNK) - minCz;
  const countX = Math.ceil(maxBlockX / CHUNK) - minCx;
  const total = countX * countZ;
  const started = performance.now();
  await processInFrames(
    total,
    16,
    (index) => {
      const cx = minCx + Math.floor(index / countZ);
      const cz = minCz + (index % countZ);
      const chunks = generateColumn(terrain, cx, cz);
      const x0 = Math.max(minBlockX, cx * CHUNK);
      const x1 = Math.min(maxBlockX, (cx + 1) * CHUNK);
      const z0 = Math.max(minBlockZ, cz * CHUNK);
      const z1 = Math.min(maxBlockZ, (cz + 1) * CHUNK);
      for (let blockZ = z0; blockZ < z1; blockZ += 1) {
        const localZ = toLocal(blockZ);
        for (let blockX = x0; blockX < x1; blockX += 1) {
          const { column, row } = siteMapWorldToRaster(blockX, blockZ, blockGrid);
          blockIds[column + row * width] = topSolidBlock(chunks, toLocal(blockX), localZ);
        }
      }
    },
    (completed) => {
      if (completed === total || completed % 32 === 0) {
        status.textContent = `Generating game chunks · ${completed}/${total} columns`;
      }
    },
  );
  return { columns: total, realSeconds: (performance.now() - started) / 1000 };
};

const makeRaster = (mapView: SiteMapView, shades: Float32Array, colors: Uint8Array): HTMLCanvasElement => {
  const rasterCanvas = document.createElement('canvas');
  rasterCanvas.width = width;
  rasterCanvas.height = height;
  const ctx = rasterCanvas.getContext('2d')!;
  const image = ctx.createImageData(width, height);
  image.data.set(siteMapPixels({ heights, blockIds, blockColors: colors, shades, width, height, view: mapView }));
  ctx.putImageData(image, 0, 0);
  return rasterCanvas;
};

const traceContourLevel = (ctx: CanvasRenderingContext2D, level: number) => {
  const segments = marchingSquares(heights, width, height, level);
  ctx.beginPath();
  for (let i = 0; i < segments.length; i += 4) {
    ctx.moveTo(segments[i]! + 0.5, segments[i + 1]! + 0.5);
    ctx.lineTo(segments[i + 2]! + 0.5, segments[i + 3]! + 0.5);
  }
  ctx.strokeStyle = level % 5 === 0 ? '#27332d' : '#435145';
  ctx.lineWidth = level % 5 === 0 ? 1.3 : 0.7;
  ctx.globalAlpha = level % 5 === 0 ? 0.78 : 0.52;
  ctx.stroke();
  ctx.globalAlpha = 1;
};

const addContours = async (topographic: HTMLCanvasElement) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of heights) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const first = Math.ceil(min);
  const count = Math.floor(max) - first + 1;
  const ctx = topographic.getContext('2d')!;
  status.textContent = 'Tracing one-metre contours…';
  await processInFrames(
    count,
    1,
    (index) => traceContourLevel(ctx, first + index),
    (completed) => {
      if (completed === count || completed % 4 === 0) {
        status.textContent = `Tracing contours · ${first + completed - 1} m`;
      }
    },
  );
};

const generateMap = async (): Promise<RasterMap> => {
  await sampleGround();
  const generated = await sampleTopBlocks();
  const shades = hillshade(heights, width, height, CELL_SIZE);
  const colors = blockColors(registry);
  const topographic = makeRaster('topographic', shades, colors);
  const satellite = makeRaster('satellite', shades, colors);
  await addContours(topographic);
  status.textContent = `Ready · generated ${generated.columns} chunk columns in ${generated.realSeconds.toFixed(1)} s`;
  return { topographic, satellite };
};

const boundsWidth = bounds.maxX - bounds.minX;
const boundsHeight = bounds.maxZ - bounds.minZ;
const resize = () => {
  const rect = canvas.getBoundingClientRect();
  pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
  canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
  if (raster && !viewport) {
    fitToBounds();
  } else {
    draw();
  }
};

const fitToBounds = () => {
  const rect = canvas.getBoundingClientRect();
  const fitScale = Math.min(rect.width / boundsWidth, rect.height / boundsHeight);
  viewport = {
    fitScale,
    scale: fitScale,
    x: (rect.width - boundsWidth * fitScale) / 2,
    y: (rect.height - boundsHeight * fitScale) / 2,
  };
  draw();
};

const screenPoint = (x: number, z: number): [number, number] => {
  const rasterPoint = siteMapWorldToRaster(x, z, mapGrid);
  return [
    viewport!.x + rasterPoint.column * CELL_SIZE * viewport!.scale,
    viewport!.y + rasterPoint.row * CELL_SIZE * viewport!.scale,
  ];
};

interface VisibleBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const visibleBounds = (rect: DOMRect): VisibleBounds => {
  const v = viewport!;
  return {
    minX: Math.max(bounds.minX, bounds.minX - v.x / v.scale),
    maxX: Math.min(bounds.maxX, bounds.minX + (rect.width - v.x) / v.scale),
    minZ: Math.max(bounds.minZ, bounds.minZ - v.y / v.scale),
    maxZ: Math.min(bounds.maxZ, bounds.minZ + (rect.height - v.y) / v.scale),
  };
};

const drawVerticalGrid = (ctx: CanvasRenderingContext2D, rect: DOMRect, area: VisibleBounds) => {
  const v = viewport!;
  for (let x = Math.ceil(area.minX / 10) * 10; x <= area.maxX; x += 10) {
    const [sx] = screenPoint(x, bounds.maxZ);
    const major = x % 50 === 0;
    ctx.strokeStyle = major ? '#27332d75' : '#27332d36';
    ctx.lineWidth = major ? 0.8 : 0.45;
    ctx.beginPath();
    ctx.moveTo(sx, screenPoint(0, area.maxZ)[1]);
    ctx.lineTo(sx, screenPoint(0, area.minZ)[1]);
    ctx.stroke();
    if (major && sx >= 0 && sx <= rect.width) {
      const text = `E ${x} m`;
      ctx.font = '10px system-ui, sans-serif';
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = '#f4f1e7dc';
      ctx.fillRect(sx + 2, Math.max(3, v.y + 2), textWidth + 6, 15);
      ctx.fillStyle = '#202822';
      ctx.fillText(text, sx + 5, Math.max(14, v.y + 13));
    }
  }
};

const drawHorizontalGrid = (ctx: CanvasRenderingContext2D, rect: DOMRect, area: VisibleBounds) => {
  const v = viewport!;
  for (let z = Math.ceil(area.minZ / 10) * 10; z <= area.maxZ; z += 10) {
    const [, sy] = screenPoint(bounds.minX, z);
    const major = z % 50 === 0;
    ctx.strokeStyle = major ? '#27332d75' : '#27332d36';
    ctx.lineWidth = major ? 0.8 : 0.45;
    ctx.beginPath();
    ctx.moveTo(screenPoint(area.minX, z)[0], sy);
    ctx.lineTo(screenPoint(area.maxX, z)[0], sy);
    ctx.stroke();
    if (major && sy >= 0 && sy <= rect.height) {
      const text = `N ${-z} m`;
      ctx.font = '10px system-ui, sans-serif';
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = '#f4f1e7dc';
      ctx.fillRect(Math.max(3, v.x + 2), sy + 2, textWidth + 6, 15);
      ctx.fillStyle = '#202822';
      ctx.fillText(text, Math.max(6, v.x + 5), sy + 13);
    }
  }
};

const drawGrid = (ctx: CanvasRenderingContext2D, rect: DOMRect) => {
  const v = viewport!;
  const area = visibleBounds(rect);
  ctx.save();
  ctx.beginPath();
  ctx.rect(v.x, v.y, boundsWidth * v.scale, boundsHeight * v.scale);
  ctx.clip();
  drawVerticalGrid(ctx, rect, area);
  drawHorizontalGrid(ctx, rect, area);
  ctx.restore();
};

const drawWoodlands = (ctx: CanvasRenderingContext2D) => {
  for (const woodland of layout.woodlands) {
    ctx.beginPath();
    woodland.polygon.forEach(([x, z], index) => {
      const [sx, sy] = screenPoint(x, z);
      if (index === 0) {
        ctx.moveTo(sx, sy);
      } else {
        ctx.lineTo(sx, sy);
      }
    });
    ctx.closePath();
    ctx.fillStyle = '#476b4340';
    ctx.fill();
    ctx.strokeStyle = '#36533b9e';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
};

const drawTracks = (ctx: CanvasRenderingContext2D) => {
  const mapScale = viewport!.scale;
  for (const track of layout.tracks) {
    ctx.beginPath();
    track.points.forEach(([x, z], index) => {
      const [sx, sy] = screenPoint(x, z);
      if (index === 0) {
        ctx.moveTo(sx, sy);
      } else {
        ctx.lineTo(sx, sy);
      }
    });
    ctx.strokeStyle = track.surface === 'asphalt' ? '#303735d9' : '#735f3dd9';
    ctx.lineWidth = Math.max(1, track.width * mapScale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = '#f4f1e777';
    ctx.lineWidth = Math.max(0.6, Math.min(1.2, track.width * mapScale * 0.08));
    ctx.stroke();
  }
};

const drawBuildings = (ctx: CanvasRenderingContext2D) => {
  const mapScale = viewport!.scale;
  for (const building of layout.buildings) {
    const template = registry.templates.get(building.template);
    if (!template) {
      continue;
    }
    const rect = buildingBounds(building, template.size);
    const [x, y] = screenPoint(rect.x0, rect.z0);
    const w = (rect.x1 - rect.x0) * mapScale;
    const h = (rect.z1 - rect.z0) * mapScale;
    ctx.fillStyle = '#e8dfc4d9';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#252d2b';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, h);
    if (mapScale >= 0.7 && w > 24 && h > 13) {
      ctx.font = '10px system-ui, sans-serif';
      const textWidth = ctx.measureText(building.template).width;
      ctx.fillStyle = '#18211de8';
      ctx.fillRect(x + 2, y + 2, Math.min(w - 4, textWidth + 8), 14);
      ctx.fillStyle = '#fbf8ed';
      ctx.fillText(building.template, x + 6, y + 12, Math.max(0, w - 8));
    }
  }
};

const drawLayout = (ctx: CanvasRenderingContext2D) => {
  const v = viewport!;
  ctx.save();
  ctx.beginPath();
  ctx.rect(v.x, v.y, boundsWidth * v.scale, boundsHeight * v.scale);
  ctx.clip();
  drawWoodlands(ctx);
  drawTracks(ctx);
  drawBuildings(ctx);
  ctx.strokeStyle = '#15201b';
  ctx.lineWidth = 1.5;
  const [left, top] = screenPoint(layout.bounds.x0, layout.bounds.z0);
  ctx.strokeRect(
    left,
    top,
    (layout.bounds.x1 - layout.bounds.x0) * v.scale,
    (layout.bounds.z1 - layout.bounds.z0) * v.scale,
  );
  ctx.restore();
};

const draw = () => {
  if (!(raster && viewport)) {
    return;
  }
  cancelAnimationFrame(frameHandle);
  frameHandle = requestAnimationFrame(() => {
    const rect = canvas.getBoundingClientRect();
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = '#c6cec3';
    context.fillRect(0, 0, rect.width, rect.height);
    context.imageSmoothingEnabled = view === 'topographic';
    context.drawImage(
      raster![view],
      viewport!.x,
      viewport!.y,
      boundsWidth * viewport!.scale,
      boundsHeight * viewport!.scale,
    );
    drawGrid(context, rect);
    drawLayout(context);
    if (selected) {
      const [x, y] = screenPoint(selected.x, selected.z);
      context.strokeStyle = '#fef8e5';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.moveTo(x - 12, y);
      context.lineTo(x + 12, y);
      context.moveTo(x, y - 12);
      context.lineTo(x, y + 12);
      context.stroke();
    }
  });
};

const selectAt = (clientX: number, clientY: number) => {
  const rect = canvas.getBoundingClientRect();
  const worldX = bounds.minX + (clientX - rect.left - viewport!.x) / viewport!.scale;
  const worldZ = bounds.minZ + (clientY - rect.top - viewport!.y) / viewport!.scale;
  if (worldX < bounds.minX || worldX >= bounds.maxX || worldZ < bounds.minZ || worldZ >= bounds.maxZ) {
    return;
  }
  const rasterPoint = siteMapWorldToRaster(worldX, worldZ, mapGrid);
  const column = Math.min(width - 1, Math.floor(rasterPoint.column));
  const row = Math.min(height - 1, Math.floor(rasterPoint.row));
  const { x, z } = siteMapRasterToWorld(column + 0.5, row + 0.5, mapGrid);
  const index = column + row * width;
  const y = heights[index]!;
  selected = { x, y, z };
  const position = document.createElement('div');
  position.textContent = `x ${x.toFixed(1)} m · y ${y.toFixed(1)} m · z ${z.toFixed(1)} m`;
  const link = document.createElement('a');
  const game = new URL('/', globalThis.location.origin);
  game.searchParams.set('site', siteId);
  game.searchParams.set('seed', String(seed));
  game.searchParams.set('debug', '1');
  game.searchParams.set('at', `${x},${z}`);
  link.href = game.href;
  link.textContent = 'Open a fresh debug game here';
  link.target = '_blank';
  link.rel = 'noopener';
  pointPanel.replaceChildren(position, link);
  draw();
};

canvas.addEventListener('pointerdown', (event) => {
  if (!viewport || event.button !== 0) {
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    viewX: viewport.x,
    viewY: viewport.y,
    moved: false,
  };
});
canvas.addEventListener('pointermove', (event) => {
  if (!(drag && viewport) || drag.pointerId !== event.pointerId) {
    return;
  }
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  drag.moved ||= Math.hypot(dx, dy) > 4;
  if (drag.moved) {
    viewport.x = drag.viewX + dx;
    viewport.y = drag.viewY + dy;
    canvas.classList.add('dragging');
    draw();
  }
});
canvas.addEventListener('pointerup', (event) => {
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  if (!drag.moved) {
    selectAt(event.clientX, event.clientY);
  }
  drag = undefined;
  canvas.classList.remove('dragging');
});
canvas.addEventListener('pointercancel', () => {
  drag = undefined;
  canvas.classList.remove('dragging');
});
canvas.addEventListener(
  'wheel',
  (event) => {
    if (!viewport) {
      return;
    }
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const anchorRasterColumn = (sx - viewport.x) / (viewport.scale * CELL_SIZE);
    const anchorRasterRow = (sy - viewport.y) / (viewport.scale * CELL_SIZE);
    const anchor = siteMapRasterToWorld(anchorRasterColumn, anchorRasterRow, mapGrid);
    const nextScale = Math.max(
      viewport.fitScale * 0.25,
      Math.min(viewport.fitScale * 24, viewport.scale * Math.exp(-event.deltaY * 0.001)),
    );
    viewport.scale = nextScale;
    viewport.x = sx - (anchor.x - bounds.minX) * nextScale;
    viewport.y = sy - (anchor.z - bounds.minZ) * nextScale;
    draw();
  },
  { passive: false },
);

const viewButtons = document.querySelectorAll<HTMLButtonElement>('[data-view]');
for (const button of viewButtons) {
  button.addEventListener('click', () => {
    view = button.dataset.view as SiteMapView;
    for (const candidate of viewButtons) {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    }
    label.textContent = `PLAYTEST SITE · ${view === 'topographic' ? 'TOPOGRAPHIC' : 'BLOCK COLOURS'}`;
    const url = new URL(globalThis.location.href);
    url.searchParams.set('view', view);
    globalThis.history.replaceState(null, '', url);
    draw();
  });
}
document.querySelector<HTMLButtonElement>('#fit')!.addEventListener('click', fitToBounds);
globalThis.addEventListener('resize', resize);

try {
  raster = await generateMap();
  for (const button of viewButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
  label.textContent = `PLAYTEST SITE · ${view === 'topographic' ? 'TOPOGRAPHIC' : 'BLOCK COLOURS'}`;
  resize();
} catch (error) {
  errorPanel.hidden = false;
  errorPanel.textContent = error instanceof Error ? error.message : String(error);
  status.textContent = 'Map generation failed';
}
