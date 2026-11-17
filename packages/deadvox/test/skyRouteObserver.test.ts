import type { Engine } from '@skelly/presentation/play';
import type { Skylight } from '@skelly/presentation/render';
import { Texture } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { observeSkyRoute } from '../src/debug/skyRouteObserver.ts';

const fixture = () => {
  let clockRealMs = 0;
  let activeUnit = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clockRealMs);
  const uploadRealMs = 7;
  const noop = () => undefined;
  const upload = () => {
    clockRealMs += uploadRealMs;
  };
  const gl = new Proxy(
    {
      ACTIVE_TEXTURE: 'active-unit',
      getParameter: () => activeUnit,
      activeTexture: (unit: number) => {
        activeUnit = unit;
      },
      bindTexture: noop,
      texSubImage2D: upload,
      texSubImage3D: upload,
    } as Record<string, unknown>,
    { get: (target, name) => Reflect.get(target, name) ?? noop },
  ) as Record<string, (...args: unknown[]) => unknown>;
  const properties = new Map<Texture, { __webglTexture?: object }>();
  const getProperties = vi.fn((texture: Texture) => properties.get(texture) ?? {});
  const canvas = new EventTarget();
  const sky = { update: noop, at: () => 1, onShader: undefined as Skylight['onShader'] };
  const observer = observeSkyRoute(
    {
      skylight: sky,
      streamer: { requestSky: () => true, onSkyService: undefined },
      renderer: { getContext: () => gl, properties: { get: getProperties }, domElement: canvas },
    } as unknown as Engine,
    () => 'cold',
    [],
  );
  return {
    gl,
    sky,
    observer,
    canvas,
    properties,
    getProperties,
    uploadRealMs,
    restoreContext: () => {
      activeUnit = 0;
      canvas.dispatchEvent(new Event('webglcontextrestored'));
    },
  };
};
afterEach(() => vi.restoreAllMocks());

it('upload ownership deduplicates live sky uniform cells instead of revisiting shader records', () => {
  const { sky, gl, observer, properties, getProperties, uploadRealMs } = fixture();
  const texture = new Texture();
  const handle = {};
  properties.set(texture, Object.fromEntries([['__webglTexture', handle]]));
  const shared = { value: texture };
  const records = [
    { uSkyAtlas: shared, unrelated: { value: new Texture() } },
    { uSkyAtlas: shared, uSkyDaylight: { value: 1 } },
  ];
  const enumerations = records.map((record) => {
    const ownKeys = vi.fn(Reflect.ownKeys);
    sky.onShader!(new Proxy<typeof record>(record, { ownKeys }), 0);
    return ownKeys;
  });
  const registeredCalls = enumerations.map((calls) => calls.mock.calls.length);
  gl.bindTexture!('2d', handle);
  gl.texSubImage2D!('2d');
  expect(observer.cost.textureRealMs).toBe(uploadRealMs);
  getProperties.mockClear();
  gl.bindTexture!('2d', {});
  gl.texSubImage2D!('2d');
  expect(observer.cost.textureRealMs).toBe(uploadRealMs);
  expect(enumerations.map((calls) => calls.mock.calls.length)).toEqual(registeredCalls);
  expect(getProperties).toHaveBeenCalledTimes(1);
  observer.dispose();
});

it('upload ownership follows texture replacement and regenerated handles without crediting unbound textures', () => {
  const { sky, gl, observer, properties, uploadRealMs } = fixture();
  const texture = new Texture();
  const uniform = { value: texture };
  sky.onShader!({ uSkyAtlas: uniform }, 0);
  gl.texSubImage2D!('2d');
  expect(observer.cost.textureRealMs).toBe(0);
  const first = {};
  properties.set(texture, Object.fromEntries([['__webglTexture', first]]));
  gl.bindTexture!('2d', first);
  gl.texSubImage2D!('2d');
  const replacement = new Texture();
  const second = {};
  uniform.value = replacement;
  properties.set(replacement, Object.fromEntries([['__webglTexture', second]]));
  gl.texSubImage2D!('2d');
  expect(observer.cost.textureRealMs).toBe(uploadRealMs);
  gl.bindTexture!('2d', second);
  gl.texSubImage2D!('2d');
  const regenerated = {};
  properties.set(replacement, Object.fromEntries([['__webglTexture', regenerated]]));
  gl.texSubImage2D!('2d');
  expect(observer.cost.textureRealMs).toBe(2 * uploadRealMs);
  gl.bindTexture!('2d', regenerated);
  gl.texSubImage2D!('2d');
  expect(observer.cost.textureRealMs).toBe(3 * uploadRealMs);
  observer.dispose();
});

it('upload ownership uses the active texture unit and the independently bound target', () => {
  const { sky, gl, observer, properties, uploadRealMs } = fixture();
  const texture = new Texture();
  const handle = {};
  properties.set(texture, Object.fromEntries([['__webglTexture', handle]]));
  sky.onShader!({ uSkyAtlas: { value: texture } }, 0);
  gl.bindTexture!('2d', handle);
  gl.bindTexture!('3d', {});
  gl.activeTexture!(1);
  gl.bindTexture!('2d', {});
  gl.activeTexture!(0);
  gl.texSubImage2D!('2d');
  gl.texSubImage3D!('3d');
  gl.activeTexture!(1);
  gl.texSubImage2D!('2d');
  expect(observer.cost.textureRealMs).toBe(uploadRealMs);
  observer.dispose();
});

it('context restoration forgets bindings and disposal removes the observer hooks', () => {
  const { sky, gl, observer, properties, restoreContext, uploadRealMs } = fixture();
  const texture = new Texture();
  const handle = {};
  properties.set(texture, Object.fromEntries([['__webglTexture', handle]]));
  sky.onShader!({ uSkyAtlas: { value: texture } }, 0);
  gl.bindTexture!('2d', handle);
  gl.activeTexture!(1);
  gl.bindTexture!('2d', handle);
  gl.texSubImage2D!('2d');
  restoreContext();
  gl.texSubImage2D!('2d');
  expect(observer.cost.textureRealMs).toBe(uploadRealMs);
  const restored = {};
  properties.set(texture, Object.fromEntries([['__webglTexture', restored]]));
  gl.bindTexture!('2d', restored);
  gl.activeTexture!(1);
  gl.bindTexture!('2d', {});
  gl.activeTexture!(0);
  gl.texSubImage2D!('2d');
  expect(observer.cost.textureRealMs).toBe(2 * uploadRealMs);
  observer.dispose();
  restoreContext();
  gl.texSubImage2D!('2d');
  expect(observer.cost.textureRealMs).toBe(2 * uploadRealMs);
  expect(sky.onShader).toBeUndefined();
});
