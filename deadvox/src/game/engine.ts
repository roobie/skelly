// Builds everything play and benchmark modes share: content, world, streaming,
// renderer and scene. The voxel grid and physics are in blocks; the scene is in
// metres, so chunk meshes are scaled by the block size. The game's world has the
// hamlet near spawn; the benchmark's has milestone 1.0's test house. Either can have
// the stress-test city instead (`?site=city`).

import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { BlockEntities } from '../core/blockEntities.ts';
import { StressCity } from '../core/city.ts';
import { blockColors, blockId, buildRegistry, type ContentSource, type Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import { HAMLET_BLOCK_SIZE, HAMLET_TEMPLATES, Hamlet } from '../core/hamlet.ts';
import type { Site } from '../core/site.ts';
import { DAY_SKY } from '../core/sky.ts';
import { type BlockBox, rasterize } from '../core/structure.ts';
import { World } from '../core/world.ts';
import { terrainHeight, terrainHeightMetres } from '../core/worldgen.ts';
import { ChunkMeshes } from '../render/chunks.ts';
import { applySky, type SkyTargets } from '../render/sky.ts';
import type { GameConfig } from './config.ts';
import { Streamer, type StreamerStats } from './streamer.ts';
import { HOUSE_OFFSET, LOT_CENTRE, SPAWN_OFFSET, SPAWN_YAW, testHouse } from './testHouse.ts';

export interface Engine {
  config: GameConfig;
  registry: Registry;
  /** Content problems, one per line; empty when all content loaded. */
  contentErrors: string;
  world: World;
  /** Furniture and doors. The game adds them as their columns generate. */
  entities: BlockEntities;
  /** The hamlet or the city, when this world has one. */
  site: Site | undefined;
  /** The top of the ground in metres at a point in metres, the site's flattening included. */
  groundAt: (xm: number, zm: number) => number;
  /** Blocks and block entities that stop movement. */
  isSolid: (x: number, y: number, z: number) => boolean;
  streamer: Streamer;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  meshes: ChunkMeshes;
  /** The scene's lights and fog, for time of day. Starts in daylight, which the benchmark keeps. */
  sky: SkyTargets;
  /** Player start in metres (feet), and the yaw that faces the hamlet or the test house. */
  spawn: { pos: Vec3; yaw: number };
}

/** The test house, rasterized, and a spawn point facing its front door. */
const testHouseSite = (config: GameConfig, registry: Registry) => {
  const { seed, scale } = config;
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
  const spawn: Vec3 = [HOUSE_OFFSET[0] + SPAWN_OFFSET[0], floor, HOUSE_OFFSET[1] + SPAWN_OFFSET[2]];
  return { structures: rasterize(house, scale.blockSize), spawn: { pos: spawn, yaw: SPAWN_YAW } };
};

/**
 * The hamlet or the city, if the config asks for one and content has what it needs.
 * Otherwise (other block sizes, broken content) the world has the test house.
 */
const buildSite = (config: GameConfig, registry: Registry): Site | undefined => {
  const buildable =
    config.scale.blockSize === HAMLET_BLOCK_SIZE &&
    registry.blockIds.has('asphalt') &&
    HAMLET_TEMPLATES.every((t) => registry.templates.has(t));
  if (!buildable || config.site === 'testHouse') {
    return undefined;
  }
  return config.site === 'city'
    ? new StressCity(config.seed, registry, config.scale, config.storeys)
    : new Hamlet(config.seed, registry, config.scale);
};

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

  const built = buildSite(config, registry);
  const site: { structures: BlockBox[]; spawn: Engine['spawn'] } = built
    ? { structures: [], spawn: built.spawn }
    : testHouseSite(config, registry);
  const s = scale.blockSize;
  // Without a site this is the formula the 1.0 and 1.1 benchmarks used, so their results still compare.
  const groundAt = (xm: number, zm: number): number => {
    if (!built) {
      return Math.floor(terrainHeightMetres(seed, xm, zm) / s) * s + s;
    }
    const [x, z] = [Math.floor(xm / s), Math.floor(zm / s)];
    return (built.surface.height(x, z, terrainHeight(seed, scale, x, z)) + 1) * s;
  };

  const world = new World();
  const entities = new BlockEntities(registry);
  const isSolid = (x: number, y: number, z: number) => {
    const block = world.getBlock(x, y, z);
    return (block !== 0 && registry.blocks[block]!.solid) || entities.isSolid(x, y, z);
  };

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
  view.appendChild(renderer.domElement);

  const scene = new Scene();
  // The far plane is set by the sky: it ends where the fog does.
  const camera = new PerspectiveCamera(75, 1, 0.05, radiusM);
  camera.rotation.order = 'YXZ';
  const sky: SkyTargets = { scene, light: new DirectionalLight(), ambient: new HemisphereLight(), camera, radiusM };
  scene.add(sky.ambient, sky.light);
  applySky(sky, DAY_SKY);

  const meshes = new ChunkMeshes(scale.blockSize);
  scene.add(meshes.group);
  // Chunk meshes are culled against their tight boxes, after three.js has updated the camera.
  scene.onBeforeRender = (_renderer, _scene, cam) => meshes.cull(cam);

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
    structures: site.structures,
    surface: built?.surface,
    stamp: built ? (chunk) => built.stamp(chunk) : undefined,
    radius: config.radiusChunks,
    ...(stats ? { stats } : {}),
  });

  return {
    config,
    registry,
    contentErrors,
    world,
    entities,
    site: built,
    groundAt,
    isSolid,
    streamer,
    renderer,
    scene,
    camera,
    meshes,
    sky,
    spawn: site.spawn,
  };
};
