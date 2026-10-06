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
tiledGlobals[MAP_OBJECT] = { [POINT]: 'point' };
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
    expect(exportLayout(map).layouts[0]!.shamblers[0]!.window).toEqual({ from: 'dusk', to: 'dawn' });
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
