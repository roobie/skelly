import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const mapsPath = join(process.cwd(), 'maps');
const projectPath = join(mapsPath, 'deadvox.tiled-project');
const FILE_INFO = 'FileInfo';
const MAP_OBJECT = 'MapObject';
const TILE_MAP = 'TileMap';
const TEXT_FILE = 'TextFile';
const TILED = 'tiled';
const POINT = 'Point';
const RECTANGLE = 'Rectangle';
const POLYGON = 'Polygon';
const POLYLINE = 'Polyline';
const ELLIPSE = 'Ellipse';
const ORTHOGONAL = 'Orthogonal';
const READ_ONLY = 'ReadOnly';
const WINDOW_FROM = 'window_from';
const WINDOW_TO = 'window_to';
const TiledTextFile = class {
  private readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  readAll() {
    return readFileSync(this.path, 'utf8');
  }
  close() {
    // The stub reads synchronously and owns no open file handle.
  }
};
Object.defineProperty(TiledTextFile, READ_ONLY, { value: 0 });
const tiledGlobals: Record<string, unknown> = {};
tiledGlobals[FILE_INFO] = { path: () => mapsPath };
tiledGlobals[MAP_OBJECT] = {
  [POINT]: 'point',
  [RECTANGLE]: 'rectangle',
  [POLYGON]: 'polygon',
  [POLYLINE]: 'polyline',
  [ELLIPSE]: 'ellipse',
};
tiledGlobals[TILE_MAP] = { [ORTHOGONAL]: 'orthogonal' };
tiledGlobals[TEXT_FILE] = TiledTextFile;
tiledGlobals[TILED] = {
  projectFilePath: projectPath,
  registerMapFormat: (_name: string, _format: unknown) => undefined,
  registerAction: () => ({}),
  extendMenu: () => undefined,
  log: () => undefined,
};
Object.assign(globalThis, tiledGlobals);

// @ts-expect-error Tiled scripts are JavaScript modules without a TypeScript declaration.
const { exportLayout } = await import('../maps/extensions/deadvox.mjs');

const shapeFor = (entry: { point?: boolean; polyline?: unknown[]; polygon?: unknown[]; ellipse?: boolean }) => {
  if (entry.point) {
    return 'point';
  }
  if (entry.polyline) {
    return 'polyline';
  }
  if (entry.polygon) {
    return 'polygon';
  }
  if (entry.ellipse) {
    return 'ellipse';
  }
  return 'rectangle';
};

const object = (className: string, x: number, y: number, properties: Record<string, unknown>) => ({
  name: className,
  className,
  shape: 'point',
  x,
  y,
  rotation: 0,
  property: (name: string) => properties[name],
});

describe('Tiled spawn-window export', () => {
  it('exports optional marker windows as authored-layout window objects', () => {
    const layer = {
      offset: { x: 0, y: 0 },
      isGroupLayer: false,
      isObjectLayer: true,
      objects: [
        object('player_spawn', 5, 5, { elevation: 0.5, bearing: 0 }),
        object('shambler', 8, 8, {
          zombie: 'shambler',
          chance: 1,
          elevation: 0.5,
          [WINDOW_FROM]: 'dusk',
          [WINDOW_TO]: 'dawn',
        }),
      ],
    };
    const map = {
      tileWidth: 1,
      tileHeight: 1,
      infinite: false,
      orientation: 'orthogonal',
      width: 20,
      height: 20,
      layerCount: 1,
      layerAt: () => layer,
      property: (name: string) => ({ id: 'timed_fixture', ground: 0 })[name as 'id' | 'ground'],
    };
    const {
      layouts: [layout],
    } = exportLayout(map);
    const {
      shamblers: [shambler],
    } = layout;
    expect(shambler.window).toEqual({ fromGameTimeOfDay: 'dusk', toGameTimeOfDay: 'dawn' });
  });

  it('keeps the committed playtest layout exported from its Tiled source', () => {
    const source = JSON.parse(readFileSync(join(mapsPath, 'playtest.tmj'), 'utf8')) as {
      width: number;
      height: number;
      tilewidth: number;
      tileheight: number;
      infinite: boolean;
      orientation: string;
      properties: { name: string; value: unknown }[];
      layers: {
        name: string;
        type: string;
        x: number;
        y: number;
        objects: {
          properties?: { name: string; value: unknown }[];
          point?: boolean;
          polyline?: unknown[];
          polygon?: unknown[];
          ellipse?: boolean;
          type: string;
        }[];
      }[];
    };
    const map = {
      tileWidth: source.tilewidth,
      tileHeight: source.tileheight,
      infinite: source.infinite,
      orientation: source.orientation,
      width: source.width,
      height: source.height,
      layerCount: source.layers.length,
      layerAt: (index: number) => {
        const layer = source.layers[index]!;
        return {
          name: layer.name,
          offset: { x: layer.x, y: layer.y },
          isGroupLayer: layer.type === 'group',
          isObjectLayer: layer.type === 'objectgroup',
          objects: layer.objects.map((entry) => {
            const properties = Object.fromEntries((entry.properties ?? []).map(({ name, value }) => [name, value]));
            return {
              ...entry,
              polygon: entry.polygon ?? entry.polyline,
              className: entry.type,
              shape: shapeFor(entry),
              property: (name: string) => properties[name],
            };
          }),
        };
      },
      property: (name: string) => source.properties.find((property) => property.name === name)?.value,
    };
    const {
      layouts: [rawLayout],
    } = exportLayout(map);
    const exported = { layouts: [rawLayout] };
    const tiledProject = JSON.parse(readFileSync(projectPath, 'utf8')) as {
      propertyTypes: { name: string; values: string[] }[];
    };
    const allowedTemplates = tiledProject.propertyTypes.find(({ name }) => name === 'template_id')?.values ?? [];
    expect(allowedTemplates.length).toBeGreaterThan(0);
    for (const { template } of rawLayout.buildings) {
      expect(allowedTemplates, template).toContain(template);
    }
    const committed = JSON.parse(
      readFileSync(join(mapsPath, '../src/content/base/layouts-playtest.json'), 'utf8'),
    ) as unknown;
    expect(exported).toEqual(committed);
  });

  it('rejects a close boundary without an opening boundary', () => {
    const layer = {
      offset: { x: 0, y: 0 },
      isGroupLayer: false,
      isObjectLayer: true,
      objects: [
        object('player_spawn', 5, 5, { elevation: 0.5, bearing: 0 }),
        object('shambler', 8, 8, { zombie: 'shambler', elevation: 0.5, [WINDOW_TO]: 'dawn' }),
      ],
    };
    const map = {
      tileWidth: 1,
      tileHeight: 1,
      infinite: false,
      orientation: 'orthogonal',
      width: 20,
      height: 20,
      layerCount: 1,
      layerAt: () => layer,
      property: (name: string) => ({ id: 'timed_fixture', ground: 0 })[name as 'id' | 'ground'],
    };
    expect(() => exportLayout(map)).toThrow('window_to requires window_from');
  });
});
