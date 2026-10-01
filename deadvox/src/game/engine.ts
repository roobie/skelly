// Builds the renderer and scene shared by play and benchmark modes. World and
// content setup lives in worldSetup.ts. The voxel grid and physics are in blocks; the scene is in
// metres, so chunk meshes are scaled by the block size. The game's world has the
// hamlet near spawn; the benchmark's has milestone 1.0's test house. Either can have
// the stress-test city instead (`?site=city`).

import { DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { DAY_SKY } from '../core/sky.ts';
import { ChunkMeshes } from '../render/chunks.ts';
import { Mood } from '../render/mood.ts';
import { PLAYER_FIGURE_LAYER } from '../render/shadowFlags.ts';
import { Shadows } from '../render/shadows.ts';
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
  /** Bloom, grade, film and height fog. Everything starts off; play turns it on (benchmarks never do). */
  mood: Mood;
  /** Sun and flashlight shadows. Everything starts off; play turns it on (benchmarks never do). */
  shadows: Shadows;
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
  camera.layers.enable(PLAYER_FIGURE_LAYER);
  const sky: SkyTargets = { scene, light: new DirectionalLight(), ambient: new HemisphereLight(), camera, radiusM };
  // The sun sits in a rig so shadows can move its box with the player without touching the light's
  // direction (its position within the rig, which the hands' light copies, stays a unit vector).
  const sunRig = new Group();
  sunRig.add(sky.light, sky.light.target);
  scene.add(sky.ambient, sunRig);
  applySky(sky, DAY_SKY);

  const meshes = new ChunkMeshes(scale.blockSize);
  const worldSetup = createWorldSetup(config, meshes, stats);
  scene.add(meshes.group);
  // Chunk meshes are culled against their tight boxes, after three.js has updated the camera.
  scene.onBeforeRender = (_renderer, _scene, cam) => meshes.cull(cam);

  const mood = new Mood(renderer, scene, camera);
  const shadows = new Shadows(renderer, scene, { light: sky.light, rig: sunRig }, meshes);

  const resize = () => {
    renderer.setSize(view.clientWidth, view.clientHeight);
    mood.setSize(view.clientWidth, view.clientHeight);
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
    mood,
    shadows,
  };
};
