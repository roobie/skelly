// Builds the renderer and scene shared by play and benchmark modes. World and
// content setup lives in worldSetup.ts. The voxel grid and physics are in blocks; the scene is in
// metres, so chunk meshes are scaled by the block size. The game's world has the
// hamlet near spawn; the benchmark's has milestone 1.0's test house. Either can have
// the stress-test city instead (`?site=city`).

import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { DAY_SKY } from '../core/sky.ts';
import { ChunkMeshes } from '../render/chunks.ts';
import { applySky, type SkyTargets } from '../render/sky.ts';
import type { GameConfig } from './config.ts';
import type { StreamerStats } from './streamer.ts';
import { createWorldSetup, type WorldSetup } from './worldSetup.ts';

export interface Engine extends WorldSetup {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  meshes: ChunkMeshes;
  /** The scene's lights and fog, for time of day. Starts in daylight, which the benchmark keeps. */
  sky: SkyTargets;
}

export const createEngine = (config: GameConfig, view: HTMLElement, stats?: StreamerStats): Engine => {
  const { scale, radiusM } = config;
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
  const worldSetup = createWorldSetup(config, meshes, stats);
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

  return {
    ...worldSetup,
    renderer,
    scene,
    camera,
    meshes,
    sky,
  };
};
