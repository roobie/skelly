// Builds everything play and benchmark modes share: content, world, streaming,
// renderer and scene. The voxel grid and physics are in blocks; the scene is in
// metres, so chunk meshes are scaled by the block size.

import { Color, DirectionalLight, Fog, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { blockColors, blockId, buildRegistry, type ContentSource, type Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { rasterize } from '../core/structure.ts';
import { World } from '../core/world.ts';
import { terrainHeightMetres } from '../core/worldgen.ts';
import { ChunkMeshes } from '../render/chunks.ts';
import type { SkyLights } from '../render/sky.ts';
import type { GameConfig } from './config.ts';
import { Streamer, type StreamerStats } from './streamer.ts';
import { HOUSE_OFFSET, LOT_CENTRE, SPAWN_OFFSET, SPAWN_YAW, testHouse } from './testHouse.ts';

export interface Engine {
  config: GameConfig;
  registry: Registry;
  /** Content problems, one per line; empty when all content loaded. */
  contentErrors: string;
  world: World;
  isSolid: (x: number, y: number, z: number) => boolean;
  streamer: Streamer;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  meshes: ChunkMeshes;
  /** Daylight at the start; play mode drives them from the clock (render/sky.ts). */
  lights: SkyLights;
  /** Player start in metres (feet), and the yaw that faces the test house. */
  spawn: { pos: Vec3; yaw: number };
}

const loadContent = (): { registry: Registry; contentErrors: string } => {
  // Base content is bundled. Mods would be appended to this list (from URLs or local files).
  const files = import.meta.glob<unknown>('../content/base/*.json', { eager: true, import: 'default' });
  const sources: ContentSource[] = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, data]) => ({ source, data }));
  const { registry, issues } = buildRegistry(sources);
  return { registry, contentErrors: issues.map((i) => `${i.source} ${i.path}: ${i.message}`).join('\n') };
};

export const createEngine = (config: GameConfig, view: HTMLElement, stats?: StreamerStats): Engine => {
  const { registry, contentErrors } = loadContent();
  const { seed, scale, radiusM } = config;
  const id = (name: string) => blockId(registry, name);

  // The test house sits on a level lot at a whole-metre height, so it lines up with any block size.
  const floor = Math.round(terrainHeightMetres(seed, HOUSE_OFFSET[0] + LOT_CENTRE[0], HOUSE_OFFSET[1] + LOT_CENTRE[1]));
  const house = testHouse(
    [HOUSE_OFFSET[0], floor, HOUSE_OFFSET[1]],
    {
      brick: id('brick'),
      plaster: id('plaster'),
      planks: id('planks'),
      tiles: id('tiles'),
      fabric: id('fabric'),
      roof: id('roof'),
      dirt: id('dirt'),
      grass: id('grass'),
    },
    scale.blockSize,
  );

  const world = new World();
  const isSolid = (x: number, y: number, z: number) => {
    const block = world.getBlock(x, y, z);
    return block !== 0 && registry.blocks[block]!.solid;
  };

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
  view.appendChild(renderer.domElement);

  const sky = new Color(0xa9_bf_d0);
  const scene = new Scene();
  scene.background = sky;
  scene.fog = new Fog(sky, radiusM * 0.6, radiusM * 0.95);
  const ambient = new HemisphereLight(0xdf_e8_f0, 0x5a_4a_3a, 1.3);
  scene.add(ambient);
  const sun = new DirectionalLight(0xff_f2_dd, 1.6);
  sun.position.set(0.4, 1, 0.25);
  scene.add(sun);

  const camera = new PerspectiveCamera(75, 1, 0.05, radiusM * 1.6);
  camera.rotation.order = 'YXZ';

  const meshes = new ChunkMeshes(scale.blockSize);
  scene.add(meshes.group);

  const resize = () => {
    renderer.setSize(view.clientWidth, view.clientHeight);
    camera.aspect = view.clientWidth / Math.max(view.clientHeight, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(view);

  const streamer = new Streamer({
    world,
    meshes,
    seed,
    terrain: { grass: id('grass'), dirt: id('dirt'), stone: id('stone'), sand: id('sand') },
    colors: blockColors(registry),
    scale,
    structures: rasterize(house, scale.blockSize),
    radius: config.radiusChunks,
    ...(stats ? { stats } : {}),
  });

  const spawn: Vec3 = [HOUSE_OFFSET[0] + SPAWN_OFFSET[0], floor, HOUSE_OFFSET[1] + SPAWN_OFFSET[2]];
  return {
    config,
    registry,
    contentErrors,
    world,
    isSolid,
    streamer,
    renderer,
    scene,
    camera,
    meshes,
    lights: { sun, ambient },
    spawn: { pos: spawn, yaw: SPAWN_YAW },
  };
};
