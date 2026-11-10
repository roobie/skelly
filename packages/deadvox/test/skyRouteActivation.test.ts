import type { SkySnapshot } from '@skelly/engine/internal/core/skySnapshot.ts';
import { observeRealFrame } from '@skelly/engine/session';
import { realTimestamp } from '@skelly/engine/sim';
import type { SkyResult } from '@skelly/engine/sky';
import type { Engine } from '@skelly/presentation/play';
import type { Skylight } from '@skelly/presentation/render';
import { afterEach, expect, it, vi } from 'vitest';
import { attachSkyRoute, skyRouteUrl } from '../src/debug/skyRoute.ts';
import { SKY_ROUTE, type SkyRouteFrame } from '../src/debug/skyRouteMetrics.ts';
import { readPageUrl } from '../src/pageUrl.ts';

const witness = vi.hoisted(() => ({ json: '' }));
const inputFixture = vi.hoisted(() => ({ context: 'play', issued: [] as string[] }));
vi.mock('@skelly/presentation/internal/ui/skyRoutePanel.ts', () => ({
  createSkyRoutePanel: () => ({
    progress: () => undefined,
    started: () => undefined,
    complete: (_summary: string, json: string) => {
      witness.json = json;
    },
  }),
}));
const keyboard = {
  context: () => ({ context: inputFixture.context, debug: false }),
  registry: { binding: () => ({ contexts: ['play', 'noclip', 'build'] }) },
};
// The input entry loads the rest of this module too, so only the forwarded holds are replaced.
vi.mock('@skelly/presentation/internal/presentation/inputBindings.ts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  forwardedActionHolds: () => (action: string) => {
    inputFixture.issued.push(action);
    return () => undefined;
  },
}));
afterEach(() => {
  witness.json = '';
  inputFixture.context = 'play';
  inputFixture.issued.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('launches the route through a link the game reads back without refusing it', () => {
  vi.stubGlobal('location', { href: 'https://example.invalid/deadvox/?mods=fixture#{radius:64}' });
  const url = new URL(skyRouteUrl());
  const read = readPageUrl(url.search, url.hash);
  expect(read.refused).toBeUndefined();
  expect(read.query.get('skyRoute')).toBe('1');
  expect(read.hash).toMatchObject({ debug: true });
});

it('route activation excludes inactive rendered work without clearing startup jobs or censoring evidence', () => {
  let clockRealMs = 0;
  let active = false;
  const cost = { serviceRealMs: 3, textureRealMs: 5, uniformRealMs: 7, programRealMs: 11 };
  vi.spyOn(performance, 'now').mockImplementation(() => clockRealMs);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.stubGlobal('location', {
    href: 'https://example.invalid/?skyRoute=1#{debug:true}',
    origin: 'https://example.invalid',
    pathname: '/',
    search: '?skyRoute=1',
    hash: '#{debug:true}',
  });
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('navigator', { userAgent: 'owned-renderer-port' });
  const texture = { isTexture: true };
  const textureTarget = {};
  const textureHandle = {};
  const uniformLocation = {};
  const shader = {};
  const program = {};
  const noop = () => undefined;
  const gl = new Proxy(
    {
      getExtension: () => null,
      getParameter: () => 'owned-renderer',
      drawingBufferWidth: 1,
      drawingBufferHeight: 1,
      getUniformLocation: () => uniformLocation,
      compileShader: () => {
        clockRealMs += cost.programRealMs;
      },
      texSubImage3D: () => {
        clockRealMs += cost.textureRealMs;
      },
      uniform1f: () => {
        clockRealMs += cost.uniformRealMs;
      },
    } as Record<string, unknown>,
    { get: (target, name) => Reflect.get(target, name) ?? noop },
  ) as Record<string, (...args: unknown[]) => unknown>;
  const render = { frame: 0 };
  const stats = { requested: 0, completed: 0, accepted: 0, discarded: 0, volumes: 0, roofFree: 0 };
  const sky = {
    update: () => {
      clockRealMs += cost.serviceRealMs;
    },
    at: () => 1,
    inspect: () => [],
    stats,
    onShader: undefined as Skylight['onShader'],
  };
  const receipts: Parameters<Engine['streamer']['requestSky']>[1][] = [];
  const streamer = {
    onSkyService: undefined as Engine['streamer']['onSkyService'],
    requestSky: (_input: SkySnapshot, receive: (typeof receipts)[number]): boolean => {
      stats.requested += 1;
      receipts.push(receive);
      streamer.onSkyService?.(0);
      return true;
    },
  };
  const ports = {
    skylight: sky,
    streamer,
    renderer: {
      getContext: () => gl,
      info: { render },
      properties: { get: () => Object.fromEntries([['__webglTexture', textureHandle]]) },
    },
    config: { site: 'playtest', seed: 1, radiusM: 48, scale: { blockSize: 1, maxCy: 0 } },
    camera: { position: { toArray: () => [SKY_ROUTE.start, 0, SKY_ROUTE.z] } },
    entities: { all: [], isSolid: () => false },
    world: { getBlock: () => 0 },
    registry: { blocks: [{ id: 'air', solid: false, opaque: false }] },
  };
  const debug = {
    noclip: false,
    handleAction: () => {
      debug.noclip = !debug.noclip;
    },
  };
  const initialStats = { ...stats };
  const route = attachSkyRoute({
    engine: ports,
    session: { body: { pos: [SKY_ROUTE.start, 0, SKY_ROUTE.z] } },
    debug,
    active: () => active,
    keyboard,
  } as unknown as Parameters<typeof attachSkyRoute>[0]);
  if (!route) {
    throw new Error('Owned ports did not attach the route');
  }
  const frame = observeRealFrame(
    () => {
      sky.update();
      sky.onShader?.({ uSkyAtlas: { value: texture } }, 0);
      gl.shaderSource!(shader, 'vSkyWorld');
      gl.attachShader!(program, shader);
      gl.compileShader!(shader);
      gl.bindTexture!(textureTarget, textureHandle);
      gl.texSubImage3D!(textureTarget);
      gl.getUniformLocation!(program, 'uSkyFixture');
      gl.uniform1f!(uniformLocation, 0);
      render.frame += 1;
      return true;
    },
    () => route,
  );
  const input: SkySnapshot = {
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    bottom: 0,
    top: 0,
    chunks: [],
    furniture: [],
    opacity: new Uint8Array([0]),
    complete: false,
  };
  const result: SkyResult = { complete: false, heights: new Float32Array(1), volume: undefined };
  streamer.requestSky(input, noop);
  frame(realTimestamp(clockRealMs));
  const completed = receipts.shift();
  if (!completed) {
    throw new Error('No startup request to complete');
  }
  completed(result, 0);
  stats.completed += 1;
  streamer.requestSky(input, noop);
  for (let index = 0; index < 3; index++) {
    frame(realTimestamp(clockRealMs));
  }
  active = true;
  frame(realTimestamp(clockRealMs));
  active = false;
  frame(realTimestamp(clockRealMs));
  const evidence = JSON.parse(witness.json);
  expect(evidence.frames).toHaveLength(1);
  const measured = evidence.frames[0] as SkyRouteFrame;
  for (const [name, ownCost] of Object.entries(cost)) {
    expect(measured[name as keyof typeof cost]).toBe(ownCost);
  }
  const activeFrameCost = Object.values(cost).reduce((sum, value) => sum + value, 0);
  expect(measured.frameRealMs).toBe(activeFrameCost);
  expect(measured.lightingRealMs).toBe(activeFrameCost);
  expect(evidence.cold.lightingMaxRealMs).toBe(measured.lightingRealMs);
  expect(evidence.initialStats).toEqual(initialStats);
  expect(evidence.finalStats.requested).toBe(2);
  expect(evidence.jobs).toHaveLength(2);
  expect(evidence.completedJobDenominator).toBe(1);
  expect(evidence.censoredJobDenominator).toBe(1);
  expect(evidence.jobs[1].latencyRealMs).toBeNull();
});

it('waits for the input owner to permit play before starting the route', () => {
  let active = false;
  const noop = () => undefined;
  vi.stubGlobal('location', {
    href: 'https://example.invalid/?skyRoute=1#{debug:true}',
    origin: 'https://example.invalid',
    pathname: '/',
    search: '?skyRoute=1',
    hash: '#{debug:true}',
  });
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('navigator', { userAgent: 'owned-renderer-port' });
  const gl = new Proxy(
    {
      getExtension: () => null,
      getParameter: () => 'owned-renderer',
      drawingBufferWidth: 1,
      drawingBufferHeight: 1,
    } as Record<string, unknown>,
    { get: (target, name) => Reflect.get(target, name) ?? noop },
  ) as Record<string, (...args: unknown[]) => unknown>;
  const sky = {
    update: noop,
    at: () => 1,
    inspect: () => [],
    stats: { requested: 0, completed: 0, accepted: 0, discarded: 0, volumes: 0, roofFree: 0 },
    onShader: undefined as Skylight['onShader'],
  };
  const debug = {
    noclip: false,
    handleAction: () => {
      debug.noclip = !debug.noclip;
    },
  };
  const engine = {
    skylight: sky,
    streamer: { onSkyService: undefined, requestSky: () => true },
    renderer: { getContext: () => gl, info: { render: { frame: 0 } }, properties: { get: () => ({}) } },
    config: { site: 'playtest', seed: 1, radiusM: 48, scale: { blockSize: 1, maxCy: 0 } },
    camera: { position: { toArray: () => [SKY_ROUTE.start, 0, SKY_ROUTE.z] } },
    entities: { all: [] },
  };
  const route = attachSkyRoute({
    engine,
    session: { body: { pos: [SKY_ROUTE.start, 0, SKY_ROUTE.z] } },
    debug,
    active: () => active,
    keyboard,
  } as unknown as Parameters<typeof attachSkyRoute>[0]);
  if (!route) {
    throw new Error('Owned ports did not attach the route');
  }
  inputFixture.context = 'title';
  active = true;
  route.before();
  expect(inputFixture.issued).toEqual([]);
  inputFixture.context = 'play';
  route.before();
  expect(inputFixture.issued).toContain('movement.sprint');
  expect(inputFixture.issued).toContain('movement.forward');
});
