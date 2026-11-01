// Builds the renderer and scene shared by play and benchmark modes. World and
// content setup lives in worldSetup.ts. The voxel grid and physics are in blocks; the scene is in
// metres, so chunk meshes are scaled by the block size. The game's world has the
// selected scenario; the benchmark's has the test house. Either can have
// the stress-test city instead (`?site=city`).

import { DirectionalLight, Fog, Group, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { requireDayCycle } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { CHUNK } from '../core/coords.ts';
import { skyAt } from '../core/sky.ts';
import { ChunkMeshes } from '../render/chunks.ts';
import { Mood } from '../render/mood.ts';
import { OPTIC_BODY_LAYER, PLAYER_FIGURE_LAYER } from '../render/shadowFlags.ts';
import { Shadows } from '../render/shadows.ts';
import { applySky, type SkyTargets } from '../render/sky.ts';
import { Skylight } from '../render/skylight.ts';
import type { GameConfig } from './config.ts';
import { GraphicsControls } from './graphicsControls.ts';
import type { StreamerStats } from './streamer.ts';
import { createWorldSetup, type WorldSetup } from './worldSetup.ts';

export interface Engine extends WorldSetup {
  skylight?: Skylight;
  renderer?: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  meshes: ChunkMeshes;
  graphics: GraphicsControls;
  /** The scene's lights and fog, for time of day. Starts in daylight, which the benchmark keeps. */
  sky: SkyTargets;
  /** Bloom, grade, film and height fog. Everything starts off; play turns it on (benchmarks never do). */
  mood?: Mood;
  /** Sun and flashlight shadows. Everything starts off; play turns it on (benchmarks never do). */
  shadows?: Shadows;
}

export interface RenderedEngine extends Engine {
  renderer: WebGLRenderer;
  mood: Mood;
  shadows: Shadows;
}

export interface EngineOptions {
  /** Skip all WebGL initialization while retaining simulation, collision and CPU mesh streaming. */
  render?: boolean;
  graphicsSource?: 'player' | 'mod';
}

export function createEngine(
  config: GameConfig,
  view: HTMLElement,
  stats?: StreamerStats,
  options?: EngineOptions & { render?: true },
): RenderedEngine;
export function createEngine(
  config: GameConfig,
  view: HTMLElement,
  stats: StreamerStats | undefined,
  options: EngineOptions,
): Engine;
export function createEngine(
  config: GameConfig,
  view: HTMLElement,
  stats?: StreamerStats,
  { render = true, graphicsSource = 'player' }: EngineOptions = {},
): Engine {
  const { scale, radiusM } = config;
  const renderer = render ? new WebGLRenderer({ antialias: true }) : undefined;
  renderer?.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
  if (renderer) {
    renderer.localClippingEnabled = true;
    view.appendChild(renderer.domElement);
  }

  const scene = new Scene();
  const graphicsTuning = config.content.registry.graphics.get(CORE_CONTENT_IDS.coreGraphics);
  if (!graphicsTuning) {
    throw new Error('Missing core graphics policy');
  }
  // Short-relief optics belong to this scene too, not only to the optical adapter's closer camera.
  const camera = new PerspectiveCamera(graphicsTuning.playerViewFovDegrees, 1, graphicsTuning.nearPlaneMetres, radiusM);
  camera.rotation.order = 'YXZ';
  camera.layers.enable(PLAYER_FIGURE_LAYER);
  camera.layers.enable(OPTIC_BODY_LAYER);
  const sky: SkyTargets = {
    scene,
    light: new DirectionalLight(),
    ambient: new HemisphereLight(),
    camera,
    radiusM,
    farPlaneScale: config.fogFarPlaneScale,
  };
  // The sun sits in a rig so shadows can move its box with the player without touching the light's
  // direction (its position within the rig, which the hands' light copies, stays a unit vector).
  const sunRig = new Group();
  sunRig.add(sky.light, sky.light.target);
  scene.add(sky.ambient, sunRig);
  applySky(sky, skyAt(12, requireDayCycle(config.content.registry)));

  const meshes = new ChunkMeshes(scale.blockSize, config.content.registry);
  meshes.setWeathering(config.weathering, config.weatheringSplit);
  const worldSetup = createWorldSetup(config, meshes, stats);
  scene.add(meshes.group);
  // Chunk meshes are culled against their tight boxes, after three.js has updated the camera.
  const { skyFields } = worldSetup;
  const skylight =
    skyFields.fields.length > 0
      ? new Skylight(
          skyFields,
          {
            blockSize: scale.blockSize,
            viewRadiusM: radiusM,
            unbuiltCap: graphicsTuning.unbuiltSkyCap,
            skyJobsInFlight: graphicsTuning.skyJobsInFlight,
            buildRadiusM: (config.radiusChunks + graphicsTuning.skyPreloadRings) * CHUNK * scale.blockSize,
          },
          { submit: (input, receive) => worldSetup.streamer.requestSky(input, receive) },
        )
      : undefined;
  if (skylight) {
    worldSetup.streamer.onTerrainReady = (x, z) => skylight.prepare([x, 0, z]);
    worldSetup.streamer.onBeforeReveal = (cx, cz) => skyFields.finishColumn(cx, cz);
  }
  scene.onBeforeRender = (_renderer, _scene, cam) => {
    skylight?.update(scene, [
      camera.position.x / scale.blockSize,
      camera.position.y / scale.blockSize,
      camera.position.z / scale.blockSize,
    ]);
    meshes.cull(cam, scene.fog instanceof Fog ? scene.fog.far : undefined);
  };

  const mood = renderer ? new Mood(renderer, scene, camera, graphicsTuning) : undefined;
  const shadows = renderer ? new Shadows(renderer, scene, { light: sky.light, rig: sunRig }, meshes) : undefined;
  const graphics = new GraphicsControls(
    graphicsTuning,
    { meshes, ...(mood ? { mood } : {}), ...(shadows ? { shadows } : {}) },
    { source: graphicsSource, debug: config.debug, params: new URLSearchParams(globalThis.location?.search ?? '') },
  );

  const resize = () => {
    renderer?.setSize(view.clientWidth, view.clientHeight);
    mood?.setSize(view.clientWidth, view.clientHeight);
    camera.aspect = view.clientWidth / Math.max(view.clientHeight, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(view);

  return {
    ...worldSetup,
    ...(skylight ? { skylight } : {}),
    ...(renderer ? { renderer } : {}),
    scene,
    camera,
    meshes,
    graphics,
    sky,
    ...(mood ? { mood } : {}),
    ...(shadows ? { shadows } : {}),
  };
}
